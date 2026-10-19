# v0.5.6 Implementation Status

## Implemented

### Shared/trusted lineage

- Atomic global settings persistence using same-directory staging, flush/fsync, replace, and inter-process locking.
- Serialized Python `ThreadStore` mutations.
- Handle-bound Windows safe-I/O helper shared by Desktop and Code-OSS packages.
- Byte-exact checkpoint review/apply/undo with CRLF/BOM preservation and partial-write recovery.
- Exact fixed verification-command allowlist with shell-free execution.
- Shared router, task/worktree/recovery, provider-policy, provider-normalization, and context-ranking behavior specifications.

### Python application/reference layer

- `AgentLifecycleService`: provider reachability, routing, execution-root/worktree selection, context construction, provider invocation, model-call audit logging, Agent-plan validation.
- `ChangeApplicationService`: Agent preview/apply/finalization plus worktree-to-main preparation/application and task-local undo/recovery.
- `VerificationService`: UI-independent approved verification execution.
- `ApplicationApi`: JSON-safe command/event boundary with backend-owned one-time reviewed-apply IDs.
- Shared provider-contract normalization and context-ranking v4 semantics for parity with Code-OSS.

### Code-OSS primary runtime candidate

- Durable project-local task, checkpoint, and activity stores under `.ai-coder/code-oss/`.
- Cross-process project-state lock for the same AI-CODER profile/global-storage root + canonical local workspace.
- Real two-process lost-update qualification for durable task mutations.
- Real per-task Git worktrees, reviewed Apply-to-Main, task-local Undo, recovery, and trusted-main baseline tracking.
- Provider-backed model discovery with explicit capability state/provenance and bounded catalog caching.
- Manual-only ChatGPT-account Codex CLI provider with external-runtime warning and AI-CODER-owned write authority.
- Task-aware Smart Context with selection/active file/project profile/Git/import/test/path/symbol signals, direct LSP references, and bounded workspace-symbol-provider evidence.
- Execution-derived Route/Context Architecture Control and persisted context manifests.
- `AI-CODER: Runtime Qualification Report` for pinned-build/durable-state/Safe-I/O evidence.
- Reproducible Code-OSS staging with exact upstream commit plus `qualify-code-oss.ps1` source/runtime qualification.

## Validation in this environment

- Python: 64 passed, 14 skipped (platform/display-specific skips).
- Code-OSS: 49 passed, 5 skipped (Windows-only skips).
- Shared router, context-ranking v1/v2/v3/v4, task-state/recovery, manual-only provider-policy, and provider-normalization vectors pass in both runtimes.
- A real two-process Node test verifies cross-process durable TaskStore serialization.
- Windows-native qualification is defined by the repository CI workflow but was not executable in this Linux environment.

## Deferred intentionally

- Granular patch compiler; full-file replacement + reviewed checkpoint remains authoritative.
- Workbench mock security/conformance/persistence modules; they remain reference-only.
- Cross-profile/distributed project-state locking; v0.5.6 locking is scoped to the same AI-CODER profile/global-storage root.
- Rich provider-specific capability verification where providers expose no trustworthy metadata/probe.
- Full branded Code-OSS compile/package/sign qualification for a pinned upstream revision in the target Windows environment.
- Final removal of Tkinter/Python from the normal production path before TypeScript parity and native Windows qualification are complete.
