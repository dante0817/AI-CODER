from __future__ import annotations

import hashlib
import shutil
import subprocess
from pathlib import Path
from .policy import read_workspace_text, resolve_workspace_path, is_sensitive_path


def _run(args: list[str], cwd: Path, timeout: int = 60) -> subprocess.CompletedProcess:
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=timeout)


def is_git_repository(root: Path) -> bool:
    try:
        p = _run(["git", "rev-parse", "--show-toplevel"], Path(root), timeout=10)
        return p.returncode == 0
    except Exception:
        return False


class WorktreeManager:
    def __init__(self, project_root: Path):
        self.project_root = Path(project_root).resolve()
        digest = hashlib.sha256(str(self.project_root).encode("utf-8")).hexdigest()[:16]
        self.base = Path.home() / ".ai-coder" / "worktrees" / digest
        self.base.mkdir(parents=True, exist_ok=True)

    def path_for(self, thread_id: str) -> Path:
        return self.base / thread_id[:12]

    def ensure(self, thread_id: str) -> dict:
        if not is_git_repository(self.project_root):
            return {"enabled": False, "reason": "Project is not a Git repository."}
        path = self.path_for(thread_id)
        branch = f"ai-coder/{thread_id[:8]}"
        if path.exists() and (path / ".git").exists():
            base = _run(["git", "rev-parse", branch], self.project_root, timeout=10)
            base_commit = base.stdout.strip() if base.returncode == 0 else ""
            return {"enabled": True, "path": str(path), "branch": branch, "baseCommit": base_commit, "existing": True}
        if path.exists():
            shutil.rmtree(path, ignore_errors=True)

        base = _run(["git", "rev-parse", "HEAD"], self.project_root, timeout=10)
        base_commit = base.stdout.strip() if base.returncode == 0 else ""
        p = _run(["git", "worktree", "add", "-b", branch, str(path), "HEAD"], self.project_root, timeout=90)
        if p.returncode != 0 and "already exists" in (p.stderr or "").lower():
            # A stale branch can remain after a previous worktree was removed.
            # Keep it intact and create a fresh branch name instead of deleting user Git state.
            suffix = thread_id.replace("-", "")[8:14] or "retry"
            branch = f"{branch}-{suffix}"
            p = _run(["git", "worktree", "add", "-b", branch, str(path), "HEAD"], self.project_root, timeout=90)
        if p.returncode != 0:
            return {"enabled": False, "reason": (p.stderr or p.stdout or "git worktree failed").strip()[:1200]}
        return {"enabled": True, "path": str(path), "branch": branch, "baseCommit": base_commit, "existing": False}

    def conflicting_paths(self, base_commit: str, paths: list[str]) -> list[str]:
        """Return files whose main workspace diverged from the worktree base commit."""
        if not base_commit:
            return list(paths)
        conflicts: list[str] = []
        for rel in paths:
            try:
                exists_at_base = _run(["git", "cat-file", "-e", f"{base_commit}:{rel}"], self.project_root, timeout=10).returncode == 0
                current_path = self.project_root / rel
                if not exists_at_base:
                    # A new task file is safe only if the main project still has no file at that path.
                    if current_path.exists():
                        conflicts.append(rel)
                    continue
                diff = _run(["git", "diff", "--quiet", base_commit, "--", rel], self.project_root, timeout=15)
                if diff.returncode != 0:
                    conflicts.append(rel)
            except Exception:
                conflicts.append(rel)
        return conflicts

    def status(self, worktree: Path) -> str:
        try:
            p = _run(["git", "status", "--short"], Path(worktree), timeout=20)
            return (p.stdout or p.stderr).strip()
        except Exception as exc:
            return str(exc)

    def changed_paths(self, worktree: Path) -> set[str]:
        """Return tracked (staged or unstaged) and untracked paths relative to HEAD."""
        tracked = _run(["git", "diff", "HEAD", "--name-only", "-z", "--"], Path(worktree), timeout=20)
        if tracked.returncode != 0:
            raise RuntimeError((tracked.stderr or tracked.stdout or "Unable to inspect worktree diff").strip())
        untracked = _run(["git", "ls-files", "--others", "--exclude-standard", "-z"], Path(worktree), timeout=20)
        if untracked.returncode != 0:
            raise RuntimeError((untracked.stderr or untracked.stdout or "Unable to inspect untracked worktree files").strip())
        return {p.replace("\\", "/") for p in (tracked.stdout + "\0" + untracked.stdout).split("\0") if p}

    def diff(self, worktree: Path) -> str:
        worktree = Path(worktree)
        chunks: list[str] = []
        try:
            p = _run(["git", "diff", "HEAD", "--no-ext-diff", "--"], worktree, timeout=30)
            if p.stdout:
                chunks.append(p.stdout)
            untracked_result = _run(["git", "ls-files", "--others", "--exclude-standard", "-z"], worktree, timeout=20)
            untracked = [p for p in untracked_result.stdout.split("\0") if p]
            for rel in untracked[:50]:
                try:
                    if is_sensitive_path(rel):
                        continue
                    path = resolve_workspace_path(worktree, rel)
                    if path.is_file():
                        text = read_workspace_text(worktree, rel)
                        chunks.append(f"\n--- /dev/null\n+++ b/{rel}\n@@ new file @@\n{text[:20000]}")
                except (OSError, ValueError):
                    pass
        except Exception as exc:
            return f"Unable to produce Git diff: {exc}"
        return "\n".join(chunks).strip()

    def remove(self, thread_id: str, force: bool = False) -> tuple[bool, str]:
        path = self.path_for(thread_id)
        if not path.exists():
            return True, "No worktree exists."
        args = ["git", "worktree", "remove"]
        if force:
            args.append("--force")
        args.append(str(path))
        try:
            p = _run(args, self.project_root, timeout=60)
            if p.returncode == 0:
                return True, "Worktree removed."
            return False, (p.stderr or p.stdout).strip()
        except Exception as exc:
            return False, str(exc)
