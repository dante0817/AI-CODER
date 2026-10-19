from __future__ import annotations

import json
import time
from pathlib import Path
from .policy import append_workspace_text, ensure_workspace_directory, read_workspace_text

class ActivityStore:
    def __init__(self, project_root: Path):
        self.root = Path(project_root).resolve()
        self.path = ensure_workspace_directory(self.root, ".ai-coder") / "activity.jsonl"

    def add(self, event: dict) -> None:
        record = {"at": time.strftime("%Y-%m-%dT%H:%M:%S"), **event}
        append_workspace_text(self.root, ".ai-coder/activity.jsonl", json.dumps(record, ensure_ascii=False) + "\n", allow_control=True)

    def list(self, limit: int = 200) -> list[dict]:
        if not self.path.exists():
            return []
        lines = read_workspace_text(self.root, ".ai-coder/activity.jsonl", allow_control=True).splitlines()[-limit:]
        out = []
        for line in lines:
            try:
                out.append(json.loads(line))
            except Exception:
                pass
        return list(reversed(out))
