# Phase 8 — v0.6 Production Cutover

This phase begins with build feasibility and lifecycle correctness rather than feature expansion.

1. Pin and preflight the upstream Code-OSS revision.
2. Define a shared task state machine and cancellation-safe lifecycle.
3. Add a per-task execution lease distinct from the short project-state lock.
4. Enforce one trusted local workspace root for mutation.
5. Move locks/worktrees to a stable user-wide AI-CODER runtime root.
6. Extract trusted TypeScript orchestration behind application services.
7. Add durable-state schema/journal migration and v0.5.6 compatibility tests.
8. Expand semantic Python/TypeScript conformance vectors.
9. Qualify parallel Agent execution and fault recovery.
10. Resolve safe Windows verification launchers and process-tree termination.
11. Complete product/network identity audit and native Windows packaging.
12. Promote Code-OSS to the default runtime only after the packaged build passes.

The Linux-produced rc source package intentionally records the native Windows build as **not yet qualified**.
