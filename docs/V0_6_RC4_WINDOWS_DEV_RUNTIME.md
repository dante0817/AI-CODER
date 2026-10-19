# AI-CODER v0.6.0-rc.4 — Windows Developer Runtime Flow

## Purpose

RC4 closes the usability gap between the Code-OSS GUI implemented in RC3 and the legacy Tkinter window users were still launching. It does not claim native packaged-app qualification; it provides a reproducible Windows development build and launch workflow for the pinned Code-OSS source candidate.

## One-command flow

From the extracted AI-CODER repository root:

```powershell
.\prepare-ai-coder-codeoss.ps1
```

The script:

1. reads `code-oss-mvp/upstream.lock.json`;
2. uses `%LOCALAPPDATA%\AI-CODER\dev\CodeOSS-<release>` unless a checkout is supplied;
3. clones or safely restages the exact pinned upstream commit;
4. stages the current AI-CODER built-in extension and product identity;
5. validates Windows, Git, exact `.nvmrc` Node, npm, Python, MSVC C++ Build Tools, and Windows SDK;
6. runs `npm install` unless explicitly skipped;
7. runs the AI-CODER built-in extension Node regression suite;
8. runs `npm run compile`;
9. runs the AI-CODER source qualification gate;
10. writes `AI-CODER-DEV-BUILD.json`;
11. launches the real Code-OSS AI-CODER GUI unless `-NoLaunch` is supplied.

## Safety and scope

The script never installs prerequisites silently. A mismatch or missing tool fails closed and leaves a diagnostic report. The development runtime remains separate from the native packaged-app production gate: `nativeWindowsBuildQualified` stays `false`.

## Resuming

Rerun the same command after fixing a prerequisite. If the pinned upstream commit is already checked out, bootstrap skips a redundant checkout and restages only the current AI-CODER product/extension content.

## Subsequent launches

After a successful developer build:

```powershell
.\run-ai-coder-codeoss.ps1
```

uses the same default checkout and isolated AI-CODER development user-data/extensions directories.
