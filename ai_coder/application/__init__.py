"""UI-independent application services for AI-CODER.

This package is the migration boundary between the transition Tkinter shell and
future Code-OSS/React clients. UI code owns presentation and explicit approvals;
routing, context/model invocation, reviewed change application, recovery state,
and verification semantics live here.
"""

from .agent_lifecycle import AgentLifecycleService, AgentRunResult
from .api import ApplicationApi, ApplicationEvent
from .changes import (
    AppliedAgentChanges,
    AppliedHistoryPersistenceError,
    AppliedWorktreeToProject,
    ChangeApplicationService,
    FinalizedAgentChanges,
    PreparedAgentChanges,
    PreparedWorktreeApply,
    UndoHistoryPersistenceError,
    UndoTaskActionResult,
    WorktreeApplyConflictError,
)
from .verification import VerificationService

__all__ = [
    "AgentLifecycleService",
    "AgentRunResult",
    "ApplicationApi",
    "ApplicationEvent",
    "AppliedAgentChanges",
    "AppliedHistoryPersistenceError",
    "AppliedWorktreeToProject",
    "ChangeApplicationService",
    "FinalizedAgentChanges",
    "PreparedAgentChanges",
    "PreparedWorktreeApply",
    "UndoHistoryPersistenceError",
    "UndoTaskActionResult",
    "VerificationService",
    "WorktreeApplyConflictError",
]
