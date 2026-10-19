# Changelog

## 0.6.0-rc.4 — Windows developer runtime launch flow

- Added `prepare-ai-coder-codeoss.ps1/.bat` as the one-command Windows path to stage, validate, install, test, compile, qualify, and launch the real Code-OSS AI-CODER GUI.
- Defaulted the development checkout to a short stable `%LOCALAPPDATA%\AI-CODER\dev\CodeOSS-<release>` path instead of relying on the extracted repository path.
- Added strict build-toolchain preflight for exact `.nvmrc` Node, MSVC C++ Build Tools, and Windows SDK without silently installing prerequisites.
- Added resumable bootstrap/restaging when the pinned upstream commit is already checked out.
- Added `AI-CODER-DEV-BUILD.json` developer-build evidence and improved launcher diagnostics.
- Corrected documentation examples that previously used a whitespace-containing checkout path incompatible with native Code-OSS preflight.
- Preserved the RC3 Editor + Agents GUI and all reviewed-write, lifecycle, lease, workspace-trust, migration, and verification guarantees.


## 0.6.0-rc.3 — Editor + Agents GUI convergence

- Added a full Code-OSS editor-area **Agents Workspace** for task-first and parallel-agent workflows.
- Added explicit Editor / Agents navigation while preserving native Code-OSS editor, Explorer, Search, SCM, Terminal, Problems, and diff behavior.
- Added task artifacts for execution profile, context, changed files, verification, and checkpoints.
- Added a polished no-project landing state and Open Project / Clone Repository actions.
- Added a dedicated Code-OSS development launcher (`run-ai-coder-codeoss.ps1/.bat`).
- Hardened no-workspace behavior for AI Tasks and Evidence views.
- Preserved all rc.2 reviewed-write, checkpoint, worktree, lifecycle, lease, migration, and verification guarantees.


## 0.6.0-rc.2 — GUI convergence source candidate

- Replace the minimal one-column Code-OSS webview with focused Task, Models, and Architecture surfaces.
- Contribute AI Tasks to the native Explorer and add a bottom AI-CODER Evidence panel for Verification, AI Activity, and Checkpoints.
- Add native pending-change diff reopening from the Task Changes card.
- Keep native Code-OSS editor, Git, Search, Problems, Terminal, and diff views authoritative instead of recreating them in HTML.
- Add grouped real model-catalog cards with capability provenance and keep provider setup out of the main task flow.
- Add lifecycle/routing/context/checkpoint architecture inspection using real persisted task data.
- Preserve all v0.6.0-rc.1 execution-lease, trust, migration, durable-state, and safe verification behavior.

## 0.6.0-rc.1 — Production cutover source candidate

- Pin the intended Code-OSS production-candidate release line and require full commit resolution/manifest evidence during staging.
- Add shared Python/TypeScript task lifecycle semantics and explicit interrupted/recovery states.
- Add cross-process per-task execution leases and stable per-user runtime roots for project locks/new worktrees.
- Enforce single local workspace scope and Code-OSS Workspace Trust for mutation/execution paths.
- Add validated webview command schemas plus a cryptographically random CSP nonce.
- Add crash-reconciling durable-state transaction journals and explicit task record schema normalization.
- Add v0.5.6 project-local task compatibility plus legacy-worktree reuse/recovery rules that never orphan reviewed pending changes.
- Add managed `.ai-coder/.gitignore` runtime-state privacy policy.
- Extract verification execution into `VerificationService` with shell-free Windows npm/tsc resolution, cancellation/timeout result states, and process-tree termination.
- Add pinned Code-OSS preflight/source qualification plus a separate native Windows package build script; source qualification cannot set `nativeWindowsBuildQualified=true`.
- Advance built-in extension/Python package version to 0.6.0-rc.1.

## 0.5.6 — Phase 7 primary Code-OSS runtime qualification

