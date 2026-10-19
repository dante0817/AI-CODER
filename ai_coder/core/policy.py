from __future__ import annotations

import os
import re
import secrets
import stat
from dataclasses import dataclass
from pathlib import Path

from . import windows_safe_io

ALLOWED_COMMANDS: dict[str, tuple[str, ...]] = {
    "npm test": ("npm", "test"),
    "npm run test": ("npm", "run", "test"),
    "npm run lint": ("npm", "run", "lint"),
    "npm run build": ("npm", "run", "build"),
    "npm run typecheck": ("npm", "run", "typecheck"),
    "node --test": ("node", "--test"),
    "pytest": ("pytest",),
    "python -m pytest": ("python", "-m", "pytest"),
    "python3 -m pytest": ("python3", "-m", "pytest"),
    "tsc --noEmit": ("tsc", "--noEmit"),
    "git status": ("git", "status"),
    "git diff": ("git", "diff"),
}

SENSITIVE_NAMES = [
    re.compile(r"^\.env(?:\..*)?$", re.I),
    re.compile(r"^id_rsa$", re.I),
    re.compile(r"^id_ed25519$", re.I),
    re.compile(r"^credentials(?:\..*)?$", re.I),
    re.compile(r"^secrets?(?:\..*)?$", re.I),
    re.compile(r".*\.pem$", re.I),
    re.compile(r".*\.key$", re.I),
]


@dataclass(frozen=True)
class CommandVerdict:
    level: int
    allowed: bool
    reason: str
    argv: tuple[str, ...] = ()


def classify_command(command: str) -> CommandVerdict:
    cmd = (command or "").strip()
    if not cmd:
        return CommandVerdict(0, False, "Empty command")
    argv = ALLOWED_COMMANDS.get(cmd)
    if argv is not None:
        return CommandVerdict(1, True, "Known verification command; project scripts may execute code", argv)
    return CommandVerdict(2, False, "Command is not an exact MVP verification command")


def is_sensitive_path(path: str | Path) -> bool:
    p = str(path).replace("\\", "/")
    parts = [x.lower() for x in p.split("/") if x]
    if any(x in {".ssh", ".aws", ".azure"} for x in parts):
        return True
    name = parts[-1] if parts else ""
    return any(rx.fullmatch(name) for rx in SENSITIVE_NAMES)


RESERVED_DOS_NAMES = {
    "CON", "PRN", "AUX", "NUL",
    "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
    "COM¹", "COM²", "COM³",
    "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    "LPT¹", "LPT²", "LPT³",
}


def is_reserved_dos_name(name: str) -> bool:
    stem = name.split(".")[0].strip().upper()
    return stem in RESERVED_DOS_NAMES


def validate_windows_component(part: str) -> None:
    if not part or part == "." or part == "..":
        raise ValueError(f"Unsafe path component: {part}")
    if part.endswith(".") or part.endswith(" "):
        raise ValueError(f"Unsafe trailing dot/space in path component: {part}")
    if part.startswith(" "):
        raise ValueError(f"Unsafe leading space in path component: {part}")
    if is_reserved_dos_name(part):
        raise ValueError(f"Reserved DOS device name blocked: {part}")
    if any(c in '<>"|?*' or ord(c) < 32 for c in part):
        raise ValueError(f"Invalid character in path component: {part}")


def is_control_path(path_str: str | Path) -> bool:
    parts = [p.casefold().rstrip(". ") for p in Path(path_str).parts if p]
    return ".ai-coder" in parts


def validate_workspace_path(
    rel_path: str,
    *,
    allow_sensitive: bool = False,
    allow_control: bool = False,
) -> str:
    raw = (rel_path or "").replace("\\", "/")
    if raw != raw.strip():
        raise ValueError(f"Unsafe workspace path with leading or trailing whitespace: {rel_path}")
    if not raw or raw.startswith("/") or re.match(r"^[A-Za-z]:", raw) or "\x00" in raw or ":" in raw:
        raise ValueError(f"Unsafe workspace path: {rel_path}")
    normalized = str(Path(raw).as_posix())
    parts = Path(normalized).parts
    if any(part == ".." for part in parts):
        raise ValueError(f"Unsafe workspace path: {rel_path}")
    for part in parts:
        validate_windows_component(part)
    if not allow_control and is_control_path(normalized):
        raise ValueError(f"Control data blocked: {rel_path}")
    if not allow_sensitive and is_sensitive_path(normalized):
        raise ValueError(f"Sensitive path blocked: {rel_path}")
    return normalized


