//go:build windows

// windows-safeio is the Windows filesystem security boundary shared by the
// Python desktop MVP and the Code-OSS built-in extension. It rejects reparse
// points, pins the workspace root and ancestor directories without
// FILE_SHARE_DELETE, and performs replacement/deletion through verified
// handles so project I/O cannot be redirected outside the selected workspace
// by a junction/symlink swap.
package main

import (
	"crypto/rand"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

const (
	genericRead        = 0x80000000
	genericWrite       = 0x40000000
	deleteAccess       = 0x00010000
	fileListDirectory  = 0x00000001
	fileReadAttributes = 0x00000080

	fileShareRead  = 0x00000001
	fileShareWrite = 0x00000002

	createNew    = 1
	openExisting = 3
	openAlways   = 4

	fileAttributeDirectory    = 0x00000010
	fileAttributeNormal       = 0x00000080
	fileAttributeReparsePoint = 0x00000400

	fileFlagBackupSemantics  = 0x02000000
	fileFlagOpenReparsePoint = 0x00200000

	fileBasicInfo       = 0
	fileRenameInfo      = 3
	fileDispositionInfo = 4
	fileIDInfo          = 18

	errorFileNotFound  = 2
	errorPathNotFound  = 3
	errorAlreadyExists = 183

	driveRemote = 4
)

var (
	kernel32 = syscall.NewLazyDLL("kernel32.dll")
	ntdll    = syscall.NewLazyDLL("ntdll.dll")

	procCreateFileW                  = kernel32.NewProc("CreateFileW")
	procCreateDirectoryW             = kernel32.NewProc("CreateDirectoryW")
	procCloseHandle                  = kernel32.NewProc("CloseHandle")
	procGetFileInformationByHandleEx = kernel32.NewProc("GetFileInformationByHandleEx")
	procSetFileInformationByHandle   = kernel32.NewProc("SetFileInformationByHandle")
	procReadFile                     = kernel32.NewProc("ReadFile")
	procWriteFile                    = kernel32.NewProc("WriteFile")
	procFlushFileBuffers             = kernel32.NewProc("FlushFileBuffers")
	procSetFilePointerEx             = kernel32.NewProc("SetFilePointerEx")
	procGetDriveTypeW                = kernel32.NewProc("GetDriveTypeW")
	procGetFileInformationByHandle   = kernel32.NewProc("GetFileInformationByHandle")
	procGetFinalPathNameByHandleW    = kernel32.NewProc("GetFinalPathNameByHandleW")

	procNtSetInformationFile         = ntdll.NewProc("NtSetInformationFile")
)

type ioStatusBlock struct {
	Status      uintptr
	Information uintptr
}

type byHandleFileInformation struct {
	FileAttributes     uint32
	CreationTimeLow    uint32
	CreationTimeHigh   uint32
	LastAccessTimeLow  uint32
	LastAccessTimeHigh uint32
	LastWriteTimeLow   uint32
	LastWriteTimeHigh  uint32
	VolumeSerialNumber uint32
	FileSizeHigh       uint32
	FileSizeLow        uint32
	NumberOfLinks      uint32
	FileIndexHigh      uint32
	FileIndexLow       uint32
}

type fileBasicInfoData struct {
	CreationTime   int64
	LastAccessTime int64
	LastWriteTime  int64
	ChangeTime     int64
	FileAttributes uint32
	_              uint32
}

type fileIDInfoData struct {
	VolumeSerialNumber uint64
	FileID             [16]byte
}

type pinnedWorkspace struct {
	rootPath  string
	finalRoot string
	rootID    string
	handles   []syscall.Handle
}

func winErr(name string, errno syscall.Errno) error {
	if errno == 0 {
		return fmt.Errorf("%s failed", name)
	}
	return fmt.Errorf("%s failed: %w", name, errno)
}

func createFile(path string, access, share, creation, flags uint32) (syscall.Handle, error) {
	p, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return syscall.InvalidHandle, err
	}
	r, _, callErr := procCreateFileW.Call(
		uintptr(unsafe.Pointer(p)),
		uintptr(access),
		uintptr(share),
		0,
		uintptr(creation),
		uintptr(flags),
		0,
	)
	h := syscall.Handle(r)
	if h == syscall.InvalidHandle {
		errno, _ := callErr.(syscall.Errno)
		return syscall.InvalidHandle, winErr("CreateFileW", errno)
	}
	return h, nil
}

