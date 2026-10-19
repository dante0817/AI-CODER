from __future__ import annotations

import json
from pathlib import Path
from .policy import ensure_workspace_directory, read_workspace_text, resolve_workspace_path, write_workspace_text

DEFAULT_PROFILE = {
    "name": "",
    "purpose": "",
    "architecture": [],
    "rules": [],
    "commands": {"test": "", "lint": "", "build": ""},
    "importantFiles": [],
    "doNotDo": []
}


def profile_path(project_root: Path) -> Path:
    return project_root / ".ai-coder" / "project.json"


def load_profile(project_root: Path) -> dict:
    p = profile_path(project_root)
    if not p.exists():
        return {}
    try:
        if resolve_workspace_path(project_root, ".ai-coder/project.json", allow_control=True) != p.absolute():
            return {}
        return json.loads(read_workspace_text(project_root, ".ai-coder/project.json", allow_control=True))
    except Exception:
        return {}


def create_profile(project_root: Path) -> Path:
    p = profile_path(project_root)
    ensure_workspace_directory(project_root, ".ai-coder")
    if not p.exists():
        data = dict(DEFAULT_PROFILE)
        data["name"] = project_root.name
        write_workspace_text(project_root, ".ai-coder/project.json", json.dumps(data, indent=2), allow_control=True)
    elif resolve_workspace_path(project_root, ".ai-coder/project.json", allow_control=True) != p.absolute():
        raise ValueError("Project profile may not be a symlink")
    return p
