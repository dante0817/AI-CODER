from __future__ import annotations

import os
import subprocess
import threading
from pathlib import Path

_ROOT_IDENTITIES: dict[str, str] = {}
_LOCK = threading.RLock()


def _helper_path() -> Path:
    return Path(__file__).resolve().parents[2] / "native" / "windows-safeio" / "windows-safeio.exe"


def _root_key(root: Path | str) -> str:
    # abspath is intentionally lexical. Do not resolve symlinks/junctions before
    # the native helper opens and validates the selected workspace root itself.
    return os.path.normcase(os.path.abspath(os.fspath(root)))


def _run(args: list[str], *, input_bytes: bytes | None = None, binary_output: bool = False) -> bytes | str:
    helper = _helper_path()
    if not helper.is_file():
        raise RuntimeError(f"Windows safe-I/O helper is missing: {helper}")
    creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    completed = subprocess.run(
        [str(helper), *args],
        input=input_bytes,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        timeout=60,
        creationflags=creationflags,
    )
    if completed.returncode == 4:
        detail = completed.stderr.decode("utf-8", errors="replace").strip()
        raise FileNotFoundError(detail or "Workspace path does not exist")
    if completed.returncode != 0:
        detail = completed.stderr.decode("utf-8", errors="replace").strip()
        raise ValueError(detail or f"Windows safe-I/O helper failed with exit code {completed.returncode}")
    if binary_output:
        return bytes(completed.stdout)
    return completed.stdout.decode("utf-8", errors="strict").strip()


def register_workspace(root: Path | str, *, force: bool = False) -> str | None:
    if os.name != "nt":
        return None
    key = _root_key(root)
    with _LOCK:
        if not force and key in _ROOT_IDENTITIES:
            return _ROOT_IDENTITIES[key]
        identity = str(_run(["identity", "--root", key]))
        if not identity:
            raise RuntimeError("Windows safe-I/O helper returned an empty workspace identity")
        _ROOT_IDENTITIES[key] = identity
        return identity


def forget_workspace(root: Path | str) -> None:
    with _LOCK:
        _ROOT_IDENTITIES.pop(_root_key(root), None)


def _common(root: Path | str, rel_path: str, *, allow_control: bool = False) -> tuple[str, list[str]]:
    key = _root_key(root)
    identity = register_workspace(key)
    assert identity is not None
    args = ["--root", key, "--expected-root-id", identity, "--rel", rel_path]
    if allow_control:
        args.append("--allow-control")
    return key, args


def validate_path(root: Path | str, rel_path: str, *, allow_control: bool = False) -> Path:
    key, args = _common(root, rel_path, allow_control=allow_control)
    target = str(_run(["validate", *args]))
    if not target:
        raise RuntimeError(f"Windows safe-I/O helper did not return a target for {rel_path}")
    return Path(target)


def read_bytes(root: Path | str, rel_path: str, *, allow_control: bool = False) -> bytes:
    _, args = _common(root, rel_path, allow_control=allow_control)
    return _run(["read", *args], binary_output=True)  # type: ignore[return-value]


def write_bytes(root: Path | str, rel_path: str, data: bytes, *, allow_control: bool = False) -> None:
    _, args = _common(root, rel_path, allow_control=allow_control)
    _run(["write", *args], input_bytes=bytes(data))


def append_bytes(root: Path | str, rel_path: str, data: bytes, *, allow_control: bool = False) -> None:
    _, args = _common(root, rel_path, allow_control=allow_control)
    _run(["append", *args], input_bytes=bytes(data))


def ensure_directory(root: Path | str, rel_path: str, *, allow_control: bool = True) -> Path:
    _, args = _common(root, rel_path, allow_control=allow_control)
    target = str(_run(["mkdir", *args]))
    return Path(target)


def delete_file(root: Path | str, rel_path: str, *, allow_control: bool = False) -> None:
    _, args = _common(root, rel_path, allow_control=allow_control)
    try:
        _run(["delete", *args])
    except FileNotFoundError:
        return
