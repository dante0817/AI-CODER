# AI-CODER v0.5.5 Combined Architecture

AI-CODER v0.5.5 combines the strongest parts of the two prototypes without merging their trust boundaries blindly.

## Product roles

- **Desktop v0.4.7 lineage** remains the reference implementation for checkpointing, rollback, path confinement, Windows safe I/O, worktree handling, command policy, and recovery semantics.
- **Workbench & Architecture Control** remains a UI/architecture reference only. Its simulated hashes, conformance results, provider probes, worktree actions, and success messages are not authoritative.
- **Code-OSS** is the long-term product shell. Its built-in AI-CODER workbench now has real persistent tasks, isolated Agent worktrees, reviewed Apply-to-Main, task-local Undo, and execution-derived route/context observability.

## Trust rule

The UI may request an operation and display evidence returned by the execution layer. It must not manufacture a successful model call, checkpoint, worktree, test run, hash verification, file apply, or rollback.

## Current migration boundary

```text
Tkinter (transition)                    Code-OSS (target)
        |                                      |
        |                              TaskStore / Worktrees
        |                                      |
        +--------- application contracts ------+
                         |
             trusted execution semantics
         policy • checkpoints • worktrees
          safe I/O • recovery • activity
```

On the Python side, `AgentLifecycleService`, `ChangeApplicationService`, `VerificationService`, and `ApplicationApi` now own the main non-visual workflow. Tkinter retains explicit interaction/presentation.

The Code-OSS path is no longer only a UI mock: its TypeScript services now execute task-local checkpoint/worktree flows directly, while Python remains the behavioral reference during migration.

## State ownership

- Global settings are persisted by explicit configuration actions, not background model workers.
- Python project task-record mutations are inter-process serialized.
- Code-OSS task mutations are serialized through `TaskStore` and persisted project-locally under `.ai-coder/code-oss/tasks/`.
- Code-OSS checkpoints are persisted project-locally under `.ai-coder/code-oss/checkpoints/`; activity remains serialized separately.
- Verification commands execute outside Tkinter's event loop and are explicitly approved.
- Worktree/main applies retain checkpoint evidence when post-write history persistence fails.

## Routing

Auto mode probes provider reachability before including providers in the candidate set. Manual provider selection still attempts the chosen provider directly so unusual OpenAI-compatible servers are not rejected solely because discovery is incomplete.

Unknown manual model IDs retain **unknown/unverified** capability semantics; AI-CODER does not invent tool/reasoning/vision/structured-output support for them.

## Architecture Control in Code-OSS

The Code-OSS workbench shows execution-derived information:

- selected provider/model/effort
- routing rationale and alternatives
- providers proven reachable during Auto selection
- context budget used
- context manifest entries
- active task status
- task worktree branch and pending reviewed-file count

When an Agent task runs in an isolated worktree, active-file and workspace context are read from that execution root rather than silently reading stale main-project copies.

## Not yet complete

v0.5.5 does **not** yet claim final product convergence. Phase 6 adds Codex CLI account integration, bounded provider-catalog caching, LSP/reference-aware Code-OSS context ranking, reproducible upstream staging evidence, and deeper single-extension-host task concurrency qualification. Important remaining work includes:

- cross-process/multi-window project-state locking
- richer trustworthy provider-specific capability probes
- full branded Code-OSS compile/sign/package qualification for the recorded upstream revision
- native Windows execution of the complete release gate for this exact build
- eventual retirement of Tkinter/Python from production after TypeScript parity is demonstrated
