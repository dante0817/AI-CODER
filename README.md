# AI-CODER v0.6.0-rc.4 — Windows Developer Runtime Launch Candidate

This release candidate makes the real Code-OSS GUI substantially easier to build and launch on Windows while preserving the rc.3 Editor + Agents GUI and all v0.6 production-cutover safety gates. It remains a **development/source candidate**, not yet a native-Windows-packaged-qualified production release.

## What changed in v0.6.0-rc.4

- Adds a one-command Windows developer setup: `prepare-ai-coder-codeoss.ps1` / `.bat`. It stages the exact pinned Code-OSS checkout under a short per-user path, validates prerequisites, installs dependencies, runs AI-CODER regressions, compiles Code-OSS, writes `AI-CODER-DEV-BUILD.json`, and launches the real GUI.
- Makes `run-ai-coder-codeoss.ps1/.bat` use the same stable per-user checkout by default, so subsequent launches no longer require manually passing the checkout path.
- Adds strict developer-build prerequisite checks for the exact `.nvmrc` Node version, MSVC C++ Build Tools, Windows SDK, Git, npm, and Python; the scripts diagnose missing prerequisites but never install them silently.
- Makes bootstrap restaging resumable when the pinned upstream commit is already checked out, so a newer AI-CODER RC can update the built-in extension without recloning the full Code-OSS repository.
- Fixes the earlier documentation contradiction that showed a Code-OSS checkout path containing spaces even though native preflight correctly rejects whitespace paths.

- Adds a **full Agents Workspace** that opens in the Code-OSS editor area for task-first/parallel-agent work, while normal coding remains native Editor Mode.
- Adds an explicit **Editor / Agents** interaction model rather than forcing long-running Agent work into a narrow sidebar.
- Adds visible task **artifacts** for execution profile, context evidence, changed files, verification, and checkpoints.
- Adds a deliberate **no-project landing state** with Open Project / Clone Repository actions instead of three empty panes.
- Adds `run-ai-coder-codeoss.ps1` and `.bat` development launchers for the staged Code-OSS runtime so the target GUI can be evaluated without using the legacy Tkinter launcher.
- Keeps the existing Task / Models / Architecture side workbench and bottom AI-CODER Evidence panel, but connects them to the new Agents Workspace navigation.

- Replaces the old single-column Code-OSS prototype panel with three focused surfaces: **Task**, **Models**, and **Architecture**.
- Adds a native **AI Tasks** tree to the Code-OSS Explorer so task navigation lives beside the real project tree instead of inside a fake explorer.
- Adds a bottom **AI-CODER Evidence** panel with Verification, AI Activity, and Checkpoints views.
- Adds a real **Open Diff** action for already-reviewed pending worktree changes; diffs open in the native Code-OSS editor.
- Moves provider connection controls out of the normal Task flow and into the dedicated Models surface.
- Adds grouped model cards backed by the real provider catalog and capability provenance; unknown capabilities stay visibly unknown rather than being guessed.
- Adds a task-context inspector with reasons, scores, clipping status, and bounded usage evidence.
- Adds an Architecture surface for lifecycle, routing rationale, context evidence, checkpoint/action history, and runtime qualification.
- Keeps the normal coding path intentionally simple: native Code-OSS Explorer/editor/Git/Search/Terminal remain authoritative IDE surfaces; AI-CODER handles task control, model selection, context evidence, reviewed changes, and recovery.
- Preserves the v0.6-rc.1 task lifecycle, execution lease, Workspace Trust, crash journal, migration, and safe verification behavior.

### Recommended layout

For the intended three-panel GUI, keep the native Explorer on the left, move **AI-CODER / AI Task Workbench** to the Code-OSS Secondary Side Bar on the right, and open **AI-CODER Evidence** in the bottom Panel. The AI Tasks tree remains available inside the native Explorer.

### Qualification status

This candidate is source/runtime qualified only. Native Windows Code-OSS build/package, NTFS attack qualification, complete product/network identity audit, and final Code-OSS launcher cutover remain mandatory before `v0.6.0` final.

See `docs/V0_6_RC2_GUI_CONVERGENCE.md`, `docs/V0_6_CUTOVER_CONTRACT.md`, and `docs/PHASE_8_PRODUCTION_CUTOVER.md`.

---

# AI-CODER v0.6.0-rc.1 — Production Cutover Source Candidate

This release candidate implements the first production-cutover gates without changing the default launcher from the Python/Tkinter reference runtime. It is a **source/runtime candidate**, not yet a native-Windows-qualified production release.

## What changed in v0.6.0-rc.1

