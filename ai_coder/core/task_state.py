from __future__ import annotations

from copy import deepcopy


def merge_pending_changes(previous: dict, files: list[dict]) -> dict:
    merged = deepcopy(previous or {})
    for file in files or []:
        rel = str(file.get("path") or "")
        if not rel:
            continue
        baseline = merged[rel]["before"] if rel in merged else file.get("before")
        after = file.get("after")
        if after == baseline:
            merged.pop(rel, None)
        else:
            merged[rel] = {"before": baseline, "after": after}
    return merged


def same_worktree_identity(current: dict | None, reviewed: dict | None) -> bool:
    current = current or {}
    reviewed = reviewed or {}
    return bool(current.get("enabled")) and (
        str(current.get("path") or "") == str(reviewed.get("path") or "")
        and str(current.get("branch") or "") == str(reviewed.get("branch") or "")
        and str(current.get("baseCommit") or "") == str(reviewed.get("baseCommit") or "")
    )


def reviewed_worktree_state_matches(record: dict | None, reviewed_worktree: dict | None, reviewed_pending: dict | None) -> bool:
    record = record or {}
    return same_worktree_identity(record.get("worktree") or {}, reviewed_worktree or {}) and (
        (record.get("pendingChanges") or {}) == (reviewed_pending or {})
    )


def checkpoint_recovery_eligible(state: str | None, *, after_bytes_verified: bool = False) -> bool:
    state = state or "applied"
    if state in {"applied", "history-recovery-needed"}:
        return True
    if state == "ready":
        return bool(after_bytes_verified)
    return False