- Add cross-process Code-OSS project-state locking keyed by canonical workspace and extension global storage.
- Apply the shared lock to durable task, checkpoint, and activity mutations while retaining existing in-process serialization.
- Add a real two-process TaskStore contention regression and durable activity concurrency coverage.
- Persist Code-OSS activity history under `.ai-coder/code-oss/activity.json` with legacy migration.
- Add bounded workspace-symbol-provider context ranking and shared `context-ranking-v4.json` parity vectors.
- Add shared provider normalization helpers/vectors for capability aliases, Ollama capability evidence, and reasoning-effort mapping.
- Add Code-OSS runtime qualification reporting and command/UI entry point.
- Add `qualify-code-oss.ps1` for pinned-upstream/branding/extension-test/Safe-I/O source-runtime qualification, with optional compile invocation.
- Advance Code-OSS built-in extension version to 0.5.6 and update staging guidance.

## 0.5.5 — Code-OSS product convergence

- Added ChatGPT-account Codex CLI integration to Code-OSS using status/login/logout and non-interactive `codex exec`; Codex is explicit/manual-only and excluded from Auto routing.
- Sends authorized model context through stdin, scrubs unrelated parent-process environment secrets, and runs Codex from an isolated AI-CODER runtime directory with requested read-only/never-approve restrictions and user config/rules ignored.
- Added a session warning documenting that the external Codex sandbox is not equivalent to AI-CODER's own context/file authorization boundary and may have broader read visibility on some versions/platforms.
- Added shared `provider-policy-v1` vectors so Python and Code-OSS both enforce manual-only provider eligibility.
- Added shell-free Windows Codex launcher resolution: prefer native `codex.exe`, otherwise invoke the official npm `codex.js` entry through the current Node executable instead of spawning `.cmd` wrappers.
- Added a real Agent JSON output schema for Codex CLI calls while retaining AI-CODER's independent plan/path/command validation.
- Added bounded provider model-catalog caching in Python and Code-OSS without upgrading capability provenance. Provider-setting changes invalidate the cache; explicit refresh bypasses it.
- Added Code-OSS language-service reference collection and the shared `context-ranking-v3` semantic ranking contract.
- Added high-contention multi-task TaskStore qualification.
- Added reproducible Code-OSS bootstrap provenance through optional `-CodeOSSRef` and `AI-CODER-UPSTREAM.json`.
- Hardened release packaging to exclude dependency caches, real `.env` files, and common private-key/container files.
- Validation baseline: 62 Python passes / 14 environment skips; 43 Code-OSS passes / 5 Windows-only skips.

## 0.5.4 — Provider/model intelligence and broader runtime parity

- Discover provider-backed model IDs from OpenAI-compatible `/models` and Ollama `/api/tags` for Auto/model-catalog workflows.
- Add per-capability `supported`, `unsupported`, and `unknown` states with explicit provenance; never promote unknown capability data to verified support.
- Add bounded provider capability probing for unknown model IDs, including Ollama `/api/show` and explicit OpenAI-compatible capability metadata when present.
- Require verified structured-output support for automatic write-task routing while keeping explicit unknown-model selection as an auditable manual override.
- Add Code-OSS Refresh Models UI/command and model suggestions backed by the discovered provider catalog.
- Add lightweight cross-file symbol-reference ranking to both Smart Context engines.
- Add shared `context-ranking-v2.json` and `task-state-v1.json` parity vectors for symbol ranking, pending state, review identity, and recovery eligibility.
- Make both task-history recovery scanners consume the shared recovery-eligibility semantics.
- Regression result in this environment: 58 Python tests passed (14 platform/display skips); 36 Code-OSS tests passed (5 Windows-only skips).

## 0.5.3 — Phase 4 Code-OSS convergence and shared behavior specs