def resolve_workspace_path(
    root: Path,
    rel_path: str,
    *,
    allow_sensitive: bool = False,
    allow_control: bool = False,
) -> Path:
    """Return a workspace-confined path. Actual Windows I/O remains handle-bound."""
    rel = validate_workspace_path(rel_path, allow_sensitive=allow_sensitive, allow_control=allow_control)
    if os.name == "nt":
        target = windows_safe_io.validate_path(root, rel, allow_control=allow_control)
        # The helper already rejects reparse components and root replacement.
        # Keep policy checks here as defense in depth for control/sensitive names.
        if not allow_sensitive and is_sensitive_path(rel):
            raise ValueError(f"Sensitive target blocked: {rel_path}")
        if not allow_control and is_control_path(rel):
            raise ValueError(f"Control target blocked: {rel_path}")
        return target

    base = Path(root).resolve(strict=True)
    target = (base / rel).resolve(strict=False)
    try:
        canonical_rel = target.relative_to(base)
    except ValueError as exc:
        raise ValueError(f"Path leaves workspace: {rel_path}") from exc
    if not allow_sensitive and is_sensitive_path(canonical_rel):
        raise ValueError(f"Sensitive target blocked: {rel_path}")
    if not allow_control and is_control_path(canonical_rel):
        raise ValueError(f"Control target blocked: {rel_path}")
    return target


def _checked_parts(
    root: Path,
    rel_path: str,
    allow_sensitive: bool = False,
    allow_control: bool = False,
) -> tuple[Path, tuple[str, ...]]:
    base = Path(root).resolve(strict=True)
    target = resolve_workspace_path(base, rel_path, allow_sensitive=allow_sensitive, allow_control=allow_control)
    parts = target.relative_to(base).parts
    if not parts:
        raise ValueError("The workspace root is not a file")
    return base, parts


def _open_parent(base: Path, parts: tuple[str, ...], create: bool = False) -> int:
    """POSIX directory handles prevent a link swap between validation and I/O."""
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    fd = os.open(base, flags)
    try:
        for part in parts[:-1]:
            if create:
                try:
                    os.mkdir(part, dir_fd=fd)
                except FileExistsError:
                    pass
            next_fd = os.open(part, flags, dir_fd=fd)
            os.close(fd)
            fd = next_fd
        return fd
    except BaseException:
        os.close(fd)
        raise


def decode_text_bytes(data: bytes, *, source: str = "file", max_bytes: int | None = None, reject_nul: bool = True) -> str:
    """Decode supported AI-CODER text without lossy replacement or newline conversion."""
    if max_bytes is not None and len(data) > max_bytes:
        raise ValueError(f"{source} is too large for safe text editing ({len(data)} bytes; limit {max_bytes} bytes).")
    if reject_nul and b"\x00" in data:
        raise ValueError(f"{source} contains NUL bytes and is treated as unsupported/binary content.")
    try:
        return data.decode("utf-8", errors="strict")
    except UnicodeDecodeError as exc:
        raise ValueError(f"{source} is not valid UTF-8 text; binary or unsupported encodings are not editable by AI-CODER.") from exc


def read_workspace_bytes(
    root: Path,
    rel_path: str,
    *,
    allow_sensitive: bool = False,
    allow_control: bool = False,
) -> bytes:
    rel = validate_workspace_path(rel_path, allow_sensitive=allow_sensitive, allow_control=allow_control)
    if os.name == "nt":
        return windows_safe_io.read_bytes(root, rel, allow_control=allow_control)
    base, parts = _checked_parts(root, rel, allow_sensitive=allow_sensitive, allow_control=allow_control)
    parent_fd = _open_parent(base, parts)
    try:
        fd = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent_fd)
        try:
            st = os.fstat(fd)
            if stat.S_ISREG(st.st_mode) and st.st_nlink > 1:
                raise ValueError(f"Hard-linked files are not supported: {rel_path} (link count: {st.st_nlink})")
            chunks: list[bytes] = []
            while True:
                chunk = os.read(fd, 1024 * 1024)
                if not chunk:
                    break
                chunks.append(chunk)
            return b"".join(chunks)
        finally:
            os.close(fd)
    finally:
        os.close(parent_fd)


def read_workspace_text(
    root: Path,
    rel_path: str,
    *,
    allow_sensitive: bool = False,
    allow_control: bool = False,
    max_bytes: int | None = None,
    reject_nul: bool = True,
) -> str:
    data = read_workspace_bytes(root, rel_path, allow_sensitive=allow_sensitive, allow_control=allow_control)
    return decode_text_bytes(data, source=str(rel_path), max_bytes=max_bytes, reject_nul=reject_nul)


def _write_all(fd: int, data: bytes) -> None:
    view = memoryview(data)
    total = 0
    while total < len(view):
        written = os.write(fd, view[total:])
        if written <= 0:
            raise OSError("Short write while staging workspace file")
        total += written