- Pins the production-candidate Code-OSS line through `code-oss-mvp/upstream.lock.json` and records the exact resolved commit during bootstrap.
- Adds a shared Python/TypeScript task lifecycle contract with explicit transient, review, failure, interrupted, and recovery states.
- Adds a cross-process per-task `TaskExecutionLease`, separate from short durable-state locks, so two AI-CODER windows cannot execute/apply/undo the same task concurrently.
- Moves Code-OSS project locks and new worktrees to a stable per-user AI-CODER runtime root rather than extension-profile global storage.
- Enforces one local `file:` workspace for this production candidate and requires Code-OSS Workspace Trust for Agent mutation, verification, Apply-to-Main, Undo, and project-profile mutation.
- Adds crash-reconciling journals to indexed task/checkpoint-style durable collections so record/index updates recover after interruption.
- Adds explicit v0.5.6 compatibility handling: legacy message records normalize without loss; valid old task worktrees are reused; missing old worktrees with reviewed pending changes enter recovery instead of being silently replaced.
- Adds managed `.ai-coder/.gitignore` protection for runtime/private task state while keeping `project.json` shareable.
- Adds a validated webview command boundary and cryptographically random CSP script nonce.
- Extracts verification execution into `VerificationService`; approved Windows `npm`/`tsc` verification resolves to trusted Node/JavaScript entrypoints without enabling `shell:true`, with explicit timeout/cancel states and process-tree termination.
- Adds pinned-source preflight, source qualification, and native Windows build scripts. Source qualification explicitly cannot claim native Windows production qualification.

### Current cutover status

Implemented in this candidate: upstream/source lock, lifecycle state machine, execution leases, stable per-user lock/worktree root, workspace trust/scope enforcement, durable-state crash reconciliation, v0.5.6 task/worktree compatibility, private control-data policy, validated webview messages, and Windows-safe verification resolution.

Still required before `v0.6.0` final: full TypeScript application-service extraction for Agent/Apply/Undo orchestration, cancellation propagation through provider calls, complete product/network identity audit, native Windows pinned Code-OSS compile/package, NTFS Safe-I/O and migration qualification of the packaged app, and Code-OSS-default launcher cutover.

See `docs/V0_6_RC1_IMPLEMENTATION_STATUS.md`, `docs/V0_6_CUTOVER_CONTRACT.md`, and `docs/PHASE_8_PRODUCTION_CUTOVER.md`.

---

# AI-CODER v0.5.6 — Phase 7 Primary Code-OSS Runtime Qualification

## What changed in v0.5.6

Phase 7 hardens the Code-OSS target as the primary AI-CODER runtime candidate while keeping the Python/Tkinter lineage as a reference and fallback.

- Added a cross-process project-state lock keyed by the canonical local workspace and stored under AI-CODER extension global storage. Task, checkpoint, and activity mutations share this lock in addition to their existing in-process queues.
- Added a real two-process contention regression: two separate Node processes mutate one durable task and all updates must survive.
- Activity history is now durable/project-local under `.ai-coder/code-oss/activity.json` instead of remaining workspace-state-only.
- Smart Context now consumes bounded `vscode.executeWorkspaceSymbolProvider` results as a `workspace-symbol` ranking signal in addition to direct LSP references and lexical symbol scanning.
- Added shared `context-ranking-v4.json` vectors so Python and TypeScript use the same workspace-symbol ordering semantics.
- Added shared `provider-normalization-v1.json` vectors plus common provider-contract helpers for capability aliases, Ollama capability normalization, and reasoning-effort mapping.
- Added **AI-CODER: Runtime Qualification Report** in Code-OSS. It reports pinned branded-build evidence, durable-store status, cross-process-lock status, Safe-I/O mode, and qualification warnings.
- Added `code-oss-mvp/qualify-code-oss.ps1` to verify the pinned upstream commit, AI-CODER product branding, built-in extension version, Node regression suite, and Safe-I/O presence/hash. It writes `AI-CODER-QUALIFICATION.json`; optional `-RunCompile` invokes the pinned checkout's npm `compile` script when present.
- Code-OSS remains the intended production shell; Python remains the behavioral/security reference until native Windows and full branded-build qualification are complete.

Validation in this environment before release packaging: **64 Python tests passed** with 14 platform/display skips; **49 Code-OSS tests passed** with 5 Windows-only skips.

See `docs/PHASE_7_PRIMARY_CODE_OSS_RUNTIME_QUALIFICATION.md` for scope and limits.

---

# AI-CODER v0.5.5 — Phase 6 Code-OSS Product Convergence

## What changed in v0.5.5

Phase 6 moves the Code-OSS implementation closer to the primary AI-CODER runtime without weakening the existing reviewed-write/checkpoint boundary.