func closeHandle(h syscall.Handle) {
	if h != 0 && h != syscall.InvalidHandle {
		procCloseHandle.Call(uintptr(h))
	}
}

func basicInfo(h syscall.Handle) (fileBasicInfoData, error) {
	var info fileBasicInfoData
	r, _, callErr := procGetFileInformationByHandleEx.Call(
		uintptr(h),
		uintptr(fileBasicInfo),
		uintptr(unsafe.Pointer(&info)),
		unsafe.Sizeof(info),
	)
	if r == 0 {
		errno, _ := callErr.(syscall.Errno)
		return info, winErr("GetFileInformationByHandleEx(FileBasicInfo)", errno)
	}
	return info, nil
}

func identityForHandle(h syscall.Handle) (string, error) {
	var info fileIDInfoData
	r, _, callErr := procGetFileInformationByHandleEx.Call(
		uintptr(h),
		uintptr(fileIDInfo),
		uintptr(unsafe.Pointer(&info)),
		unsafe.Sizeof(info),
	)
	if r == 0 {
		errno, _ := callErr.(syscall.Errno)
		return "", winErr("GetFileInformationByHandleEx(FileIdInfo)", errno)
	}
	return fmt.Sprintf("%016x:%s", info.VolumeSerialNumber, hex.EncodeToString(info.FileID[:])), nil
}

func rejectReparseOrWrongType(h syscall.Handle, wantDirectory bool, label string) error {
	info, err := basicInfo(h)
	if err != nil {
		return err
	}
	if info.FileAttributes&fileAttributeReparsePoint != 0 {
		return fmt.Errorf("reparse point blocked: %s", label)
	}
	isDir := info.FileAttributes&fileAttributeDirectory != 0
	if wantDirectory && !isDir {
		return fmt.Errorf("expected directory: %s", label)
	}
	if !wantDirectory && isDir {
		return fmt.Errorf("expected file: %s", label)
	}
	return nil
}

