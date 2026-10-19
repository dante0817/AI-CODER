from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass
from typing import Callable, Mapping

from ..core.threads import ThreadStore
from .changes import (
    AppliedHistoryPersistenceError,
    ChangeApplicationService,
    PreparedWorktreeApply,
    UndoHistoryPersistenceError,
    WorktreeApplyConflictError,
)


@dataclass(frozen=True)
class ApplicationEvent:
    type: str
    payload: dict

    def as_dict(self) -> dict:
        return {"type": self.type, **self.payload}


class ApplicationApi:
    """Transport-neutral command/event facade.

    Commands and results are plain JSON-safe dictionaries so Tkinter, a local RPC
    adapter, or Code-OSS can use the same application boundary. Review objects remain
    server-side and are referenced by one-time review IDs. Every mutating operation
    revalidates filesystem/task state before writing.
    """

    def __init__(
        self,
        *,
        thread_store: ThreadStore,
        changes: ChangeApplicationService,
        emit: Callable[[dict], None] | None = None,
    ):
        self.thread_store = thread_store
        self.changes = changes
        self.emit = emit
        self._worktree_reviews: dict[str, PreparedWorktreeApply] = {}
        self._review_lock = threading.Lock()

    def _event(self, event_type: str, **payload) -> dict:
        event = ApplicationEvent(event_type, payload).as_dict()
        if self.emit:
            self.emit(event)
        return event

    def dispatch(self, command: Mapping[str, object]) -> dict:
        kind = str(command.get("type") or "")
        try:
            if kind == "task.list":
                tasks = self.thread_store.list()
                return self._event("task.list.result", tasks=tasks)

            if kind == "task.get":
                task_id = str(command.get("taskId") or "")
                record = self.thread_store.get(task_id)
                if not record:
                    raise ValueError("Task not found.")
                return self._event("task.get.result", task=record)

            if kind == "worktree.prepare_apply":
                task_id = str(command.get("taskId") or "")
                prepared = self.changes.prepare_worktree_apply(task_id)
                review_id = str(uuid.uuid4())
                # Keep at most one live main-project review per task.
                with self._review_lock:
                    for key, item in list(self._worktree_reviews.items()):
                        if item.thread_id == task_id:
                            self._worktree_reviews.pop(key, None)
                    self._worktree_reviews[review_id] = prepared
                return self._event(
                    "worktree.apply_preview_ready",
                    taskId=task_id,
                    reviewId=review_id,
                    paths=list(prepared.paths),
                    diffText=prepared.diff_text,
                    location="main project",
                )

            if kind == "worktree.discard_apply_preview":
                review_id = str(command.get("reviewId") or "")
                with self._review_lock:
                    prepared = self._worktree_reviews.pop(review_id, None)
                return self._event(
                    "worktree.apply_preview_discarded",
                    reviewId=review_id,
                    taskId=prepared.thread_id if prepared else None,
                )

            if kind == "worktree.apply":
                review_id = str(command.get("reviewId") or "")
                with self._review_lock:
                    prepared = self._worktree_reviews.pop(review_id, None)
                if not prepared:
                    raise ValueError("This apply review is no longer active. Review the current diff again.")
                result = self.changes.apply_worktree_to_project(prepared)
                return self._event(
                    "worktree.applied_to_project",
                    taskId=result.thread_id,
                    checkpointId=result.checkpoint["id"],
                    paths=list(result.paths),
                    statusText=result.status_text,
                )

            if kind == "task.undo":
                task_id = str(command.get("taskId") or "")
                result = self.changes.undo_last_task_action(task_id)
                if result is None:
                    return self._event("task.undo_unavailable", taskId=task_id)
                return self._event(
                    "task.undo_completed",
                    taskId=result.thread_id,
                    checkpointId=result.checkpoint["id"],
                    scope=result.scope,
                    files=[item["path"] for item in result.checkpoint.get("files", [])],
                    statusText=result.status_text,
                )

            raise ValueError(f"Unsupported application command: {kind or '(missing type)'}")
        except WorktreeApplyConflictError as exc:
            self._event("command.failed", command=kind, error=str(exc), conflicts=exc.conflicts)
            raise
        except (AppliedHistoryPersistenceError, UndoHistoryPersistenceError) as exc:
            self._event(
                "command.failed_after_file_change",
                command=kind,
                error=str(exc),
                checkpointId=exc.checkpoint_id,
            )
            raise
        except Exception as exc:
            self._event("command.failed", command=kind, error=str(exc))
            raise
