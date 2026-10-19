from __future__ import annotations

import difflib
import time
from dataclasses import dataclass
from pathlib import Path

from ..core.activity import ActivityStore
from ..core.agent import AgentPlan
from ..core.checkpoints import Change, CheckpointStore
from ..core.policy import read_workspace_text
from ..core.router import ExecutionProfile
from ..core.threads import ThreadStore
from ..core.task_state import checkpoint_recovery_eligible, merge_pending_changes as merge_pending_state, same_worktree_identity
from ..core.worktrees import WorktreeManager
from .verification import VerificationService


class AppliedHistoryPersistenceError(RuntimeError):
    """Raised when file bytes were applied but task history could not be persisted."""

    def __init__(self, message: str, *, checkpoint_id: str):
        super().__init__(message)
        self.checkpoint_id = checkpoint_id
        self.files_applied = True


class UndoHistoryPersistenceError(RuntimeError):
    """Raised when checkpoint bytes were restored but task history could not be persisted."""

    def __init__(self, message: str, *, checkpoint_id: str):
        super().__init__(message)
        self.checkpoint_id = checkpoint_id
        self.files_restored = True


class WorktreeApplyConflictError(ValueError):
    """Raised when main-project files no longer match the trusted apply baseline."""

    def __init__(self, conflicts: list[str]):
        self.conflicts = list(conflicts)
        detail = "Main-project files diverged from the trusted task baseline: " + ", ".join(self.conflicts)
        super().__init__(detail)


@dataclass
class PreparedAgentChanges:
    thread_id: str
    execution_root: Path
    worktree_info: dict
    isolated: bool
    record: dict
    previous_pending: dict
    store: CheckpointStore | None
    preview: dict | None
    diff_text: str
    location: str

    @property
    def has_changes(self) -> bool:
        return self.preview is not None


@dataclass
class AppliedAgentChanges:
    thread_id: str
    execution_root: Path
    isolated: bool
    pending: dict
    previous_pending: dict
    record_before_apply: dict
    checkpoint: dict
    status: str
    allowed_commands: list[str]


@dataclass
class PreparedWorktreeApply:
    thread_id: str
    source_root: Path
    worktree_info: dict
    record: dict
    pending: dict
    changes: list[Change]
    preview: dict
    diff_text: str

    @property
    def paths(self) -> tuple[str, ...]:
        return tuple(sorted(self.pending))


@dataclass(frozen=True)
class AppliedWorktreeToProject:
    thread_id: str
    checkpoint: dict
    paths: tuple[str, ...]
    status_text: str


@dataclass(frozen=True)
class UndoTaskActionResult:
    thread_id: str
    checkpoint: dict
    scope: str
    status_text: str


@dataclass(frozen=True)
class FinalizedAgentChanges:
    summary: str
    diff_text: str
    extra_worktree_paths: tuple[str, ...]
    status_text: str


