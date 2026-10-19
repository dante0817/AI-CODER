from __future__ import annotations

import re
from pathlib import Path
from .policy import ensure_workspace_directory, read_workspace_text, resolve_workspace_path, write_workspace_text


class SkillStore:
    def __init__(self, project_root: Path):
        self.project_root = Path(project_root).resolve()
        self.root = ensure_workspace_directory(self.project_root, ".ai-coder/skills")

    def list(self) -> list[str]:
        return sorted(p.stem for p in self.root.glob("*.md") if p.is_file())

    def path(self, name: str) -> Path:
        safe = re.sub(r"[^A-Za-z0-9_.-]+", "-", (name or "skill").strip()).strip("-.") or "skill"
        return self.root / f"{safe}.md"

    def read(self, name: str) -> str:
        p = self.path(name)
        if not p.exists():
            return ""
        actual = resolve_workspace_path(self.project_root, p.relative_to(self.project_root).as_posix(), allow_control=True)
        if self.root not in actual.parents:
            raise ValueError("Skill file leaves the project skills directory")
        return read_workspace_text(self.project_root, p.relative_to(self.project_root).as_posix(), allow_control=True)

    def save(self, name: str, content: str) -> Path:
        p = self.path(name)
        actual = resolve_workspace_path(self.project_root, p.relative_to(self.project_root).as_posix(), allow_control=True)
        if self.root not in actual.parents:
            raise ValueError("Skill file leaves the project skills directory")
        write_workspace_text(self.project_root, p.relative_to(self.project_root).as_posix(), content, allow_control=True)
        return p

    def resolve_mentions(self, prompt: str, max_chars: int = 16000) -> str:
        # Explicit @skill:name keeps skill injection deterministic and user-controlled.
        names = re.findall(r"@skill:([A-Za-z0-9_.-]+)", prompt or "")
        parts: list[str] = []
        used = 0
        for name in names:
            text = self.read(name)
            if not text:
                continue
            remaining = max_chars - used
            if remaining <= 0:
                break
            clipped = text[:remaining]
            parts.append(f"\n--- SKILL {name} ---\n{clipped}")
            used += len(clipped)
        return "\n".join(parts)
