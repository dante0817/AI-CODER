from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class TaskStatus(str, Enum):
    READY = "ready"
    QUEUED = "queued"
    ROUTING = "routing"
    GATHERING_CONTEXT = "gathering_context"
    CALLING_MODEL = "calling_model"
    AWAITING_REVIEW = "awaiting_review"
    APPLYING = "applying"
    VERIFYING = "verifying"
    REVIEW = "review"
    CHANGED = "changed"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    CONFLICT = "conflict"
    RECOVERY_REQUIRED = "recovery_required"


@dataclass(frozen=True)
class ExecutionSnapshot:
    task_id: str
    mode: str
    routing_mode: str
    provider: str
    model: str
    effort: str
    include_workspace: bool = False
    use_worktree: bool = True


@dataclass(frozen=True)
class ContextItem:
    label: str
    source: str
    reason: str
    estimated_chars: int
    priority: int


@dataclass
class ContextManifest:
    max_chars: int
    used_chars: int = 0
    items: list[ContextItem] = field(default_factory=list)