class ChangeApplicationService:
    """Own reviewed change application, recovery metadata, verification, and final task state."""

    def __init__(
        self,
        *,
        thread_store: ThreadStore,
        project_checkpoints: CheckpointStore | None = None,
        worktrees: WorktreeManager | None = None,
        activity: ActivityStore | None = None,
        verification: VerificationService | None = None,
    ):
        self.thread_store = thread_store
        self.project_checkpoints = project_checkpoints
        self.worktrees = worktrees
        self.activity = activity
        self.verification = verification or VerificationService()

    @staticmethod
    def checkpoint_diff(checkpoint: dict) -> str:
        out: list[str] = []
        for item in checkpoint.get("files", []):
            before = (item.get("before") or "").splitlines(keepends=True)
            after = (item.get("after") or "").splitlines(keepends=True)
            fromfile = "/dev/null" if item.get("before") is None else f"a/{item['path']}"
            out.extend(difflib.unified_diff(before, after, fromfile=fromfile, tofile=f"b/{item['path']}"))
        return "".join(out)

    @classmethod
    def pending_diff(cls, pending: dict) -> str:
        files = [
            {"path": rel, "before": item.get("before"), "after": item.get("after")}
            for rel, item in sorted(pending.items())
        ]
        return cls.checkpoint_diff({"files": files})

    @staticmethod
    def merge_pending_changes(previous: dict, checkpoint: dict) -> dict:
        return merge_pending_state(previous, checkpoint.get("files", []))

    @classmethod
    def worktree_pending(cls, record: dict, source_root: Path) -> dict:
        if "pendingChanges" in record:
            return record.get("pendingChanges") or {}
        checkpoint_id = record.get("lastCheckpoint")
        if checkpoint_id:
            checkpoint = CheckpointStore(source_root).get_checkpoint(checkpoint_id)
            if checkpoint:
                return cls.merge_pending_changes({}, checkpoint)
        return {}

    @staticmethod
    def new_task_action(
        *,
        checkpoint_id: str,
        scope: str,
        record: dict,
        pending_before: dict,
        pending_after: dict,
        status_after: str,
        applied_before: dict | None = None,
        applied_after: dict | None = None,
        last_changes_after: list[str] | None = None,
    ) -> dict:
        applied_before_source = record.get("appliedWorktreeChanges", {}) if applied_before is None else applied_before
        applied_after_source = record.get("appliedWorktreeChanges", {}) if applied_after is None else applied_after
        return {
            "checkpointId": checkpoint_id,
            "scope": scope,
            "createdAtMs": int(time.time() * 1000),
            "pendingBefore": {k: dict(v) for k, v in (pending_before or {}).items()},
            "pendingAfter": {k: dict(v) for k, v in (pending_after or {}).items()},
            "appliedBefore": {k: dict(v) for k, v in (applied_before_source or {}).items()},
            "appliedAfter": {k: dict(v) for k, v in (applied_after_source or {}).items()},
            "statusBefore": record.get("status", "ready"),
            "statusAfter": status_after,
            "lastChangesBefore": list(record.get("lastChanges") or []),
            "lastChangesAfter": list(last_changes_after or []),
            "stateComplete": True,
        }

    def task_action_history(self, record: dict, *, persist_recovery: bool = True) -> list[dict]:
        actions = [dict(item) for item in (record.get("actionHistory") or []) if isinstance(item, dict)]
        known = {str(item.get("checkpointId")) for item in actions if item.get("checkpointId")}
        recovered = False
        tagged_recovery = False

        stores: list[CheckpointStore] = []
        if self.project_checkpoints:
            stores.append(self.project_checkpoints)
        worktree = record.get("worktree") or {}
        if worktree.get("enabled") and worktree.get("path"):
            try:
                wt_path = Path(worktree["path"])
                if wt_path.exists():
                    stores.append(CheckpointStore(wt_path))
            except Exception:
                pass

        for store in stores:
            for cp in store.list_checkpoints(task_id=record.get("id")):
                metadata = cp.get("metadata") or {}
                action = metadata.get("action")
                if not isinstance(action, dict) or not action.get("checkpointId"):
                    continue
                checkpoint_id = str(action["checkpointId"])
                if checkpoint_id in known:
                    continue
                state = cp.get("state") or "applied"
                after_verified = False
                if state == "ready":
                    try:
                        store.verify_checkpoint_state(cp["id"], use_after=True)
                        after_verified = True
                    except Exception:
                        after_verified = False
                if not checkpoint_recovery_eligible(state, after_bytes_verified=after_verified):
                    continue
                recovered_action = dict(action)
                recovered_action["recoveredFromCheckpoint"] = True
                actions.append(recovered_action)
                known.add(checkpoint_id)
                recovered = True
                tagged_recovery = True

        if not actions:
            scope = record.get("lastCheckpointScope")
            last_cp = record.get("lastCheckpoint")
            main_cp = record.get("mainProjectCheckpoint")
            if last_cp and scope in (None, "worktree", "main_apply") and worktree.get("path"):
                try:
                    cp = CheckpointStore(Path(worktree["path"])).get_checkpoint(last_cp)
                except Exception:
                    cp = None
                if cp:
                    pending_after = (
                        (record.get("appliedWorktreeChanges") or {})
                        if scope == "main_apply"
                        else (record.get("pendingChanges") or {})
                    )
                    actions.append(
                        {
                            "checkpointId": last_cp,
                            "scope": "worktree",
                            "createdAtMs": cp.get("createdAtMs", 0),
                            "pendingBefore": record.get("pendingChangesBeforeLastPlan") or {},
                            "pendingAfter": pending_after,
                            "appliedBefore": {},
                            "appliedAfter": {},
                            "statusBefore": "ready",
                            "statusAfter": "review",
                            "lastChangesBefore": [],
                            "lastChangesAfter": list(record.get("lastChanges") or []),
                            "stateComplete": bool("pendingChangesBeforeLastPlan" in record),
                            "legacy": True,
                        }
                    )
            if main_cp and scope in (None, "main_apply") and self.project_checkpoints:
                cp = self.project_checkpoints.get_checkpoint(main_cp)
                if cp:
                    actions.append(
                        {
                            "checkpointId": main_cp,
                            "scope": "main_apply",
                            "createdAtMs": cp.get("createdAtMs", 0),
                            "pendingBefore": record.get("appliedWorktreeChanges") or {},
                            "pendingAfter": record.get("pendingChanges") or {},
                            "appliedBefore": {},
                            "appliedAfter": record.get("appliedWorktreeChanges") or {},
                            "statusBefore": "review",
                            "statusAfter": record.get("status", "applied"),
                            "lastChangesBefore": list(record.get("lastChanges") or []),
                            "lastChangesAfter": list(record.get("lastChanges") or []),
                            "stateComplete": True,
                            "legacy": True,
                        }
                    )
            elif last_cp and scope in (None, "project") and self.project_checkpoints:
                cp = self.project_checkpoints.get_checkpoint(last_cp)
                if cp:
                    actions.append(
                        {
                            "checkpointId": last_cp,
                            "scope": "project",
                            "createdAtMs": cp.get("createdAtMs", 0),
                            "pendingBefore": {},
                            "pendingAfter": {},
                            "appliedBefore": {},
                            "appliedAfter": {},
                            "statusBefore": "ready",
                            "statusAfter": record.get("status", "changed"),
                            "lastChangesBefore": [],
                            "lastChangesAfter": list(record.get("lastChanges") or []),
                            "stateComplete": False,
                            "legacy": True,
                        }
                    )
            recovered = bool(actions)

        actions.sort(key=lambda item: (int(item.get("createdAtMs") or 0), str(item.get("checkpointId") or "")))
        if recovered and persist_recovery and actions != (record.get("actionHistory") or []):
            try:
                if tagged_recovery and actions:
                    latest = actions[-1]
                    latest_working = next(
                        (a for a in reversed(actions) if a.get("scope") in {"worktree", "project"}), None
                    )
                    latest_main = next((a for a in reversed(actions) if a.get("scope") == "main_apply"), None)
                    pending_after = {k: dict(v) for k, v in (latest.get("pendingAfter") or {}).items()}
                    self.thread_store.patch(
                        record["id"],
                        actionHistory=actions,
                        status=latest.get("statusAfter") or record.get("status", "ready"),
                        pendingChanges=pending_after,
                        appliedWorktreeChanges={k: dict(v) for k, v in (latest.get("appliedAfter") or {}).items()},
                        lastChanges=list(latest.get("lastChangesAfter") or []),
                        lastCheckpoint=latest_working.get("checkpointId") if latest_working else None,
                        mainProjectCheckpoint=latest_main.get("checkpointId") if latest_main else None,
                        lastCheckpointScope=latest.get("scope"),
                        lastDiff=self.pending_diff(pending_after) if pending_after else record.get("lastDiff", ""),
                        lastError="",
                    )
                else:
                    self.thread_store.patch(record["id"], actionHistory=actions)
            except Exception:
                pass
        return actions

    def prepare_agent_plan(
        self, plan: AgentPlan, execution_root: Path, worktree_info: dict, thread_id: str
    ) -> PreparedAgentChanges:
        isolated = bool(worktree_info.get("enabled"))
        record = self.thread_store.get(thread_id) or {}
        previous_pending = self.worktree_pending(record, execution_root) if isolated else {}
        location = "isolated worktree" if isolated else "main project"
        if not plan.changes:
            return PreparedAgentChanges(
                thread_id, execution_root, worktree_info, isolated, record, previous_pending,
                None, None, "", location,
            )
        store = CheckpointStore(execution_root)
        preview = store.preview(plan.changes)
        return PreparedAgentChanges(
            thread_id, execution_root, worktree_info, isolated, record, previous_pending,
            store, preview, self.checkpoint_diff(preview), location,
        )

    def record_no_changes(self, plan: AgentPlan, prepared: PreparedAgentChanges) -> None:
        self.thread_store.add_message(prepared.thread_id, "assistant", plan.summary or "No changes proposed.")
        self.thread_store.patch(
            prepared.thread_id,
            status="review" if prepared.previous_pending else "ready",
            pendingChanges=prepared.previous_pending if prepared.isolated else {},
        )

    def reject_plan(self, plan: AgentPlan, prepared: PreparedAgentChanges) -> None:
        self.thread_store.add_message(
            prepared.thread_id,
            "assistant",
            (plan.summary or "Changes proposed.") + "\n\nChanges were not applied.",
        )
        self.thread_store.patch(
            prepared.thread_id,
            status="review" if prepared.previous_pending else "ready",
            pendingChanges=prepared.previous_pending if prepared.isolated else {},
        )
        if self.activity:
            self.activity.add(
                {"action": "agent_rejected", "threadId": prepared.thread_id, "files": [c.path for c in plan.changes]}
            )

    def apply_reviewed_plan(self, plan: AgentPlan, prepared: PreparedAgentChanges) -> AppliedAgentChanges:
        if not prepared.has_changes or not prepared.store or not prepared.preview:
            raise ValueError("No reviewed changes are available to apply.")
        pending = (
            self.merge_pending_changes(prepared.previous_pending, prepared.preview) if prepared.isolated else {}
        )
        status = "review" if prepared.isolated else "changed"
        scope = "worktree" if prepared.isolated else "project"
        existing_actions = self.task_action_history(prepared.record, persist_recovery=False)
        action = self.new_task_action(
            checkpoint_id=prepared.preview["id"],
            scope=scope,
            record=prepared.record,
            pending_before=prepared.previous_pending if prepared.isolated else {},
            pending_after=pending if prepared.isolated else {},
            status_after=status,
            applied_before=prepared.record.get("appliedWorktreeChanges", {}) if prepared.isolated else {},
            applied_after=prepared.record.get("appliedWorktreeChanges", {}) if prepared.isolated else {},
            last_changes_after=[c.path for c in plan.changes],
        )
        cp = prepared.store.create(
            plan.changes,
            expected=prepared.preview,
            metadata={"taskId": prepared.thread_id, "scope": scope, "action": action},
        )
        prepared.store.apply(cp)
        try:
            self.thread_store.patch(
                prepared.thread_id,
                status=status,
                lastChanges=[c.path for c in plan.changes],
                lastCheckpoint=cp["id"],
                pendingChanges=pending if prepared.isolated else {},
                pendingChangesBeforeLastPlan=prepared.previous_pending if prepared.isolated else {},
                lastCheckpointBeforeLastPlan=prepared.record.get("lastCheckpoint"),
                lastCheckpointScopeBeforeLastPlan=prepared.record.get("lastCheckpointScope"),
                lastCheckpointScope=scope,
                actionHistory=existing_actions + [action],
            )
        except Exception as record_exc:
            try:
                prepared.store.mark_state(
                    cp["id"],
                    "history-recovery-needed",
                    historyError=str(record_exc),
                    affectedPaths=[item["path"] for item in cp.get("files", [])],
                )
            except Exception:
                pass
            raise AppliedHistoryPersistenceError(
                "Changes WERE applied, but task history could not be saved. "
                "The checkpoint was retained for recovery.",
                checkpoint_id=cp["id"],
            ) from record_exc

        allowed = [check["command"] for check in plan.command_checks if check["allowed"]]
        return AppliedAgentChanges(
            thread_id=prepared.thread_id,
            execution_root=prepared.execution_root,
            isolated=prepared.isolated,
            pending=pending,
            previous_pending=prepared.previous_pending,
            record_before_apply=prepared.record,
            checkpoint=cp,
            status=status,
            allowed_commands=allowed,
        )

    def worktree_main_conflicts(self, record: dict, worktree_info: dict, paths: list[str]) -> list[str]:
        """Detect unsafe main-project divergence for a task worktree apply.

        A path already applied by this same task is compared to the exact last AI-CODER-applied
        text snapshot instead of the original Git base commit. This permits legitimate repeated
        apply cycles while still blocking any user/external edit made after the previous apply.
        """
        if not self.project_checkpoints:
            return list(paths)
        previously_applied = record.get("appliedWorktreeChanges") or {}
        conflicts: list[str] = []
        base_checked: list[str] = []
        for rel in paths:
            if rel not in previously_applied:
                base_checked.append(rel)
                continue
            expected = previously_applied[rel].get("after")
            try:
                current = read_workspace_text(self.project_checkpoints.root, rel)
            except Exception:
                conflicts.append(rel)
                continue
            if current != expected:
                conflicts.append(rel)
        if base_checked:
            if self.worktrees:
                conflicts.extend(
                    self.worktrees.conflicting_paths(str(worktree_info.get("baseCommit", "")), base_checked)
                )
            else:
                conflicts.extend(base_checked)
        return sorted(set(conflicts))

    def prepare_worktree_apply(self, thread_id: str) -> PreparedWorktreeApply:
        """Build a write-free reviewed snapshot for applying one task worktree to the main project."""
        if not self.project_checkpoints:
            raise ValueError("Project checkpoint storage is unavailable.")
        record = self.thread_store.get(thread_id)
        if not record:
            raise ValueError("Task not found.")
        worktree = record.get("worktree") or {}
        if not worktree.get("enabled") or not worktree.get("path"):
            raise ValueError("This task is not using an isolated worktree.")
        source_root = Path(worktree["path"])
        if not source_root.is_dir():
            raise ValueError("This task's isolated worktree is missing.")

        pending = self.worktree_pending(record, source_root)
        paths = sorted(pending)
        if not paths:
            raise ValueError("No task changes are available to apply.")

        changes: list[Change] = []
        for rel in paths:
            current = read_workspace_text(source_root, rel)
            expected = pending[rel].get("after")
            if current != expected:
                raise ValueError(f"{rel} changed after review. Refresh the diff and review it again.")
            changes.append(Change(rel, expected))

        conflicts = self.worktree_main_conflicts(record, worktree, paths)
        if conflicts:
            raise WorktreeApplyConflictError(conflicts)

        preview = self.project_checkpoints.preview(changes)
        return PreparedWorktreeApply(
            thread_id=thread_id,
            source_root=source_root,
            worktree_info=dict(worktree),
            record=record,
            pending={k: dict(v) for k, v in pending.items()},
            changes=changes,
            preview=preview,
            diff_text=self.checkpoint_diff(preview),
        )

    def apply_worktree_to_project(self, prepared: PreparedWorktreeApply) -> AppliedWorktreeToProject:
        """Apply a previously reviewed task worktree snapshot after revalidating both sides."""
        if not self.project_checkpoints:
            raise ValueError("Project checkpoint storage is unavailable.")
        record = self.thread_store.get(prepared.thread_id)
        if not record:
            raise ValueError("Task not found.")
        worktree = record.get("worktree") or {}
        current_pending = self.worktree_pending(record, prepared.source_root)
        reviewed_record = dict(record)
        reviewed_record["pendingChanges"] = current_pending
        normalized_review = dict(prepared.worktree_info)
        normalized_review["path"] = str(prepared.source_root)
        normalized_current = dict(worktree)
        if normalized_current.get("path"):
            try:
                normalized_current["path"] = str(Path(normalized_current["path"]).resolve())
                normalized_review["path"] = str(prepared.source_root.resolve())
            except Exception:
                pass
        reviewed_record["worktree"] = normalized_current
        if not same_worktree_identity(normalized_current, normalized_review):
            raise ValueError("The task worktree changed after review. Review the updated task before applying.")
        if (reviewed_record.get("pendingChanges") or {}) != prepared.pending:
            raise ValueError("The pending task changes changed after review. Review the updated diff before applying.")

        paths = list(prepared.paths)
        for rel in paths:
            if read_workspace_text(prepared.source_root, rel) != prepared.pending[rel].get("after"):
                raise ValueError(f"{rel} changed while the diff was open. Review the updated diff before applying.")

        conflicts = self.worktree_main_conflicts(record, worktree, paths)
        if conflicts:
            raise WorktreeApplyConflictError(conflicts)

        existing_actions = self.task_action_history(record, persist_recovery=False)
        applied_before = {k: dict(v) for k, v in (record.get("appliedWorktreeChanges") or {}).items()}
        applied_after = {k: dict(v) for k, v in applied_before.items()}
        for rel, item in prepared.pending.items():
            applied_after[rel] = dict(item)
        action = self.new_task_action(
            checkpoint_id=prepared.preview["id"],
            scope="main_apply",
            record=record,
            pending_before=prepared.pending,
            pending_after={},
            status_after="applied",
            applied_before=applied_before,
            applied_after=applied_after,
            last_changes_after=paths,
        )
        cp = self.project_checkpoints.create(
            prepared.changes,
            expected=prepared.preview,
            metadata={"taskId": prepared.thread_id, "scope": "main_apply", "action": action},
        )
        self.project_checkpoints.apply(cp)
        try:
            reviewed_history = record.get("actionHistory") or []
            reviewed_applied = record.get("appliedWorktreeChanges") or {}

            def persist_apply(current: dict):
                current_worktree = current.get("worktree") or {}
                same_current_worktree = (
                    current_worktree.get("enabled")
                    and current_worktree.get("path")
                    and Path(current_worktree["path"]).resolve() == prepared.source_root.resolve()
                    and str(current_worktree.get("branch") or "") == str(prepared.worktree_info.get("branch") or "")
                    and str(current_worktree.get("baseCommit") or "") == str(prepared.worktree_info.get("baseCommit") or "")
                )
                if not same_current_worktree or (current.get("pendingChanges") or {}) != prepared.pending:
                    raise RuntimeError("Task state changed while the reviewed main-project apply was being committed.")
                if (current.get("actionHistory") or []) != reviewed_history:
                    raise RuntimeError("Task action history changed while the reviewed main-project apply was being committed.")
                if (current.get("appliedWorktreeChanges") or {}) != reviewed_applied:
                    raise RuntimeError("Applied-worktree state changed while the reviewed main-project apply was being committed.")
                current.update(
                    status="applied",
                    mainProjectCheckpoint=cp["id"],
                    pendingChanges={},
                    appliedWorktreeChanges=applied_after,
                    mainApplyPreviousScope=record.get("lastCheckpointScope")
                    or ("worktree" if record.get("lastCheckpoint") else None),
                    lastCheckpointScope="main_apply",
                    actionHistory=existing_actions + [action],
                )
                current.setdefault("messages", []).append({
                    "role": "assistant",
                    "content": (
                        f"Reviewed worktree changes were applied to the main project. "
                        f"Main-project checkpoint: {cp['id'][:8]}."
                    ),
                    "at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                })
                return current

            self.thread_store.mutate(prepared.thread_id, persist_apply)
        except Exception as record_exc:
            try:
                self.project_checkpoints.mark_state(
                    cp["id"],
                    "history-recovery-needed",
                    historyError=str(record_exc),
                    affectedPaths=paths,
                )
            except Exception:
                pass
            raise AppliedHistoryPersistenceError(
                "The reviewed files WERE applied to the main project, but task history could not be saved. "
                "The checkpoint was retained and tagged for recovery.",
                checkpoint_id=cp["id"],
            ) from record_exc

        if self.activity:
            try:
                self.activity.add(
                    {
                        "action": "worktree_apply_to_project",
                        "threadId": prepared.thread_id,
                        "checkpointId": cp["id"],
                        "files": paths,
                    }
                )
            except Exception:
                # The file mutation and task record are already durable. An audit-log
                # write must not turn a successful apply into a reported failure.
                pass
        return AppliedWorktreeToProject(
            thread_id=prepared.thread_id,
            checkpoint=cp,
            paths=tuple(paths),
            status_text=f"Applied {len(paths)} reviewed file(s) to main project.",
        )

    def undo_last_task_action(self, thread_id: str) -> UndoTaskActionResult | None:
        """Undo the latest recoverable action for one task, independent of any UI."""
        record = self.thread_store.get(thread_id)
        if not record:
            raise ValueError("Task not found.")
        actions = self.task_action_history(record)
        if not actions:
            return None
        action = actions[-1]
        checkpoint_id = action.get("checkpointId")
        scope = action.get("scope")
        if not checkpoint_id or scope not in {"worktree", "project", "main_apply"}:
            raise ValueError("The latest task action has incomplete undo metadata.")

        if scope == "worktree":
            worktree = record.get("worktree") or {}
            if not worktree.get("enabled") or not worktree.get("path"):
                raise ValueError("The latest action belongs to an isolated worktree that is no longer available.")
            root = Path(worktree["path"])
            if not root.exists():
                raise ValueError("The latest action's worktree is missing; its checkpoint cannot be safely undone.")
            store = CheckpointStore(root)
        else:
            if not self.project_checkpoints:
                raise ValueError("Project checkpoint storage is unavailable.")
            store = self.project_checkpoints

        existing_cp = store.get_checkpoint(checkpoint_id)
        if existing_cp is None:
            return None
        if existing_cp.get("state") == "undone-pending-history":
            cp = store.verify_checkpoint_state(checkpoint_id, use_after=False)
        else:
            cp = store.undo_checkpoint(checkpoint_id, remove=False)
        if cp is None:
            return None

        remaining = actions[:-1]
        pending_before = {k: dict(v) for k, v in (action.get("pendingBefore") or {}).items()}
        applied_before = {k: dict(v) for k, v in (action.get("appliedBefore") or {}).items()}
        if action.get("stateComplete", True):
            restored_status = action.get("statusBefore") or ("review" if pending_before else "ready")
            restored_changes = list(action.get("lastChangesBefore") or [])
        else:
            restored_status = "review" if pending_before else ("applied" if applied_before else "ready")
            restored_changes = []

        latest_working = next(
            (a for a in reversed(remaining) if a.get("scope") in {"worktree", "project"}), None
        )
        latest_main = next((a for a in reversed(remaining) if a.get("scope") == "main_apply"), None)
        latest_scope = remaining[-1].get("scope") if remaining else None
        last_diff = self.pending_diff(pending_before) if pending_before else ""

        try:
            def persist_undo(current: dict):
                current_actions = current.get("actionHistory") or []
                if not current_actions or current_actions[-1].get("checkpointId") != checkpoint_id:
                    raise RuntimeError("Task action history changed while Undo was being committed.")
                current.update(
                    status=restored_status,
                    lastChanges=restored_changes,
                    pendingChanges=pending_before,
                    appliedWorktreeChanges=applied_before,
                    actionHistory=remaining,
                    lastCheckpoint=latest_working.get("checkpointId") if latest_working else None,
                    mainProjectCheckpoint=latest_main.get("checkpointId") if latest_main else None,
                    lastCheckpointScope=latest_scope,
                    lastCheckpointBeforeLastPlan=None,
                    lastCheckpointScopeBeforeLastPlan=None,
                    pendingChangesBeforeLastPlan={},
                    mainApplyPreviousScope=None,
                    lastDiff=last_diff,
                    lastError="",
                )
                current.setdefault("messages", []).append({
                    "role": "assistant",
                    "content": f"Undid the latest {scope.replace('_', ' ')} action for this task ({cp['id'][:8]}).",
                    "at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                })
                return current

            self.thread_store.mutate(thread_id, persist_undo)
        except Exception as record_exc:
            raise UndoHistoryPersistenceError(
                "The files WERE restored, but task history could not be saved. The checkpoint was retained "
                "in an undo-pending state; retry Undo after resolving the storage error.",
                checkpoint_id=checkpoint_id,
            ) from record_exc

        try:
            store.finalize_undo(checkpoint_id)
        except Exception:
            # Bytes and task history are already restored. A retained
            # undone-pending-history checkpoint is safe and can be cleaned later.
            pass
        if self.activity:
            try:
                self.activity.add(
                    {
                        "action": "undo",
                        "threadId": thread_id,
                        "checkpointId": cp["id"],
                        "scope": scope,
                        "files": [f["path"] for f in cp["files"]],
                    }
                )
            except Exception:
                pass
        return UndoTaskActionResult(
            thread_id=thread_id,
            checkpoint=cp,
            scope=scope,
            status_text=f"Restored {len(cp['files'])} file(s) from this task's latest action.",
        )

    def mark_verification_running(self, applied: AppliedAgentChanges) -> None:
        self.thread_store.patch(
            applied.thread_id,
            verification={"status": "running", "commands": list(applied.allowed_commands)},
        )

    def run_verification(self, plan: AgentPlan, execution_root: Path) -> list[dict]:
        results: list[dict] = []
        for check in plan.command_checks:
            if check["allowed"]:
                results.append(self.verification.run(check["command"], execution_root))
            else:
                results.append({"command": check["command"], "skipped": True, "reason": check["reason"]})
        return results

    @staticmethod
    def declined_verification_results(plan: AgentPlan) -> list[dict]:
        return [
            {
                "command": check["command"],
                "skipped": True,
                "reason": check["reason"] if not check["allowed"] else "User declined command execution",
            }
            for check in plan.command_checks
        ]

    def finalize_agent_apply(
        self,
        profile: ExecutionProfile,
        plan: AgentPlan,
        applied: AppliedAgentChanges,
        results: list[dict],
    ) -> FinalizedAgentChanges:
        summary = (plan.summary or "Applied AI changes.") + "\n\nChanged:\n" + "\n".join(
            f"- {c.path}" for c in plan.changes
        )
        if applied.isolated:
            summary += (
                "\n\nChanges are isolated in this task's Git worktree. Review the Changes tab, "
                "then choose Apply to Project when ready."
            )
        else:
            summary += f"\n\nChanges were applied to the main project. Checkpoint: {applied.checkpoint['id'][:8]}."

        diff_text = (
            self.pending_diff(applied.pending)
            if applied.isolated
            else self.checkpoint_diff(applied.checkpoint)
        )
        extras: list[str] = []
        if applied.isolated:
            try:
                changed_paths = self.worktrees.changed_paths(applied.execution_root) if self.worktrees else set()
            except Exception:
                changed_paths = set(applied.pending)
                diff_text += (
                    "\n\nCould not inspect additional worktree changes; only the pending AI-CODER files "
                    "will be eligible to apply."
                )
            extras = sorted(changed_paths - set(applied.pending))
            if extras:
                diff_text += "\n\n--- Worktree files not included in this pending apply ---\n" + "\n".join(extras)

        self.thread_store.add_message(applied.thread_id, "assistant", summary)
        self.thread_store.patch(
            applied.thread_id,
            status=applied.status,
            lastChanges=[c.path for c in plan.changes],
            lastCheckpoint=applied.checkpoint["id"],
            lastDiff=diff_text,
            pendingChanges=applied.pending if applied.isolated else {},
            pendingChangesBeforeLastPlan=applied.previous_pending if applied.isolated else {},
            appliedWorktreeChanges=(
                applied.record_before_apply.get("appliedWorktreeChanges", {}) if applied.isolated else {}
            ),
            verification={"status": "complete", "results": results},
        )
        if self.activity:
            self.activity.add(
                {
                    "action": "agent_apply",
                    "threadId": applied.thread_id,
                    "checkpointId": applied.checkpoint["id"],
                    "isolated": applied.isolated,
                    "files": [c.path for c in plan.changes],
                    "commands": results,
                }
            )
        return FinalizedAgentChanges(
            summary=summary,
            diff_text=diff_text,
            extra_worktree_paths=tuple(extras),
            status_text=f"Agent used {profile.display_name} • {profile.effort}",
        )