func validateLocalRoot(root string) (string, error) {
	if strings.TrimSpace(root) == "" {
		return "", errors.New("workspace root is empty")
	}
	clean, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	clean = filepath.Clean(clean)
	if strings.HasPrefix(clean, `\\`) {
		return "", errors.New("UNC/device/network workspaces are not supported by Windows safe I/O")
	}
	volume := filepath.VolumeName(clean)
	if len(volume) != 2 || volume[1] != ':' {
		return "", fmt.Errorf("workspace root must be on a local drive: %s", clean)
	}
	driveRoot := volume + `\`
	drivePtr, err := syscall.UTF16PtrFromString(driveRoot)
	if err != nil {
		return "", err
	}
	driveType, _, _ := procGetDriveTypeW.Call(uintptr(unsafe.Pointer(drivePtr)))
	if driveType == driveRemote {
		return "", fmt.Errorf("network-mapped workspaces are not supported by Windows safe I/O: %s", driveRoot)
	}
	return clean, nil
}

func isReservedDosName(name string) bool {
	stem := strings.ToUpper(name)
	if dot := strings.IndexByte(stem, '.'); dot >= 0 {
		stem = stem[:dot]
	}
	stem = strings.TrimSpace(stem)
	switch stem {
	case "CON", "PRN", "AUX", "NUL",
		"COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
		"COM¹", "COM²", "COM³",
		"LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
		"LPT¹", "LPT²", "LPT³":
		return true
	default:
		return false
	}
}

func cleanFinalPath(p string) string {
	if strings.HasPrefix(p, `\\?\UNC\`) {
		p = `\\` + strings.TrimPrefix(p, `\\?\UNC\`)
	} else if strings.HasPrefix(p, `\\?\`) {
		p = strings.TrimPrefix(p, `\\?\`)
	}
	return filepath.Clean(p)
}

func normalizeDriveLetter(p string) string {
	vol := filepath.VolumeName(p)
	if len(vol) >= 2 && vol[1] == ':' {
		return strings.ToUpper(vol[:1]) + p[1:]
	}
	return p
}

func finalPathForHandle(h syscall.Handle) (string, error) {
	var buf [syscall.MAX_PATH + 1]uint16
	r, _, callErr := procGetFinalPathNameByHandleW.Call(
		uintptr(h),
		uintptr(unsafe.Pointer(&buf[0])),
		uintptr(len(buf)),
		0, // FILE_NAME_NORMALIZED | VOLUME_NAME_DOS
	)
	if r == 0 {
		errno, _ := callErr.(syscall.Errno)
		return "", winErr("GetFinalPathNameByHandleW", errno)
	}
	if r > uintptr(len(buf)) {
		bigBuf := make([]uint16, r+1)
		r2, _, callErr2 := procGetFinalPathNameByHandleW.Call(
			uintptr(h),
			uintptr(unsafe.Pointer(&bigBuf[0])),
			uintptr(len(bigBuf)),
			0,
		)
		if r2 == 0 || r2 > uintptr(len(bigBuf)) {
			errno, _ := callErr2.(syscall.Errno)
			return "", winErr("GetFinalPathNameByHandleW", errno)
		}
		return cleanFinalPath(syscall.UTF16ToString(bigBuf[:r2])), nil
	}
	return cleanFinalPath(syscall.UTF16ToString(buf[:r])), nil
}

func isControlComponent(name string) bool {
	clean := strings.ToLower(strings.TrimRight(name, ". "))
	return clean == ".ai-coder"
}

func verifyHandleNormalizedPath(finalRoot string, h syscall.Handle, label string, allowControl bool) error {
	finalPath, err := finalPathForHandle(h)
	if err != nil {
		return fmt.Errorf("could not get normalized final path for %s: %w", label, err)
	}
	cleanRoot := normalizeDriveLetter(filepath.Clean(finalRoot))
	cleanFinal := normalizeDriveLetter(finalPath)
	if !strings.EqualFold(filepath.VolumeName(cleanRoot), filepath.VolumeName(cleanFinal)) {
		return fmt.Errorf("handle-normalized path on different volume: %s (resolved to %s)", label, finalPath)
	}
	rel, err := filepath.Rel(cleanRoot, cleanFinal)
	if err != nil || rel == ".." || strings.HasPrefix(rel, `..\`) || strings.HasPrefix(rel, `../`) {
		return fmt.Errorf("handle-normalized path escapes workspace root: %s (resolved to %s)", label, finalPath)
	}
	if rel == "." {
		return nil
	}
	parts := strings.Split(filepath.ToSlash(rel), "/")
	for _, part := range parts {
		if !allowControl && isControlComponent(part) {
			return fmt.Errorf("protected control path blocked by handle normalization: %s (resolved component: %s)", label, part)
		}
		if isReservedDosName(part) {
			return fmt.Errorf("reserved DOS device name blocked by handle normalization: %s (resolved component: %s)", label, part)
		}
	}
	return nil
}

func splitRelative(rel string, allowControl bool) ([]string, error) {
	if strings.IndexByte(rel, 0) >= 0 {
		return nil, errors.New("relative path contains NUL")
	}
	raw := strings.TrimSpace(strings.ReplaceAll(rel, `\`, "/"))
	if raw == "" || strings.HasPrefix(raw, "/") || strings.Contains(raw, ":") {
		return nil, fmt.Errorf("unsafe relative path: %s", rel)
	}
	pieces := strings.Split(raw, "/")
	parts := make([]string, 0, len(pieces))
	for _, part := range pieces {
		if part == "" || part == "." || part == ".." {
			return nil, fmt.Errorf("unsafe relative path: %s", rel)
		}
		if strings.HasSuffix(part, ".") || strings.HasSuffix(part, " ") {
			return nil, fmt.Errorf("unsafe path component with trailing dot or space: %s", part)
		}
		if strings.HasPrefix(part, " ") {
			return nil, fmt.Errorf("unsafe path component with leading space: %s", part)
		}
		if !allowControl && isControlComponent(part) {
			return nil, fmt.Errorf("protected control path blocked: %s (component: %s)", rel, part)
		}
		if isReservedDosName(part) {
			return nil, fmt.Errorf("reserved DOS device name blocked: %s", part)
		}
		for i := 0; i < len(part); i++ {
			c := part[i]
			if c < 0x20 || c == '<' || c == '>' || c == '"' || c == '|' || c == '?' || c == '*' {
				return nil, fmt.Errorf("invalid character in path component: %s", part)
			}
		}
		parts = append(parts, part)
	}
	return parts, nil
}

func openPinnedDirectory(path string) (syscall.Handle, error) {
	h, err := createFile(
		path,
		fileListDirectory|fileReadAttributes,
		fileShareRead|fileShareWrite, // deliberately omit FILE_SHARE_DELETE
		openExisting,
		fileFlagBackupSemantics|fileFlagOpenReparsePoint,
	)
	if err != nil {
		return syscall.InvalidHandle, err
	}
	if err := rejectReparseOrWrongType(h, true, path); err != nil {
		closeHandle(h)
		return syscall.InvalidHandle, err
	}
	return h, nil
}

func createDirectory(path string) error {
	p, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return err
	}
	r, _, callErr := procCreateDirectoryW.Call(uintptr(unsafe.Pointer(p)), 0)
	if r != 0 {
		return nil
	}
	errno, _ := callErr.(syscall.Errno)
	if uintptr(errno) == errorAlreadyExists {
		return nil
	}
	return winErr("CreateDirectoryW", errno)
}

func pinWorkspace(root, expectedID string) (*pinnedWorkspace, error) {
	clean, err := validateLocalRoot(root)
	if err != nil {
		return nil, err
	}
	h, err := openPinnedDirectory(clean)
	if err != nil {
		return nil, err
	}
	id, err := identityForHandle(h)
	if err != nil {
		closeHandle(h)
		return nil, err
	}
	if expectedID != "" && !strings.EqualFold(expectedID, id) {
		closeHandle(h)
		return nil, fmt.Errorf("workspace identity changed: expected %s, got %s", expectedID, id)
	}
	finalRoot, err := finalPathForHandle(h)
	if err != nil {
		closeHandle(h)
		return nil, err
	}
	return &pinnedWorkspace{
		rootPath:  clean,
		finalRoot: normalizeDriveLetter(finalRoot),
		rootID:    id,
		handles:   []syscall.Handle{h},
	}, nil
}

func (p *pinnedWorkspace) close() {
	for i := len(p.handles) - 1; i >= 0; i-- {
		closeHandle(p.handles[i])
	}
	p.handles = nil
}

func (p *pinnedWorkspace) pinDirectories(parts []string, create bool, allowControl bool) (string, syscall.Handle, error) {
	current := p.rootPath
	parent := p.handles[0]
	for _, part := range parts {
		current = filepath.Join(current, part)
		if create {
			if err := createDirectory(current); err != nil {
				return "", syscall.InvalidHandle, err
			}
		}
		h, err := openPinnedDirectory(current)
		if err != nil {
			return "", syscall.InvalidHandle, err
		}
		if err := verifyHandleNormalizedPath(p.finalRoot, h, current, allowControl); err != nil {
			closeHandle(h)
			return "", syscall.InvalidHandle, err
		}
		p.handles = append(p.handles, h)
		parent = h
	}
	return current, parent, nil
}

func (p *pinnedWorkspace) pinParent(rel string, create bool, allowControl bool) (string, syscall.Handle, string, error) {
	parts, err := splitRelative(rel, allowControl)
	if err != nil {
		return "", syscall.InvalidHandle, "", err
	}
	if len(parts) == 0 {
		return "", syscall.InvalidHandle, "", errors.New("workspace root is not a file")
	}
	parentPath, parentHandle, err := p.pinDirectories(parts[:len(parts)-1], create, allowControl)
	if err != nil {
		return "", syscall.InvalidHandle, "", err
	}
	return parentPath, parentHandle, parts[len(parts)-1], nil
}

func isNotFound(err error) bool {
	if err == nil {
		return false
	}
	var errno syscall.Errno
	if errors.As(err, &errno) {
		return uintptr(errno) == errorFileNotFound || uintptr(errno) == errorPathNotFound
	}
	text := strings.ToLower(err.Error())
	return strings.Contains(text, "file not found") || strings.Contains(text, "path not found")
}

func rejectHardLink(h syscall.Handle, label string) error {
	var info byHandleFileInformation
	r, _, callErr := procGetFileInformationByHandle.Call(
		uintptr(h),
		uintptr(unsafe.Pointer(&info)),
	)
	if r == 0 {
		errno, _ := callErr.(syscall.Errno)
		return winErr("GetFileInformationByHandle", errno)
	}
	if info.NumberOfLinks > 1 {
		return fmt.Errorf("hard-linked file blocked: %s (link count: %d)", label, info.NumberOfLinks)
	}
	return nil
}

func openCheckedFile(path string, access uint32, rootPath string, allowControl bool) (syscall.Handle, error) {
	h, err := createFile(
		path,
		access|fileReadAttributes,
		fileShareRead|fileShareWrite, // pin final object against rename/delete
		openExisting,
		fileFlagOpenReparsePoint,
	)
	if err != nil {
		return syscall.InvalidHandle, err
	}
	if err := rejectReparseOrWrongType(h, false, path); err != nil {
		closeHandle(h)
		return syscall.InvalidHandle, err
	}
	if err := rejectHardLink(h, path); err != nil {
		closeHandle(h)
		return syscall.InvalidHandle, err
	}
	if rootPath != "" {
		if err := verifyHandleNormalizedPath(rootPath, h, path, allowControl); err != nil {
			closeHandle(h)
			return syscall.InvalidHandle, err
		}
	}
	return h, nil
}

func validateTarget(root, expected, rel string, allowControl bool) (string, error) {
	parts, err := splitRelative(rel, allowControl)
	if err != nil {
		return "", err
	}
	p, err := pinWorkspace(root, expected)
	if err != nil {
		return "", err
	}
	defer p.close()

	current := p.rootPath
	for i, part := range parts[:len(parts)-1] {
		next := filepath.Join(current, part)
		h, err := openPinnedDirectory(next)
		if err != nil {
			if isNotFound(err) {
				// A missing descendant cannot currently be a reparse point. Return the
				// lexical target; any later write re-pins/creates every component.
				return filepath.Join(append([]string{current}, parts[i:]...)...), nil
			}
			return "", err
		}
		if err := verifyHandleNormalizedPath(p.finalRoot, h, next, allowControl); err != nil {
			closeHandle(h)
			return "", err
		}
		p.handles = append(p.handles, h)
		current = next
	}

	target := filepath.Join(current, parts[len(parts)-1])
	h, err := createFile(target, fileReadAttributes, fileShareRead|fileShareWrite, openExisting, fileFlagOpenReparsePoint|fileFlagBackupSemantics)
	if err != nil {
		if isNotFound(err) {
			return target, nil
		}
		return "", err
	}
	defer closeHandle(h)
	info, err := basicInfo(h)
	if err != nil {
		return "", err
	}
	if info.FileAttributes&fileAttributeReparsePoint != 0 {
		return "", fmt.Errorf("reparse point blocked: %s", target)
	}
	if info.FileAttributes&fileAttributeDirectory == 0 {
		if err := rejectHardLink(h, target); err != nil {
			return "", err
		}
	}
	if err := verifyHandleNormalizedPath(p.finalRoot, h, target, allowControl); err != nil {
		return "", err
	}
	return target, nil
}

func readFile(root, expected, rel string, out io.Writer, allowControl bool) error {
	p, err := pinWorkspace(root, expected)
	if err != nil {
		return err
	}
	defer p.close()
	parentPath, _, name, err := p.pinParent(rel, false, allowControl)
	if err != nil {
		return err
	}
	target := filepath.Join(parentPath, name)
	h, err := openCheckedFile(target, genericRead, p.finalRoot, allowControl)
	if err != nil {
		return err
	}
	defer closeHandle(h)

	buf := make([]byte, 64*1024)
	for {
		var n uint32
		r, _, callErr := procReadFile.Call(
			uintptr(h),
			uintptr(unsafe.Pointer(&buf[0])),
			uintptr(len(buf)),
			uintptr(unsafe.Pointer(&n)),
			0,
		)
		if r == 0 {
			errno, _ := callErr.(syscall.Errno)
			return winErr("ReadFile", errno)
		}
		if n == 0 {
			return nil
		}
		if _, err := out.Write(buf[:n]); err != nil {
			return err
		}
	}
}

func writeHandle(h syscall.Handle, data []byte) error {
	for len(data) > 0 {
		var n uint32
		r, _, callErr := procWriteFile.Call(
			uintptr(h),
			uintptr(unsafe.Pointer(&data[0])),
			uintptr(len(data)),
			uintptr(unsafe.Pointer(&n)),
			0,
		)
		if r == 0 {
			errno, _ := callErr.(syscall.Errno)
			return winErr("WriteFile", errno)
		}
		if n == 0 {
			return errors.New("short write while staging workspace file")
		}
		data = data[n:]
	}
	return nil
}

func flushHandle(h syscall.Handle) error {
	r, _, callErr := procFlushFileBuffers.Call(uintptr(h))
	if r == 0 {
		errno, _ := callErr.(syscall.Errno)
		return winErr("FlushFileBuffers", errno)
	}
	return nil
}

func setDisposition(h syscall.Handle, delete bool) error {
	var value uint32
	if delete {
		value = 1
	}
	r, _, callErr := procSetFileInformationByHandle.Call(
		uintptr(h),
		uintptr(fileDispositionInfo),
		uintptr(unsafe.Pointer(&value)),
		unsafe.Sizeof(value),
	)
	if r == 0 {
		errno, _ := callErr.(syscall.Errno)
		return winErr("SetFileInformationByHandle(FileDispositionInfo)", errno)
	}
	return nil
}

func renameHandleInto(h syscall.Handle, parent syscall.Handle, name string) error {
	if strings.ContainsAny(name, `/\\:`) || name == "" || name == "." || name == ".." {
		return fmt.Errorf("unsafe destination name: %s", name)
	}
	utf16Name, err := syscall.UTF16FromString(name)
	if err != nil {
		return err
	}
	utf16Name = utf16Name[:len(utf16Name)-1]
	nameBytes := len(utf16Name) * 2

	ptrSize := int(unsafe.Sizeof(uintptr(0)))
	rootOffset, lenOffset, nameOffset := 4, 8, 12
	if ptrSize == 8 {
		rootOffset, lenOffset, nameOffset = 8, 16, 20
	}
	buf := make([]byte, nameOffset+nameBytes)
	// FILE_RENAME_INFORMATION for NtSetInformationFile uses BOOLEAN ReplaceIfExists at byte 0.
	buf[0] = 1
	if ptrSize == 8 {
		binary.LittleEndian.PutUint64(buf[rootOffset:rootOffset+8], uint64(parent))
	} else {
		binary.LittleEndian.PutUint32(buf[rootOffset:rootOffset+4], uint32(parent))
	}
	binary.LittleEndian.PutUint32(buf[lenOffset:lenOffset+4], uint32(nameBytes))
	for i, v := range utf16Name {
		binary.LittleEndian.PutUint16(buf[nameOffset+i*2:nameOffset+i*2+2], v)
	}
	var iosb ioStatusBlock
	const fileRenameInformationClass = 10
	r, _, _ := procNtSetInformationFile.Call(
		uintptr(h),
		uintptr(unsafe.Pointer(&iosb)),
		uintptr(unsafe.Pointer(&buf[0])),
		uintptr(len(buf)),
		uintptr(fileRenameInformationClass),
	)
	if r != 0 {
		return fmt.Errorf("NtSetInformationFile(FileRenameInformation) failed: 0x%08x", uint32(r))
	}
	return nil
}

func existingTargetIsSafe(rootPath, target string, allowControl bool) error {
	h, err := createFile(target, fileReadAttributes, fileShareRead|fileShareWrite|0x4, openExisting, fileFlagOpenReparsePoint|fileFlagBackupSemantics)
	if err != nil {
		if isNotFound(err) {
			return nil
		}
		return err
	}
	defer closeHandle(h)
	info, err := basicInfo(h)
	if err != nil {
		return err
	}
	if info.FileAttributes&fileAttributeReparsePoint != 0 {
		return fmt.Errorf("reparse point blocked: %s", target)
	}
	if info.FileAttributes&fileAttributeDirectory != 0 {
		return fmt.Errorf("expected file: %s", target)
	}
	if err := rejectHardLink(h, target); err != nil {
		return err
	}
	if rootPath != "" {
		if err := verifyHandleNormalizedPath(rootPath, h, target, allowControl); err != nil {
			return err
		}
	}
	return nil
}

func writeFile(root, expected, rel string, data []byte, allowControl bool) error {
	p, err := pinWorkspace(root, expected)
	if err != nil {
		return err
	}
	defer p.close()
	parentPath, parentHandle, name, err := p.pinParent(rel, true, allowControl)
	if err != nil {
		return err
	}
	target := filepath.Join(parentPath, name)
	if err := existingTargetIsSafe(p.finalRoot, target, allowControl); err != nil {
		return err
	}

	random := make([]byte, 8)
	if _, err := rand.Read(random); err != nil {
		return err
	}
	tempName := fmt.Sprintf(".%s.ai-coder-%d-%s.tmp", name, os.Getpid(), hex.EncodeToString(random))
	tempPath := filepath.Join(parentPath, tempName)
	h, err := createFile(
		tempPath,
		genericWrite|deleteAccess|fileReadAttributes,
		fileShareRead,
		createNew,
		fileAttributeNormal|fileFlagOpenReparsePoint,
	)
	if err != nil {
		return err
	}
	renamed := false
	defer func() {
		if !renamed {
			_ = setDisposition(h, true)
		}
		closeHandle(h)
	}()

	if err := writeHandle(h, data); err != nil {
		return err
	}
	if err := flushHandle(h); err != nil {
		return err
	}
	if err := renameHandleInto(h, parentHandle, name); err != nil {
		return err
	}
	renamed = true
	return nil
}

func appendFile(root, expected, rel string, data []byte, allowControl bool) error {
	p, err := pinWorkspace(root, expected)
	if err != nil {
		return err
	}
	defer p.close()
	parentPath, _, name, err := p.pinParent(rel, true, allowControl)
	if err != nil {
		return err
	}
	target := filepath.Join(parentPath, name)
	h, err := createFile(
		target,
		genericWrite|fileReadAttributes,
		fileShareRead, // omit FILE_SHARE_DELETE so the opened target stays pinned
		openAlways,
		fileAttributeNormal|fileFlagOpenReparsePoint,
	)
	if err != nil {
		return err
	}
	defer closeHandle(h)
	if err := rejectReparseOrWrongType(h, false, target); err != nil {
		return err
	}
	if err := rejectHardLink(h, target); err != nil {
		return err
	}
	if err := verifyHandleNormalizedPath(p.finalRoot, h, target, allowControl); err != nil {
		return err
	}
	var newPos int64
	r, _, callErr := procSetFilePointerEx.Call(
		uintptr(h),
		0, // distance 0
		uintptr(unsafe.Pointer(&newPos)),
		uintptr(2), // FILE_END
	)
	if r == 0 {
		errno, _ := callErr.(syscall.Errno)
		return winErr("SetFilePointerEx", errno)
	}
	if err := writeHandle(h, data); err != nil {
		return err
	}
	return flushHandle(h)
}

func deleteFile(root, expected, rel string, allowControl bool) error {
	p, err := pinWorkspace(root, expected)
	if err != nil {
		return err
	}
	defer p.close()
	parentPath, _, name, err := p.pinParent(rel, false, allowControl)
	if err != nil {
		return err
	}
	target := filepath.Join(parentPath, name)
	h, err := openCheckedFile(target, deleteAccess, p.finalRoot, allowControl)
	if err != nil {
		if isNotFound(err) {
			return nil
		}
		return err
	}
	defer closeHandle(h)
	return setDisposition(h, true)
}

func ensureDirectory(root, expected, rel string, allowControl bool) (string, error) {
	parts, err := splitRelative(rel, allowControl)
	if err != nil {
		return "", err
	}
	p, err := pinWorkspace(root, expected)
	if err != nil {
		return "", err
	}
	defer p.close()
	finalPath, _, err := p.pinDirectories(parts, true, allowControl)
	if err != nil {
		return "", err
	}
	return finalPath, nil
}

func testHoldParent(root, expected, rel string) error {
	if os.Getenv("AI_CODER_SAFEIO_TEST_HOOKS") != "1" {
		return errors.New("test-hold-parent is disabled")
	}
	p, err := pinWorkspace(root, expected)
	if err != nil {
		return err
	}
	defer p.close()
	if _, _, _, err := p.pinParent(rel, false, false); err != nil {
		return err
	}
	ready := os.Getenv("AI_CODER_SAFEIO_TEST_READY_FILE")
	cont := os.Getenv("AI_CODER_SAFEIO_TEST_CONTINUE_FILE")
	if ready == "" || cont == "" {
		return errors.New("test hook ready/continue files are required")
	}
	if err := os.WriteFile(ready, []byte("ready"), 0600); err != nil {
		return err
	}
	deadline := time.Now().Add(10 * time.Second)
	for {
		if _, err := os.Stat(cont); err == nil {
			return nil
		} else if !os.IsNotExist(err) {
			return err
		}
		if time.Now().After(deadline) {
			return errors.New("test hook timed out waiting for continue file")
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func parseCommon(command string, args []string) (root, expected, rel string, allowControl bool, rest []string, err error) {
	fs := flag.NewFlagSet(command, flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	fs.StringVar(&root, "root", "", "workspace root")
	fs.StringVar(&expected, "expected-root-id", "", "expected volume/file identity")
	fs.BoolVar(&allowControl, "allow-control", false, "allow control path operations")
	if command != "identity" {
		fs.StringVar(&rel, "rel", "", "workspace-relative path")
	}
	if e := fs.Parse(args); e != nil {
		return "", "", "", false, nil, e
	}
	if root == "" {
		return "", "", "", false, nil, errors.New("--root is required")
	}
	if command != "identity" && rel == "" {
		return "", "", "", false, nil, errors.New("--rel is required")
	}
	return root, expected, rel, allowControl, fs.Args(), nil
}

func printVersion() error {
	info := map[string]interface{}{
		"protocol":         1,
		"arch":             "windows/amd64",
		"go_version":       runtime.Version(),
		"build_provenance": "AI-CODER-MVP-SafeIO-v0.4.6",
	}
	b, err := json.Marshal(info)
	if err != nil {
		return err
	}
	fmt.Println(string(b))
	return nil
}

func run() error {
	if len(os.Args) < 2 {
		return errors.New("usage: windows-safeio <identity|validate|read|write|append|delete|mkdir|version|test-hold-parent> --root PATH [--expected-root-id ID] [--rel PATH] [--allow-control]")
	}
	command := strings.ToLower(os.Args[1])
	if command == "version" {
		return printVersion()
	}
	root, expected, rel, allowControl, _, err := parseCommon(command, os.Args[2:])
	if err != nil {
		return err
	}

	switch command {
	case "identity":
		p, err := pinWorkspace(root, "")
		if err != nil {
			return err
		}
		defer p.close()
		_, err = fmt.Fprintln(os.Stdout, p.rootID)
		return err
	case "validate":
		target, err := validateTarget(root, expected, rel, allowControl)
		if err != nil {
			return err
		}
		_, err = fmt.Fprintln(os.Stdout, target)
		return err
	case "read":
		return readFile(root, expected, rel, os.Stdout, allowControl)
	case "write":
		data, err := io.ReadAll(os.Stdin)
		if err != nil {
			return err
		}
		return writeFile(root, expected, rel, data, allowControl)
	case "append":
		data, err := io.ReadAll(os.Stdin)
		if err != nil {
			return err
		}
		return appendFile(root, expected, rel, data, allowControl)
	case "delete":
		return deleteFile(root, expected, rel, allowControl)
	case "mkdir":
		target, err := ensureDirectory(root, expected, rel, allowControl)
		if err != nil {
			return err
		}
		_, err = fmt.Fprintln(os.Stdout, target)
		return err
	case "test-hold-parent":
		return testHoldParent(root, expected, rel)
	default:
		return fmt.Errorf("unknown command: %s", command)
	}
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "windows-safeio:", err)
		if isNotFound(err) {
			os.Exit(4)
		}
		os.Exit(2)
	}
}