def write_workspace_bytes(
    root: Path,
    rel_path: str,
    data: bytes,
    *,
    allow_sensitive: bool = False,
    allow_control: bool = False,
) -> None:
    """Atomically replace one workspace file using the platform safe-I/O boundary.

    Windows uses the bundled handle-bound helper; POSIX uses dir-fd/no-follow operations.
    The operation is atomic per file only. Multi-file callers still need checkpoint rollback.
    """
    if not isinstance(data, (bytes, bytearray, memoryview)):
        raise TypeError("Workspace byte writes require bytes-like data")
    payload = bytes(data)
    rel = validate_workspace_path(rel_path, allow_sensitive=allow_sensitive, allow_control=allow_control)
    if os.name == "nt":
        windows_safe_io.write_bytes(root, rel, payload, allow_control=allow_control)
        return

    base, parts = _checked_parts(root, rel, allow_sensitive=allow_sensitive, allow_control=allow_control)

    parent_fd = _open_parent(base, parts, create=True)
    temp_name = f".{parts[-1]}.ai-coder-{os.getpid()}-{secrets.token_hex(8)}.tmp"
    temp_fd = None
    try:
        existing_mode = None
        try:
            existing_fd = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent_fd)
        except FileNotFoundError:
            existing_fd = None
        if existing_fd is not None:
            try:
                st = os.fstat(existing_fd)
                if stat.S_ISREG(st.st_mode) and st.st_nlink > 1:
                    raise ValueError(f"Hard-linked files are not supported: {rel_path} (link count: {st.st_nlink})")
                existing_mode = stat.S_IMODE(st.st_mode)
            finally:
                os.close(existing_fd)

        temp_fd = os.open(
            temp_name,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
            existing_mode if existing_mode is not None else 0o666,
            dir_fd=parent_fd,
        )
        _write_all(temp_fd, payload)
        os.fsync(temp_fd)
        if existing_mode is not None:
            os.fchmod(temp_fd, existing_mode)
        os.close(temp_fd)
        temp_fd = None
        os.replace(temp_name, parts[-1], src_dir_fd=parent_fd, dst_dir_fd=parent_fd)
        os.fsync(parent_fd)
    finally:
        if temp_fd is not None:
            os.close(temp_fd)
        try:
            os.unlink(temp_name, dir_fd=parent_fd)
        except FileNotFoundError:
            pass
        os.close(parent_fd)


def write_workspace_text(
    root: Path,
    rel_path: str,
    content: str,
    *,
    allow_sensitive: bool = False,
    allow_control: bool = False,
) -> None:
    if not isinstance(content, str):
        raise TypeError("Workspace text writes require str content")
    if "\x00" in content:
        raise ValueError(f"{rel_path} contains NUL characters and is not supported as editable text.")
    write_workspace_bytes(
        root,
        rel_path,
        content.encode("utf-8", errors="strict"),
        allow_sensitive=allow_sensitive,
        allow_control=allow_control,
    )


def append_workspace_text(
    root: Path,
    rel_path: str,
    content: str,
    *,
    allow_sensitive: bool = False,
    allow_control: bool = False,
) -> None:
    if "\x00" in content:
        raise ValueError(f"{rel_path} contains NUL characters and is not supported as editable text.")
    rel = validate_workspace_path(rel_path, allow_sensitive=allow_sensitive, allow_control=allow_control)
    if os.name == "nt":
        windows_safe_io.append_bytes(root, rel, content.encode("utf-8", errors="strict"), allow_control=allow_control)
        return
    base, parts = _checked_parts(root, rel, allow_sensitive=allow_sensitive, allow_control=allow_control)
    parent_fd = _open_parent(base, parts, create=True)
    try:
        fd = os.open(parts[-1], os.O_WRONLY | os.O_CREAT | os.O_APPEND | os.O_NOFOLLOW, 0o666, dir_fd=parent_fd)
        try:
            st = os.fstat(fd)
            if stat.S_ISREG(st.st_mode) and st.st_nlink > 1:
                raise ValueError(f"Hard-linked files are not supported: {rel_path} (link count: {st.st_nlink})")
            with os.fdopen(fd, "a", encoding="utf-8", newline="") as stream:
                stream.write(content)
                stream.flush()
        except BaseException:
            os.close(fd)
            raise
    finally:
        os.close(parent_fd)


def ensure_workspace_directory(root: Path, rel_path: str, *, allow_control: bool = True) -> Path:
    rel = validate_workspace_path(rel_path, allow_sensitive=True, allow_control=allow_control)
    if os.name == "nt":
        return windows_safe_io.ensure_directory(root, rel, allow_control=allow_control)
    base, parts = _checked_parts(root, rel, allow_sensitive=True, allow_control=allow_control)
    fd = _open_parent(base, parts + ("_unused",), create=True)
    os.close(fd)
    return base.joinpath(*parts)


def unlink_workspace_file(
    root: Path,
    rel_path: str,
    *,
    allow_sensitive: bool = False,
    allow_control: bool = False,
) -> None:
    rel = validate_workspace_path(rel_path, allow_sensitive=allow_sensitive, allow_control=allow_control)
    if os.name == "nt":
        windows_safe_io.delete_file(root, rel, allow_control=allow_control)
        return
    base, parts = _checked_parts(root, rel, allow_sensitive=allow_sensitive, allow_control=allow_control)
    parent_fd = _open_parent(base, parts)
    try:
        try:
            os.unlink(parts[-1], dir_fd=parent_fd)
            os.fsync(parent_fd)
        except FileNotFoundError:
            pass
    finally:
        os.close(parent_fd)