- Added shared JSON behavior vectors for router/task-analysis and context ranking, executed by both Python and Code-OSS suites.
- Replaced alphabetical workspace-context packing with bounded task-aware ranking across both runtimes.
- Added Git-modified, related-test, direct-dependency, task-path, same-directory, and same-language context signals.
- Persisted context manifests with scoring/token estimates in task execution metadata.
- Added project-local durable Code-OSS task and checkpoint stores under `.ai-coder/code-oss/` with one-time migration from workspaceState.
- Standardized Code-OSS task messages on `content` while retaining legacy `text` compatibility.
- Preserved trusted full-file checkpoint/apply/undo behavior and worktree lifecycle.
- Regression suite: 53 Python tests passed (14 environment skips); 31 Code-OSS tests passed (5 Windows-only skips).


## 0.5.2 — Phase 3 task/worktree convergence

- Move reviewed worktree-to-main apply and task-local undo/recovery out of Tkinter into `ChangeApplicationService`.
- Add JSON-safe `ApplicationApi` command/event boundary with one-time reviewed-apply IDs and stale-state revalidation.
- Refactor Tkinter Apply-to-Main and Undo into thin application-API clients.
- Add Code-OSS `TaskStore` with serialized persistent task-local conversations/status/execution metadata.
- Add real Code-OSS `WorktreeManager` with shell-free Git worktree creation, changed-path inspection, and base-commit conflict detection.
- Run Code-OSS Agent changes and approved verification inside per-task worktrees when enabled; context active-file/workspace reads follow the execution root.
- Add reviewed Code-OSS Apply-to-Main plus task-local Undo with retained-checkpoint recovery semantics.
- Revalidate exact task/worktree pending state after review and again at commit; repeated applies use the last trusted AI-CODER-applied main snapshot while external edits remain conflicts.
- Persist task state plus success messages in one serialized mutation for Apply/Undo, and keep audit logging best-effort so post-success logging cannot falsely report a file mutation as failed.
- Recover missing Code-OSS task history from authoritative checkpoint metadata after post-apply persistence failures.
- Serialize Code-OSS checkpoint/activity workspace-state mutations to reduce lost updates.
- Regression result in this environment: 50 Python tests passed (14 platform/display skips), 26 Code-OSS tests passed (5 Windows-only skips).

## 0.5.1 — Phase 2 application-layer extraction

- Extract provider discovery, model routing, worktree execution-root selection, context assembly, provider invocation, model-call audit logging, and Agent-plan parsing into `AgentLifecycleService`.
- Extract reviewed diff preparation, checkpoint apply, pending-worktree merge state, action-history recovery, verification orchestration, and final Agent task persistence into `ChangeApplicationService`.
- Reduce Tkinter's responsibility to presentation, explicit approvals, progress rendering, and terminal output for the extracted Agent path.
- Snapshot runtime settings per task so in-flight Agent behavior does not drift when UI preferences are changed later.
- Preserve compatibility facades for existing checkpoint/action-history security tests during migration.
- Add direct application-layer tests; regression result in this environment: 44 Python tests passed (14 platform/display skips), 18 Code-OSS tests passed (5 Windows-only skips).

## 0.5.0 — Combined Workbench + trusted execution migration

- Begin combining the Workbench/Architecture-Control UX with the v0.4.7 trusted execution lineage and Code-OSS target shell.
- Add lock-protected, atomic settings persistence and merge-style updates; remove background-worker writes to global provider/model preferences.
- Serialize ThreadStore read-modify-write operations to prevent concurrent task-state/message lost updates.
- Add UI-independent VerificationService and execute approved verification commands off the Tkinter event loop.
- Probe Ollama and configured OpenAI-compatible provider availability in Auto mode instead of assuming availability.
- Stop assigning invented capabilities to unknown manually entered model IDs.
- Map Extra High to `xhigh` on the official OpenAI endpoint while preserving conservative compatibility mapping elsewhere.
- Persist Code-OSS conversation history in workspace state.
- Add real Code-OSS Route and Context architecture-control readouts backed by execution data and a context manifest.
- Preserve the original Workbench prototype under `reference/workbench/` for design reference only; do not use its mock security/execution modules as authoritative behavior.
- Regression result in this environment: 39 Python tests passed (14 skipped for platform/display constraints); 18 Code-OSS tests passed (5 Windows-only skips).


