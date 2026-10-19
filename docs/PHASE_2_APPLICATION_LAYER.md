# Phase 2 — Application-Layer Extraction

AI-CODER v0.5.1 moves the primary Agent lifecycle out of Tkinter without changing the trusted filesystem/checkpoint boundary.

## Ownership after Phase 2

```text
Tkinter / future Code-OSS client
  ├─ collects prompt/options
  ├─ displays progress
  ├─ asks explicit diff approval
  ├─ asks explicit verification-command approval
  └─ renders terminal/result state
             |
             v
Application layer
  ├─ AgentLifecycleService
  │   ├─ provider reachability
  │   ├─ model routing
  │   ├─ execution-root/worktree selection
  │   ├─ context assembly
  │   ├─ provider invocation
  │   ├─ activity evidence
  │   └─ Agent-plan parsing/validation
  │
  ├─ ChangeApplicationService
  │   ├─ write-free preview
  │   ├─ diff generation
  │   ├─ checkpoint create/apply
  │   ├─ pending worktree state
  │   ├─ recovery/action history
  │   ├─ verification orchestration
  │   └─ final task persistence
  │
  └─ VerificationService
      └─ exact allowlisted shell-free command execution
             |
             v
Trusted core
  policy • safe I/O • checkpoints • worktrees • thread state • providers
```

## Trust invariant

The UI still decides whether a reviewed patch or approved verification command may proceed. The application layer performs the operation and returns/persists real evidence. No UI path is allowed to manufacture success.

## Settings snapshot

Each submitted task carries an immutable snapshot of the runtime settings needed by the execution (provider endpoint, Ollama endpoint, context budget, and selected routing/model/effort options). Later UI preference changes therefore do not silently alter an already-running task.

## Compatibility

Legacy `AICoderApp` helper methods remain as thin facades for existing tests and callers while migration proceeds. They delegate to `ChangeApplicationService` rather than retaining separate implementations.

## Intentionally deferred to Phase 3

- Move reviewed worktree-to-main apply orchestration out of Tkinter.
- Move task-local undo/recovery orchestration out of Tkinter.
- Define a transport-neutral command/event API for Code-OSS.
- Port persistent task threads and worktree lifecycle into the Code-OSS client/runtime.
- Introduce shared behavioral vectors for Python/TypeScript parity.

## Phase 3 follow-up

The worktree-to-main apply, task-local undo/recovery, transport-neutral command/event boundary, and initial Code-OSS persistent task/worktree lifecycle listed above were implemented in v0.5.2. See `PHASE_3_TASK_WORKTREE_CONVERGENCE.md`.