- Code-OSS now supports the official Codex CLI as an **explicit manual-only** ChatGPT-account-backed provider, including status, sign-in, sign-out, and non-interactive `codex exec`; Auto routing never selects Codex.
- Authorized project context is sent to Codex over stdin rather than process arguments; Codex runs from an isolated AI-CODER runtime directory with restrictive non-writing invocation settings and a scrubbed subprocess environment. Because Codex is an external agent runtime, AI-CODER does **not** claim its sandbox is equivalent to the AI-CODER context/file boundary; the UI warns before first Codex use each session.
- Agent mode supplies Codex a JSON output schema before AI-CODER performs its own plan/path/command validation.
- Provider model catalogs now use bounded caching with preserved capability provenance; provider-setting changes clear the cache and explicit refresh bypasses it.
- Code-OSS Smart Context consumes language-service reference results as a bounded `lsp-reference` ranking signal when available.
- Added shared `context-ranking-v3` behavior vectors and deeper multi-task TaskStore concurrency qualification.
- Code-OSS bootstrap now supports an optional upstream ref and records the exact resolved Code-OSS commit in `AI-CODER-UPSTREAM.json`.
- Release packaging excludes real local environment/private-key material and transient dependency/cache directories.

Validation in this environment: **62 Python tests passed** with 14 platform/display skips; **43 Code-OSS tests passed** with 5 Windows-only skips.

See `docs/PHASE_6_CODE_OSS_PRODUCT_CONVERGENCE.md` for trust boundaries and remaining limitations.

---

## Historical v0.4.7 Desktop README


## Updates in v0.4.7

- **Three-panel VS Code-style desktop layout**: one left navigation/sidebar area, a central editor/diff workspace, and one dedicated right-side AI Prompt panel.
- **Single contextual sidebar**: Explorer and AI Tasks now switch in the same sidebar instead of competing for permanent space.
- **Editor-native Changes view**: reviewed diffs and Apply-to-Main actions live beside the editor as a tab rather than in a separate right-side notebook.
- **Compact AI composer**: Mode and Auto routing stay visible; provider/model/effort/worktree settings move to a focused Prompt Options dialog.
- **Shared bottom observability panel**: Terminal, Verification, and AI Activity span the editor/prompt workspace in a VS Code-like arrangement.
- **Progressive disclosure**: worktree/model/task metadata remain available without occupying a permanent Task Info panel.
- Existing Windows safe-I/O, worktree isolation, diff approval, checkpoints, command policy, and undo behavior are unchanged.

## Updates in v0.4.6

- **Handle-bound Windows safe I/O**: Windows project I/O pins the workspace and ancestor directories by handle, rejects reparse-point and hard-linked objects, verifies normalized handle-resolved paths via `GetFinalPathNameByHandleW`, stages writes within the verified parent directory, and atomically commits using the shared native helper (`windows-safeio.exe`).
- **Privilege separation for control vs sensitive files**: Disentangled `allow_sensitive` (confidentiality for secrets, `.env`) from `allow_control` (integrity for `.ai-coder/*` internal subsystem metadata), preventing capability confusion across Python and Code-OSS extension boundaries.
- **Early native lexical control rejection**: Native safe-I/O helper lexically blocks `.ai-coder` path components prior to any handle or directory creation unless explicitly authorized with `allow_control`, defense-in-depth backed by `GetFinalPathNameByHandleW` handle normalization against 8.3 aliases.
- **Short-name (8.3) alias protection**: Canonical handle path normalization prevents short names (such as `AICODE~1`) from resolving to protected `.ai-coder` control paths.
- **Device namespace completeness**: Rejects all reserved DOS device names including Unicode superscript variants (`COM¹`, `COM²`, `COM³`, `LPT¹`, `LPT²`, `LPT³` and extensions like `COM¹.txt`) across Python, Node.js, and the native Go helper, while safely permitting non-reserved names like `COM10` or `COMX`.
- **Hard-link blocking**: Rejects multi-linked files on read, write, and append in both native Windows and POSIX boundaries.
- **Build provenance and binary parity**: Native helper embeds protocol version, architecture, Go runtime, and build provenance metadata (`windows-safeio version`), with automated SHA-256 binary parity verification between Desktop and Code-OSS distributions.
- **Mandatory Windows CI release gate**: Enforces dedicated `windows-safe-io-required` GitHub Actions qualification workflow supporting `merge_group` to execute full safe-I/O attack suites, binary parity checks, and integration tests on actual Windows runners as a release blocker.

## Updates in v0.4.5

