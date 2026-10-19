# AI-CODER Code-OSS v0.6.0-rc.4 Windows developer-runtime launch candidate

This directory contains the future primary AI-CODER shell plus the production-cutover staging/qualification scripts. `v0.6.0-rc.4` is intentionally source-qualified only until a pinned native Windows package completes the NTFS/security/migration gate.

The current GUI/runtime lineage includes: the real Code-OSS UI now follows the combined product layout—native Explorer + AI Tasks, native editor/diff, right-side movable AI Task Workbench, dedicated Models and Architecture surfaces, and an AI-CODER Evidence bottom panel—while retaining all rc.1 lifecycle, execution-lease, Workspace Trust, durable-state, migration, and verification protections.

---



## Recommended one-command Windows developer setup

From the repository root, the fastest supported path to the real Code-OSS GUI is:

```powershell
.\prepare-ai-coder-codeoss.ps1
# or double-click / invoke:
.\prepare-ai-coder-codeoss.bat
```

Optionally pass a workspace:

```powershell
.\prepare-ai-coder-codeoss.ps1 -Workspace "C:\src\disposable-project"
```

The setup uses `%LOCALAPPDATA%\AI-CODER\dev\CodeOSS-1.139.1` by default so the native source path does not inherit spaces from the extracted AI-CODER package location. It never installs or upgrades Node, Visual Studio, the Windows SDK, Python, Git, or npm automatically. If a prerequisite is missing or the active Node version differs from the pinned checkout `.nvmrc`, it stops with a diagnostic report. Rerun the same command after correcting the prerequisite; the checkout is reused.

Use `-NoLaunch` to prepare/compile without opening the GUI, `-SkipInstall` only when `node_modules` already exists, and `-SkipCompile` only when a compiled `out` directory already exists.

After the first successful setup, normal development launches can use:

```powershell
.\run-ai-coder-codeoss.ps1
```

## Editor / Agents development workflow

`rc.3` adds a full editor-area **AI-CODER Agents Workspace** while retaining native Code-OSS as the normal Editor Mode. The AI Task Workbench remains a focused side surface; Models and Architecture remain dedicated subviews; Verification / Activity / Checkpoints remain in the AI-CODER Evidence bottom panel.

After staging and building the pinned checkout on Windows, launch the actual Code-OSS development UI from the repository root:

```powershell
.\run-ai-coder-codeoss.ps1
# or double-click / invoke:
.\run-ai-coder-codeoss.bat
```

The legacy `run-ai-coder.ps1/.bat` launcher still opens Tkinter until the native Windows Code-OSS qualification gate passes.

# AI-CODER Code-OSS Product Bootstrap

This directory is the migration path from the portable standalone MVP to the intended product architecture:

```text
Code-OSS source
   + AI-CODER branding
   + built-in AI-CODER Workbench
   = standalone AI-CODER distribution
```

The end user should not need Microsoft VS Code or a separately installed VSIX.

On Windows, the built-in extension includes `native/windows-safeio.exe`, the same handle-bound confinement implementation used by the desktop MVP. Protected AI-CODER file operations reject reparse-point components and UNC/mapped-network workspaces.

## Current convergence state (v0.6.0-rc.4)

When a local workspace is open, the built-in AI-CODER workbench stores authoritative task and checkpoint records under `.ai-coder/code-oss/`. Legacy workspace-state records migrate automatically on first use. The same `.ai-coder` exclusion/control boundary keeps this internal state out of model context.

The Code-OSS runtime now includes ChatGPT-account Codex CLI integration, provider-catalog caching with capability provenance, isolated Agent worktrees, reviewed Apply-to-Main, task-local Undo/recovery, cross-process project-state locking for the same AI-CODER profile/project, durable activity history, and Smart Context hints from both reference-provider and workspace-symbol-provider language services when available. Router/task/context/provider-normalization semantics are checked against versioned JSON vectors shared with the Python reference runtime under `spec/behavior/`.

## Bootstrap on Windows

From this directory:

```powershell
.\bootstrap-code-oss.ps1 -Destination "$env:LOCALAPPDATA\AI-CODER\dev\CodeOSS-1.139.1"

# Optional: stage a reproducible upstream branch/tag/commit-ish ref
.\bootstrap-code-oss.ps1 -Destination "$env:LOCALAPPDATA\AI-CODER\dev\CodeOSS-1.139.1" -CodeOSSRef "<ref>"
```

The script:

1. clones Code-OSS and optionally resolves a requested upstream ref;
2. changes the product-level name/application data folder to AI-CODER;
3. copies the AI workbench into Code-OSS as a built-in extension under `extensions/ai-coder`;
4. writes `AI-CODER-UPSTREAM.json` with the exact resolved upstream commit and AI-CODER version for build provenance.

A built-in extension is an implementation mechanism inside the distribution, not an end-user VSIX dependency. It allows the AI layer to evolve independently while the product itself is its own Code-OSS application.

After staging, run the source/runtime qualification gate:

```powershell
.\qualify-code-oss.ps1 -Checkout "$env:LOCALAPPDATA\AI-CODER\dev\CodeOSS-1.139.1"

# Optional: also invoke the pinned checkout's npm compile script when available.
.\qualify-code-oss.ps1 -Checkout "$env:LOCALAPPDATA\AI-CODER\dev\CodeOSS-1.139.1" -RunCompile
```

The qualification script checks the pinned upstream commit, AI-CODER product branding, built-in extension version, Node regression suite, and Windows Safe-I/O presence/hash, then writes `AI-CODER-QUALIFICATION.json`.

## Build note

Code-OSS is a large upstream project with revision-specific Node/package/build prerequisites. Use the prerequisites documented by the exact Code-OSS revision you cloned. This bootstrap intentionally does not pretend that a Code-OSS binary was compiled in the artifact environment.
