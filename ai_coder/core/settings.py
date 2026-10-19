from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

from .locks import InterProcessLock

DEFAULTS = {
    "provider": "auto",
    "model": "auto",
    "effort": "auto",
    "routingMode": "balanced",
    "openaiCompatibleBaseUrl": "https://api.openai.com/v1",
    "ollamaBaseUrl": "http://127.0.0.1:11434",
    "maxContextChars": 80000,
    "preferCodexAccount": True,
}


class SettingsStore:
    def __init__(self, path: Path | None = None):
        self.path = Path(path) if path is not None else Path.home() / ".ai-coder" / "settings.json"
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.lock_path = self.path.with_name(self.path.name + ".lock")

    @staticmethod
    def _sanitize(data: dict) -> dict:
        return {k: v for k, v in data.items() if "key" not in k.lower() and "secret" not in k.lower()}

    def _load_unlocked(self) -> dict:
        data = dict(DEFAULTS)
        if self.path.exists():
            try:
                loaded = json.loads(self.path.read_text(encoding="utf-8"))
                if isinstance(loaded, dict):
                    data.update(loaded)
            except Exception:
                # Keep the last-known defaults when an older/corrupt settings
                # file cannot be parsed. Atomic writes below prevent new torn
                # files, but this preserves compatibility with existing users.
                pass
        return data

    def load(self) -> dict:
        with InterProcessLock(self.lock_path):
            return self._load_unlocked()

    def _write_atomic_unlocked(self, data: dict) -> None:
        safe = self._sanitize(data)
        payload = json.dumps(safe, indent=2).encode("utf-8")
        fd, tmp_name = tempfile.mkstemp(prefix=self.path.name + ".", suffix=".tmp", dir=self.path.parent)
        tmp_path = Path(tmp_name)
        try:
            try:
                os.chmod(tmp_path, 0o600)
            except OSError:
                pass
            with os.fdopen(fd, "wb", closefd=True) as handle:
                handle.write(payload)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(tmp_path, self.path)
            if os.name != "nt":
                try:
                    dir_fd = os.open(self.path.parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
                    try:
                        os.fsync(dir_fd)
                    finally:
                        os.close(dir_fd)
                except OSError:
                    pass
        finally:
            try:
                tmp_path.unlink(missing_ok=True)
            except OSError:
                pass

    def save(self, data: dict) -> None:
        with InterProcessLock(self.lock_path):
            self._write_atomic_unlocked(data)

    def update(self, changes: dict) -> dict:
        """Merge only the caller's changed keys into the latest on-disk state."""
        with InterProcessLock(self.lock_path):
            latest = self._load_unlocked()
            latest.update(self._sanitize(changes))
            self._write_atomic_unlocked(latest)
            return latest
