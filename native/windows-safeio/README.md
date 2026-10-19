# Windows Safe I/O helper

This helper is the shared Windows filesystem security boundary for the Python desktop MVP and the Code-OSS built-in extension.

It uses Win32 handles to:

- reject UNC/network workspaces and reparse-point roots/components;
- identify the selected workspace by volume serial + 128-bit file ID;
- keep the workspace root and ancestor directories open without `FILE_SHARE_DELETE` while an operation runs;
- read from an opened, verified file handle;
- stage writes in the verified parent and rename the staging handle relative to the verified parent with `SetFileInformationByHandle(FileRenameInfo)`;
- delete through an opened, verified file handle with `FileDispositionInfo`.

Build the bundled binary from the repository root on any machine with Go:

```powershell
$env:GOOS = "windows"
$env:GOARCH = "amd64"
go build -trimpath -ldflags="-s -w" -o native/windows-safeio/windows-safeio.exe ./native/windows-safeio/main.go
Copy-Item native/windows-safeio/windows-safeio.exe code-oss-mvp/builtin-ai-coder/native/windows-safeio.exe -Force
```

The checked-in executable is built from `main.go`; both runtimes call the same helper implementation. End users do not need Go installed. `build-windows-safeio.ps1` is only for rebuilding the helper from source.
