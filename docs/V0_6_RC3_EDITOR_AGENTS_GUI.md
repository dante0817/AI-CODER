# AI-CODER v0.6.0-rc.3 — Editor + Agents GUI Convergence

## Goal

Make the real Code-OSS runtime visually match the intended AI-CODER product instead of continuing to polish the legacy Tkinter shell.

## Primary modes

### Editor Mode

Native Code-OSS remains the coding surface: Explorer, editor tabs, Search, SCM, Run/Debug, Problems, Terminal, LSP, and native diffs. The AI Task Workbench remains a focused side view with Task / Models / Architecture surfaces.

### Agents Mode

`AI-CODER: Open Agents Workspace` opens a full editor-area dashboard with:

- persistent Agent Tasks;
- lifecycle / plan progression;
- task artifacts;
- reviewed changed files;
- context evidence;
- verification evidence;
- worktree status;
- Apply-to-Main / Undo;
- task prompt composer.

The Agents surface is a controller/inspector. Trusted file mutation remains in the existing checkpoint/worktree core.

## Empty state

With no workspace open, AI-CODER now shows a deliberate landing surface with Open Project and Clone Repository rather than creating a default task or showing stale project state.

## Development launcher

Once the pinned Code-OSS checkout has been staged and its upstream dependencies built, use `run-ai-coder-codeoss.ps1` or `run-ai-coder-codeoss.bat` to launch the actual target UI. The ordinary launcher remains Tkinter until native Windows qualification completes.

## Qualification boundary

This release is still a source/runtime candidate. It does not claim native Windows packaged-build qualification.