- Code-OSS checkpoint text decoding preserves an initial UTF-8 BOM, matching the desktop editor and keeping the reviewed text and applied bytes consistent.
- A Code-OSS regression test verifies BOM-bearing content through preview, apply, and undo.

## Updates in v0.4.4

- Checkpoints now capture and verify exact file bytes, so CRLF/LF differences are preserved for rollback and undo instead of being normalized by text-mode reads.
- Agent review rejects invalid UTF-8, NUL-containing/binary content, and files above the 2 MiB safe-edit limit in both Python and Code-OSS checkpoint paths.
- Workspace writes use flushed same-directory staging files and per-file atomic replacement while preserving existing permission bits where supported.
- Apply and undo track the file currently being replaced as well as completed files; recovery verifies exact bytes and retains a `recovery-needed` checkpoint when rollback cannot be proven complete.
- Each desktop task now keeps an action-based undo stack with checkpoint scope plus pending/applied state before and after every successful action, including repeated worktree-to-project apply cycles.
- If files were applied but the task record cannot be saved, the checkpoint retains enough task metadata to recover that action later instead of reporting the file apply as though it never happened.
- The desktop editor validates UTF-8/NUL/size constraints and preserves a file's CRLF/LF/CR style and UTF-8 BOM; mixed line endings are refused rather than silently rewritten.
- At v0.4.4, the Windows reparse-point race remained a separate path-confinement limitation; v0.4.6 replaces that path-based Windows boundary with handle-bound safe I/O.

## Updates in v0.4.3

- Agent file diffs are shown before any write in the desktop app and Code-OSS extension.
- Worktree review tracks the net pending content across Agent runs; the apply preview lists the exact files and bytes to copy, and shows unrelated worktree changes separately.
- Applying changes uses a checkpoint, verifies the reviewed source and destination, and rolls back completed writes if a later write fails.
- Undo targets the selected task's checkpoint and stops if the files have changed since that checkpoint was applied.

## Security update in v0.4.2

- Sensitive files and their aliases are excluded from active-file, selection, and workspace context. The Code-OSS extension only reads local workspace files into context.
- AI file changes and checkpoint restoration resolve paths within the workspace; external symlinks and sensitive targets are blocked. The desktop app also uses no-follow file operations on POSIX systems.
- Model-suggested verification commands must match a fixed command and argument list. They run without a shell only after a separate approval showing the commands and execution folder. On Windows, the Code-OSS extension skips npm and tsc commands that require a shell; run those manually in a trusted terminal.


AI-CODER is a **standalone multi-AI coding command center**. It does not require Microsoft VS Code and is not a VSIX extension.

Version 0.4 changes the product from an editor-first prototype into a **task/agent-first workflow inspired by modern coding-agent apps**: projects contain persistent task threads, multiple tasks can run independently, Agent tasks can use isolated Git worktrees, and changes are reviewed before they are copied into the main project.

AI-CODER keeps its own differentiators: **multiple AI connections, Auto Provider + Auto Model + Auto Effort, project profiles, explicit skills, context gating, checkpoints, command policy, and account/API/local routing**.

## Main v0.4 workflow

```text
Project
  ├─ Task thread A ─ Agent ─ isolated worktree ─ diff/review ─ Apply to Project
  ├─ Task thread B ─ Review
  └─ Task thread C ─ Plan

Each task keeps its own:
  history • status • provider • model • effort • worktree • changes
```

## Implemented

### Codex-style command center
- Persistent project task threads under `.ai-coder/threads/`
- New Task / rename / switch between tasks without losing history
- Independent background workers, so different task threads can run in parallel
- Task-first central conversation surface
- Secondary built-in file editor
- Per-task status and execution metadata
- Per-task Changes view with unified diff
- Terminal/verification log and AI activity ledger

### Isolated Agent work
- Optional **Git worktree per Agent task**
- Unique `ai-coder/<task>` branch
- Agent changes remain outside the main working tree until reviewed
- **Apply to Project** copies reviewed task files into the main project
- Main-project checkpoint created before merge/apply
- Conflict guard refuses to overwrite files that diverged in the main workspace after the worktree base commit
- Direct-folder fallback for non-Git projects

### AI connections
- **Codex / ChatGPT account** through the official `openai-codex` SDK
- OpenAI-compatible API connection
- Ollama/local connection
- Provider: Auto / Codex / OpenAI-compatible / Ollama
- Model: Auto or manual model ID
- Effort: Auto / Low / Medium / High / Extra High
- Routing: Balanced / Quality / Fast / Low Cost / Local Only

