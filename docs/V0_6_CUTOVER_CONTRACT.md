# AI-CODER v0.6 Cutover Contract

## Production-candidate goal

v0.6 makes the branded Code-OSS runtime the primary AI-CODER application only after the native Windows build and security gates pass. Python/Tkinter remains a reference/legacy runtime until final cutover.

## Frozen scope

Required: persistent tasks/activity/checkpoints, isolated Agent worktrees, reviewed Apply-to-Main, Undo/recovery, safe Windows I/O, provider discovery/routing, Smart Context, Codex manual-only integration, approved verification, cross-process state protection, per-task execution leases, Workspace Trust enforcement, one local workspace root, runtime qualification, v0.5.6 state compatibility.

Deferred: granular patch language, unrestricted terminal, distributed/network filesystem locking, multi-root Agent mutation, Remote/SSH/WSL/Dev-Container mutation, Codex Auto routing, agent swarms, deletion of the Python reference.

## Workspace support for v0.6

Agent mutation is supported only for exactly one trusted local `file:` workspace folder. Multi-root and remote/virtual workspaces must fail closed with an explicit message. Chat/Plan may be expanded later, but this production candidate intentionally uses the same single-local-root boundary for all task persistence.

## Upstream

The candidate line is pinned by `code-oss-mvp/upstream.lock.json`. Bootstrap must resolve the tag to a full Git commit and reject a mismatch with the expected release commit prefix. The native Windows build remains an external qualification gate; a Linux source archive must never claim that gate passed.

## Promotion rule

A source/runtime candidate remains `v0.6.0-rc*` until the packaged Windows application passes the native Safe-I/O suite, migration tests, branded identity audit, packaged-app smoke tests, and build manifest checks.