## 0.4.7 — Three-panel VS Code-style GUI

- Replace the four-area command-center shell with a simpler three-panel IDE layout: contextual left sidebar, central editor/diff workspace, and dedicated right AI Prompt panel.
- Make Explorer and AI Tasks mutually exclusive sidebar views selected from an Activity Bar.
- Move Changes into the central editor notebook and keep Apply-to-Main review contextual.
- Consolidate provider/model/effort/routing/worktree settings into a compact AI Prompt Options dialog.
- Move Terminal, Verification, and AI Activity into a shared bottom panel spanning the coding workspace.
- Preserve all v0.4.6 filesystem confinement, checkpoint, worktree, review, verification, and undo invariants.

## 0.4.6 — Windows handle-bound workspace confinement & safe I/O hardening
 
- Replace Windows check-then-use path operations with a bundled native safe-I/O helper (`windows-safeio.exe`) shared by the Python desktop app and Code-OSS extension.
- Register the selected workspace root by volume serial + 128-bit file ID and reject later root substitution.
- Reject reparse-point roots and path components from opened handles, and pin the root/ancestor directories without `FILE_SHARE_DELETE` while each protected operation runs.
- Strictly separate `allow_sensitive` (confidentiality for secrets, `.env`) from `allow_control` (integrity for `.ai-coder/*` internal subsystem metadata) across Python and Code-OSS boundaries, eliminating capability confusion.
- Lexically reject `.ai-coder` components in the native helper before filesystem calls unless `allow_control` is explicitly provided, while retaining `GetFinalPathNameByHandleW` handle normalization against short-name (8.3) alias bypasses (e.g., `AICODE~1`).
- Block Unicode superscript device names (`COM¹`, `COM²`, `COM³`, `LPT¹`, `LPT²`, `LPT³` and extensions such as `COM¹.txt`) across Python, Node.js, and native helper lexical validators.
- Enforce hard-link rejection on read, write, and append operations across both native Windows and POSIX environments.
- Read through verified file handles; stage writes inside the verified parent and commit with handle-relative `FileRenameInfo`; delete through `FileDispositionInfo`.
- Reject UNC and mapped-network Windows workspaces for protected Agent/project I/O until that environment has separate confinement qualification.
- Embed build provenance (`windows-safeio version`) and enforce SHA-256 binary parity between Desktop and Code-OSS packages.
- Add mandatory GitHub Actions Windows CI qualification workflow (`windows-safe-io-required`) with `merge_group` support to enforce real Windows execution on every push, pull request, and merge queue as a release blocker.
- Verify complete security test matrices and invariant suites on native Windows for both Python Desktop and Code-OSS extension distributions.

## 0.4.5 — Code-OSS UTF-8 BOM round trip

- Preserve the initial UTF-8 BOM in Code-OSS checkpoint text; proposed BOM-bearing content now encodes losslessly and round-trips through apply and undo.
- Regression suite: 34 Python tests and 12 Code-OSS tests passing.

## 0.4.4 — Byte-exact checkpoints and task undo history

- Capture checkpoint preimages as exact bytes and verify byte identity before apply/undo; preserve CRLF and UTF-8 BOMs on recovery.
- Reject invalid UTF-8, NUL-containing content, and oversized checkpoint/editor files instead of using lossy replacement decoding.
- Replace each file through a flushed same-directory staging file, preserving existing permissions where supported; multi-file operations remain explicitly checkpoint/rollback based rather than transactionally atomic.
- Roll back the currently attempted file as well as completed files when apply/undo fails after replacement, and report affected paths when exact recovery cannot be confirmed.
- Delete failed checkpoints only after exact original bytes are verified; otherwise retain them as `recovery-needed`.
- Add task-local action history for repeated Agent plans and worktree-to-project apply cycles, with recoverable checkpoint metadata if the task record save fails after a successful apply.
- Preserve desktop-editor line-ending style and UTF-8 BOM, while refusing mixed line endings that would otherwise be silently normalized.
- Mirror byte-exact validation, atomic replacement, and partial-write recovery in the Code-OSS extension.
- Keep the Windows reparse-point race documented as a separate unresolved confinement issue.
- Regression suite: 34 Python tests and 11 Code-OSS tests passing for this change set.

