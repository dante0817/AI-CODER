from __future__ import annotations

import hashlib
import json
import time
import uuid
from pathlib import Path

from .locks import InterProcessLock
from .policy import ensure_workspace_directory, read_workspace_text, unlink_workspace_file, write_workspace_text


class ThreadStore:
    """Persistent project-local agent threads with serialized mutations.

    Thread files intentionally live under .ai-coder/threads so they are excluded
    from model context. A separate advisory lock protects read-modify-write
    mutations from lost updates across background workers/processes.
    """

    def __init__(self, project_root: Path):
        self.root = Path(project_root).resolve()
        self.dir = ensure_workspace_directory(self.root, ".ai-coder/threads")
        # Keep advisory locks outside the user workspace so acquiring the lock
        # never requires opening a potentially user-replaced control-path file.
        # Workspace writes themselves remain protected by the safe-I/O policy.
        root_key = hashlib.sha256(str(self.root).casefold().encode("utf-8")).hexdigest()[:24]
        lock_dir = Path.home() / ".ai-coder" / "locks"
        self.lock_path = lock_dir / f"threads-{root_key}.lock"

    def _lock(self) -> InterProcessLock:
        return InterProcessLock(self.lock_path)

    def _path(self, thread_id: str) -> Path:
        safe = "".join(ch for ch in thread_id if ch.isalnum() or ch in "-_")
        if not safe:
            raise ValueError("Invalid thread id")
        return self.dir / f"{safe}.json"

    def _save_unlocked(self, record: dict) -> dict:
        record = dict(record)
        record["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        write_workspace_text(
            self.root,
            f".ai-coder/threads/{record['id']}.json",
            json.dumps(record, indent=2, ensure_ascii=False),
            allow_control=True,
        )
        return record

    def _get_unlocked(self, thread_id: str) -> dict | None:
        path = self._path(thread_id)
        if not path.exists():
            return None
        try:
            data = json.loads(read_workspace_text(self.root, path.relative_to(self.root).as_posix(), allow_control=True))
            return data if isinstance(data, dict) else None
        except Exception:
            return None

    def create(self, title: str = "New task") -> dict:
        now = time.strftime("%Y-%m-%dT%H:%M:%S")
        record = {
            "id": str(uuid.uuid4()),
            "title": (title or "New task").strip()[:120],
            "status": "ready",
            "createdAt": now,
            "updatedAt": now,
            "messages": [],
            "execution": {},
            "worktree": {},
            "lastChanges": [],
            "lastCheckpoint": None,
            "actionHistory": [],
            "lastError": "",
        }
        with self._lock():
            return self._save_unlocked(record)

    def save(self, record: dict) -> dict:
        with self._lock():
            return self._save_unlocked(record)

    def get(self, thread_id: str) -> dict | None:
        with self._lock():
            return self._get_unlocked(thread_id)

    def list(self) -> list[dict]:
        with self._lock():
            records: list[dict] = []
            for path in self.dir.glob("*.json"):
                try:
                    data = json.loads(read_workspace_text(self.root, path.relative_to(self.root).as_posix(), allow_control=True))
                    if isinstance(data, dict):
                        records.append(data)
                except Exception:
                    pass
            records.sort(key=lambda r: r.get("updatedAt", ""), reverse=True)
            return records

    def mutate(self, thread_id: str, mutator) -> dict:
        """Atomically reload, mutate, and persist a task record."""
        with self._lock():
            record = self._get_unlocked(thread_id)
            if not record:
                raise KeyError(thread_id)
            updated = mutator(record)
            if updated is not None:
                record = updated
            if not isinstance(record, dict):
                raise TypeError("Thread mutator must preserve a dict record")
            return self._save_unlocked(record)

    def add_message(self, thread_id: str, role: str, content: str, **meta) -> dict:
        def apply(record: dict):
            record.setdefault("messages", []).append({
                "role": role,
                "content": content,
                "at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                **meta,
            })
            return record

        return self.mutate(thread_id, apply)

    def patch(self, thread_id: str, **changes) -> dict:
        def apply(record: dict):
            record.update(changes)
            return record

        return self.mutate(thread_id, apply)

    def rename(self, thread_id: str, title: str) -> dict:
        return self.patch(thread_id, title=(title or "New task").strip()[:120])

    def delete(self, thread_id: str) -> None:
        with self._lock():
            unlink_workspace_file(self.root, self._path(thread_id).relative_to(self.root).as_posix(), allow_control=True)
