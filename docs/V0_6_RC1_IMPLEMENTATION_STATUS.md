# AI-CODER v0.6.0-rc.1 Implementation Status

## Status

`v0.6.0-rc.1` is a production-cutover **source/runtime candidate**. It is not the final Code-OSS-first product and it is not yet a native-Windows-qualified packaged build.

## Completed in rc.1

- Pinned production-candidate Code-OSS release/ref contract with exact commit resolution at bootstrap.
- Shared Python/TypeScript task lifecycle vectors and explicit transient/interrupted/recovery states.
- Cross-process per-task execution lease for Submit, Apply-to-Main, and Undo.
- Stable per-user runtime root for same-user cross-profile locks and new task worktrees.
- Single-local-root scope and Workspace Trust enforcement for mutation/execution paths.
- Project-local task schema normalization and v0.5.6 on-disk message/state compatibility.
- Legacy worktree policy: reuse a valid recorded worktree; require recovery if it is missing with reviewed pending changes; only recreate when no reviewed evidence would be orphaned.
- Crash-reconciling durable collection journal for record/index put/remove interruptions.
- Runtime/private `.ai-coder` ignore policy without hiding `project.json`.
- Validated webview command boundary and random CSP nonce.
- Application-layer VerificationService with shell-free Windows npm/tsc launcher resolution and process-tree termination.
- Code-OSS source preflight/source qualification and Windows build orchestration scripts with explicit qualification-state separation.

## Deliberately not claimed yet

- No native Windows Code-OSS compile/package was performed in the Linux artifact environment used to create this rc.1 source package.
- No claim that the packaged Windows app has passed junction/root-replacement/hard-link/rollback/recovery qualification yet.
- Agent/Apply/Undo orchestration still has substantial logic in `extension.js`; Verification is extracted, but the full TypeScript application-service boundary is not complete.
- Provider-call cancellation is not yet propagated end-to-end.
- Full Windows product identity, icons, inherited upstream network/service endpoints, and attribution audit are not yet complete.
- Multi-root, remote/SSH/WSL/Dev-Container Agent mutation remains unsupported for v0.6.
- Tkinter remains the default launcher until the native Code-OSS packaged-app gate passes.

## Promotion rule

`v0.6.0` final may be promoted only after the cutover contract in `V0_6_CUTOVER_CONTRACT.md` passes, including native Windows packaged-build qualification and default-launcher cutover.
