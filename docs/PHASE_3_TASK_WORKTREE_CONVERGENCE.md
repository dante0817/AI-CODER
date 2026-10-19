# Phase 3 — Task / Worktree Convergence

AI-CODER v0.5.2 moves the remaining trusted task-mutation orchestration out of Tkinter and begins real task/worktree parity in the Code-OSS target shell.

## Python application boundary

`ChangeApplicationService` now owns:

- write-free preparation of a task worktree → main-project apply
- source-worktree byte/text revalidation after review
- trusted-baseline conflict checks: original Git base for first apply, then the exact last AI-CODER-applied main snapshot for repeated applies
- main-project checkpoint creation and application
- pending/applied worktree task-state transitions
- task-local undo across `worktree`, `project`, and `main_apply` scopes
- retained `undone-pending-history` checkpoints when bytes were restored but task history could not be saved

`ApplicationApi` provides a transport-neutral command/event facade using JSON-safe dictionaries:

```text
task.list
task.get
worktree.prepare_apply
worktree.discard_apply_preview
worktree.apply
task.undo
```

A worktree apply is a two-step protocol:

```text
prepare_apply
  ↓
backend creates write-free preview
  ↓
returns one-time reviewId + exact diff
  ↓
UI obtains explicit approval
  ↓
apply(reviewId)
  ↓
backend revalidates task/worktree state + worktree bytes + trusted main baseline + main checkpoint preimage
  ↓
write
```

The review object remains backend-owned. A client cannot manufacture its own reviewed state merely by posting file contents.

The backend also rejects an apply when pending task state, worktree identity/base commit, or source bytes changed while the diff was open. For a path previously applied by the same task, main-project conflict detection compares against the exact last AI-CODER-applied snapshot rather than the original Git base, allowing legitimate repeated apply cycles without ignoring external edits.

## Tkinter after Phase 3

Tkinter remains a transition UI. For worktree-to-main and Undo it now:

1. asks the application API for authoritative state/evidence,
2. displays the returned diff,
3. obtains explicit user approval,
4. submits the one-time review ID, and
5. renders the real result/error.

It no longer owns the underlying mutation/recovery algorithm.

## Code-OSS task state

Code-OSS now has a persistent `TaskStore` with serialized read-modify-write mutation. Each task retains:

- messages
- status
- execution profile metadata
- worktree metadata
- pending worktree changes
- applied-worktree state
- checkpoint IDs
- action history
- verification results
- error state

The former single global chat history is migrated into the initial task once.

## Code-OSS isolated Agent flow

```text
Task
  ↓
Agent + isolated worktree enabled
  ↓
Git worktree ensure/create
  ↓
context reads active/workspace files from task execution root
  ↓
model plan
  ↓
write-free checkpoint preview
  ↓
explicit review
  ↓
checkpoint apply inside worktree
  ↓
approved verification inside worktree
  ↓
pending reviewed task state
  ↓
Apply to Main
  ↓
trusted-baseline conflict check
  ↓
main-project preview + explicit review
  ↓
main-project checkpoint + apply
```

If a task already has pending isolated changes, AI-CODER refuses to silently switch that Agent task to direct-main execution.

## Recovery semantics

Code-OSS now retains a named checkpoint during Undo until the task record is safely updated. It can also reconstruct a missing task action from checkpoint metadata when:

- file application completed,
- checkpoint evidence exists, and
- task metadata persistence failed.

A checkpoint left in `ready` state is treated as applied only after current file bytes are verified against its reviewed postimage.

## Still transitional

Phase 3 does not establish final Python/TypeScript parity. Remaining work includes shared behavioral vectors, richer smart-context ranking, authoritative provider/model capability provenance, durable file-backed Code-OSS checkpoint/task storage, full Code-OSS product branding/build integration, and eventual retirement of the Tkinter production runtime after parity evidence exists.