### AI-CODER controls
- Project Profile at `.ai-coder/project.json`
- `@codebase` project context
- Active-file and selected-text context
- Context budget and sensitive-file exclusions
- Project Skills under `.ai-coder/skills/`
- Explicit skill attachment with `@skill:name`
- Structured Agent change-plan validation
- User approval before any Agent write
- Checkpoint + undo
- Restricted verification-command policy
- AI activity log
- Session-only API secret broker

## Run on Windows

There are now **two launch paths** during the release-candidate transition:

### Target Code-OSS GUI (recommended for UI evaluation)

For the first setup/build, run the one-command Windows developer flow:

```powershell
.\prepare-ai-coder-codeoss.ps1
# or double-click / invoke:
.\prepare-ai-coder-codeoss.bat
```

It stages the exact pinned Code-OSS source under a short per-user path, validates the required Node/MSVC/Windows SDK/Python/Git toolchain, installs Code-OSS dependencies, runs the AI-CODER extension regressions, compiles the development runtime, writes `AI-CODER-DEV-BUILD.json`, and launches the real Code-OSS Editor / Agents GUI. It **does not silently install missing prerequisites**; correct the reported prerequisite and rerun the same command.

To open a disposable repository immediately:

```powershell
.\prepare-ai-coder-codeoss.ps1 -Workspace "C:\src\disposable-repo"
```

After one successful preparation, subsequent launches can use:

```powershell
.\run-ai-coder-codeoss.ps1
# or
.\run-ai-coder-codeoss.bat
```

Both use the same stable `%LOCALAPPDATA%\AI-CODER\dev\CodeOSS-1.139.1` checkout by default.

### Legacy Tkinter reference UI

```powershell
.\run-ai-coder.ps1
# or
.\run-ai-coder.bat
```

The legacy launcher remains available until the native Windows Code-OSS qualification gate passes, but it is no longer the visual design target. Python 3.11+ is recommended only for this legacy/reference runtime.

## First Code-OSS GUI test

Use a disposable **Git repository** first.

1. Run `prepare-ai-coder-codeoss.bat` (or the PowerShell equivalent) and let the setup reach `developer-runtime-ready`.
2. Launch `run-ai-coder-codeoss.bat "X:\path\to\disposable-repo"`.
3. Use native Explorer/Editor in **Editor Mode**.
4. Open **AI-CODER: Open Agents Workspace** for task-first Agent work.
5. Create a task and keep isolated Agent worktree enabled.
6. Connect Codex, an API provider, or Ollama from the Models surface.
7. Ask: `Review the login flow, fix the most important bug, and run the relevant tests.`
8. Review changed files in the native Code-OSS diff editor.
9. Apply to Main only after the reviewed diff and verification evidence are acceptable.

You can create another task while the first task is running. The tasks keep separate histories, execution profiles, and worktrees.

## Codex / ChatGPT account

Open:

```text
AI → AI Connections → Codex / ChatGPT
```

Then:

1. **Install Codex Support** if necessary.
2. **Sign in with ChatGPT** or use **Device Code**.
3. **Check Status**.
4. Set Provider explicitly to **Codex**. Codex is intentionally excluded from **Auto** routing.

AI-CODER sends only its selected/authorized prompt context to Codex and keeps project mutation authority in AI-CODER. However, Codex is an external local agent runtime and its own sandbox may have broader filesystem read visibility than AI-CODER's context policy on some versions/platforms. AI-CODER therefore runs it from an isolated runtime directory, scrubs unrelated environment secrets, uses restrictive non-writing settings, and shows a session warning before the first Codex model call. AI-CODER itself owns change approval, worktree/checkpoint writes, verification, and undo.

## Skills

Open **Project → Skills**, create a Markdown skill such as `review`, then use it explicitly:

```text
Use @skill:review and review this authentication change.
```

Skills are not silently injected into every task.

## Safety notes

- Test Agent mode on a disposable repository first.
- Sensitive files such as `.env`, credentials, private keys, `.ssh`, and `.aws` are excluded from AI context.
- Repository text is treated as untrusted data and cannot override AI-CODER policy.
- Known destructive terminal commands are blocked by the MVP policy layer.
- Worktree-to-main apply is blocked when relevant main-workspace files have diverged from the task's base commit.
- On Windows, AI-CODER protected file operations require a local non-reparse workspace root; UNC and mapped-network workspaces are rejected by the safe-I/O boundary.
- Review diffs and tests before committing or deploying.

## MVP boundary

This v0.4 package is a **runnable standalone validation MVP built with Python/Tkinter**. It is not yet the final Code-OSS distribution. The core services remain separated so the task/thread, worktree, router, provider, policy, context, skills, and checkpoint modules can migrate into the future branded Code-OSS shell.

