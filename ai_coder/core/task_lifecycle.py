from __future__ import annotations

STATES = {
    "ready", "routing", "gathering_context", "calling_model", "validating_plan", "awaiting_review",
    "applying", "verifying", "review", "changed", "applied", "failed", "cancelled", "interrupted", "recovery_required",
}
TRANSIENT = {"routing", "gathering_context", "calling_model", "validating_plan", "awaiting_review", "applying", "verifying"}
ALLOWED = {
    "ready": {"routing", "failed", "recovery_required"},
    "review": {"routing", "awaiting_review", "applying", "ready", "failed", "recovery_required"},
    "changed": {"routing", "awaiting_review", "applying", "ready", "failed", "recovery_required"},
    "applied": {"routing", "review", "changed", "ready", "failed", "recovery_required"},
    "failed": {"routing", "ready", "recovery_required"},
    "cancelled": {"routing", "ready"},
    "interrupted": {"routing", "ready", "recovery_required"},
    "recovery_required": {"ready", "review", "changed", "applied", "failed"},
    "routing": {"gathering_context", "ready", "failed", "cancelled", "interrupted"},
    "gathering_context": {"calling_model", "failed", "cancelled", "interrupted"},
    "calling_model": {"validating_plan", "ready", "failed", "cancelled", "interrupted"},
    "validating_plan": {"awaiting_review", "ready", "review", "failed", "cancelled", "interrupted"},
    "awaiting_review": {"applying", "ready", "review", "failed", "cancelled", "interrupted"},
    "applying": {"verifying", "review", "changed", "applied", "recovery_required", "failed", "interrupted"},
    "verifying": {"review", "changed", "applied", "ready", "failed", "cancelled", "interrupted"},
}

def normalize_task_status(value: str | None) -> str:
    status = str(value or "ready").strip().lower()
    return status if status in STATES else "recovery_required"

def can_transition(old: str | None, new: str | None) -> bool:
    old, new = normalize_task_status(old), normalize_task_status(new)
    return old == new or new in ALLOWED.get(old, set())

def assert_transition(old: str | None, new: str | None) -> str:
    old, new = normalize_task_status(old), normalize_task_status(new)
    if not can_transition(old, new):
        raise ValueError(f"Invalid AI-CODER task-state transition: {old} -> {new}")
    return new

def is_transient_state(value: str | None) -> bool:
    return normalize_task_status(value) in TRANSIENT