## 0.4.3 — Pre-write diff review and worktree tracking

- Show full proposed diffs before desktop and Code-OSS Agent writes; create checkpoints only after approval and reject stale previews.
- Track net pending worktree edits across Agent runs, identify staged/unstaged/untracked files, and exclude unrelated worktree edits from apply.
- Review the exact main-project patch before copy, verify reviewed source contents, and roll back partial multi-file writes.
- Apply and undo by task-specific checkpoint ID; refuse to undo over later file edits.
- Add regression coverage for stale previews, task-specific undo, reverted pending edits, staged/untracked detection, and partial-write rollback.

## 0.4.2 — Context, workspace, and command security

- Exclude sensitive active selections and resolved aliases from model context in both desktop and Code-OSS.
- Confine project file reads, writes, checkpoint operations, and worktree file previews; keep model edits out of `.ai-coder` control files.
- Limit model-proposed commands to exact fixed arguments, remove shell execution, and prompt separately before running verification commands.
- Add regression tests for sensitive context, symlink escapes, checkpoint path swaps, and command injection.

## 0.4.1 — Tkinter Codex callback hotfix
- Fixed Python/Tkinter delayed callbacks that referenced cleared exception variables after Codex install/login/logout failures.
- Fixed all four affected Codex callbacks: SDK install, browser sign-in, device-code sign-in, and sign-out.
- Preserved the actual exception message by binding it before scheduling `after(...)`.
- Re-ran the full core suite: 17/17 tests passing.

## 0.4.0 — Codex-style command center
- Redesigned the shell around persistent project task threads rather than an editor-first layout.
- Added independent background task execution so multiple task threads can run in parallel.
- Added per-task provider/model/effort/status/execution metadata.
- Added isolated Git worktrees for Agent tasks.
- Added per-task unified Changes review.
- Added reviewed worktree-to-main project apply with a main-project checkpoint.
- Added conflict protection when main-workspace files diverge from the worktree base.
- Added project Skills with explicit `@skill:name` attachment.
- Added persistent `.ai-coder/threads` task history.
- Kept Codex/API/Ollama routing and AI-CODER-owned write/verification policy.
- Added GUI smoke validation and new thread/skill/worktree core tests.


## 0.3.0 — Account-backed Codex connection
- Added official OpenAI Codex Python SDK adapter.
- Added Codex / ChatGPT account status detection.
- Added Sign in with ChatGPT, device-code sign-in, and sign-out UI.
- Added in-app Codex SDK installation plus Windows helper scripts.
- Added `codex` as a selectable/auto-routable AI connection.
- Added Codex default execution profile to the model registry.
- Mapped AI-CODER Extra High effort to Codex `xhigh`.
- Constrained Codex calls to read-only sandbox with permission escalation denied.
- Preserved AI-CODER-owned approval, checkpoint, file-write, verification, and undo workflow.
- Added tests for Codex routing, effort mapping, and account-status parsing.

## 0.2.0 — Standalone Desktop MVP
- Replaced the VSIX-only MVP with a standalone AI-CODER desktop application.
- Added project explorer and code editor.
- Added Chat, Plan, Agent and Review workbench modes.
- Added provider/model/effort routing and routing policies.
- Added project profile and context budget.
- Added sensitive-file filtering.
- Added approval-gated agent writes, checkpoints and undo.
- Added restricted verification command execution.
- Added activity logging and session-only credential broker.
- Kept core services UI-independent for planned Code-OSS migration.