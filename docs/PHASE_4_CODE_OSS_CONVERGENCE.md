# Phase 4 — Code-OSS Convergence and Behavioral Parity

AI-CODER v0.5.3 replaces several Code-OSS prototype-only mechanisms with durable, project-local state and introduces shared behavioral contracts that both the Python reference runtime and the Code-OSS target runtime must satisfy.

## 1. Shared behavior vectors

The repository now contains versioned JSON behavior specifications under `spec/behavior/`:

- `router-v1.json` — task classification, automatic effort, and deterministic routing cases.
- `context-ranking-v1.json` — task-aware repository-context ranking cases.

Both Python (`tests/test_shared_behavior.py`) and Code-OSS (`test/shared-behavior.test.js`) execute the same vectors. This is the first machine-checked Python/TypeScript parity boundary rather than two separate suites that merely test similar ideas.

## 2. Smart Context Engine

Both runtimes now share the same ranking semantics for workspace context:

1. selected text,
2. active file,
3. project profile,
4. Git-modified paths,
5. related tests/specs,
6. direct import/include dependencies,
7. task/path keyword matches,
8. same-directory and same-language neighbors,
9. deterministic workspace fallback.

Large active files are bounded instead of consuming the entire context budget. Individual repository files are also capped, allowing multiple relevant files to survive within the budget. Context manifests include the source, reason, score, character count, estimated token count, and truncation state.

The ranking is intentionally lightweight and deterministic. It does not execute repository code and does not claim semantic/indexing intelligence that has not been implemented.

## 3. Durable Code-OSS task state

Code-OSS tasks are no longer dependent on VS Code `workspaceState` for their authoritative records when a local workspace is open. They are persisted under:

`.ai-coder/code-oss/tasks/`

Each task is an individual JSON record with a small index and active-task metadata. Legacy `workspaceState` task records are migrated once. Message records are normalized to the Python-compatible `content` field while legacy `text` records remain readable.

## 4. Durable Code-OSS checkpoints

Checkpoint metadata and byte-exact pre/post images are persisted under:

`.ai-coder/code-oss/checkpoints/`

Each checkpoint is independently stored rather than packing all checkpoint bytes into a single VS Code state value. Legacy workspace-state checkpoints are migrated once. Existing preview, stale-review detection, apply, rollback, recovery-needed, and task-history recovery semantics are preserved.

The durable files are under `.ai-coder`, which remains excluded from model context and protected by the trusted control-file I/O path.

## 5. Persistent Architecture Control evidence

The actual context manifest is now retained in task execution metadata. Switching between tasks restores the route/context evidence shown in the Code-OSS Architecture Control view instead of showing only ephemeral data from the most recent UI event.

## Validation

In the Phase-4 development environment:

- Python: 53 passed, 14 skipped.
- Code-OSS: 31 passed, 5 skipped.
- Shared router/context behavior vectors pass in both runtimes.
- Windows-specific qualification remains delegated to the repository's Windows CI release gate.

## Still deferred

Phase 4 does not yet complete provider model discovery/capability provenance, full Code-OSS product branding/build integration, or retirement of the Tkinter runtime. The granular patch compiler also remains intentionally deferred; reviewed full-file replacements and byte-exact checkpoints remain authoritative.
