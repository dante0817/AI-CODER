# AI-CODER Command-Center Workflow

AI-CODER v0.4 adopts a task-oriented coding-agent workflow while retaining provider independence.

## Core objects

- **Project**: user-selected repository/folder.
- **Task thread**: persistent unit of agent work with its own conversation and execution metadata.
- **Execution profile**: provider + model + effort + routing reason.
- **Task workspace**: isolated Git worktree for Agent mode when available, otherwise the main folder.
- **Change set**: AI-CODER validated file replacements plus allowed verification commands.

## Agent flow

```text
Prompt
→ Task thread
→ Auto/manual execution profile
→ Context + explicit skills
→ Structured change proposal
→ User approval
→ Task checkpoint
→ Worktree write
→ Allowed tests/lint/build
→ Changes diff
→ User review
→ Conflict check
→ Main-project checkpoint
→ Apply to Project
```

## Parallelism

Different task threads can execute simultaneously in background Python workers. When Git worktrees are enabled, Agent tasks modify separate filesystem workspaces, reducing collision between parallel tasks.

## Safety boundary

The model proposes. AI-CODER authorizes and executes.

Account-backed Codex is an explicit manual-only external reasoning connection in this MVP. AI-CODER requests non-writing Codex settings and sends only selected prompt context, but does not treat the external Codex sandbox as equivalent to AI-CODER's own context/file authorization boundary. API/local providers likewise return plans; AI-CODER validates paths and commands before any writes occur.
