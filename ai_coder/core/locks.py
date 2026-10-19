from __future__ import annotations

import os
from pathlib import Path


class InterProcessLock:
    """Small blocking advisory lock for AI-CODER state files.

    The lock file is intentionally separate from the protected JSON file so an
    atomic os.replace() of that JSON does not invalidate the held lock.
    """

    def __init__(self, path: Path):
        self.path = Path(path)
        self._fd: int | None = None

    def __enter__(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(self.path, os.O_RDWR | os.O_CREAT, 0o600)
        self._fd = fd
        if os.name == "nt":
            import msvcrt

            # msvcrt.locking locks bytes from the current file position. Ensure
            # one byte exists and lock that byte.
            if os.fstat(fd).st_size == 0:
                os.write(fd, b"\0")
                os.fsync(fd)
            os.lseek(fd, 0, os.SEEK_SET)
            msvcrt.locking(fd, msvcrt.LK_LOCK, 1)
        else:
            import fcntl

            fcntl.flock(fd, fcntl.LOCK_EX)
        return self

    def __exit__(self, exc_type, exc, tb):
        fd = self._fd
        self._fd = None
        if fd is None:
            return False
        try:
            if os.name == "nt":
                import msvcrt

                os.lseek(fd, 0, os.SEEK_SET)
                msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)
            else:
                import fcntl

                fcntl.flock(fd, fcntl.LOCK_UN)
        finally:
            os.close(fd)
        return False
