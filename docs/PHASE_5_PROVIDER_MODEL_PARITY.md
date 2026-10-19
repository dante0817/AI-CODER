# Phase 5 — Provider/Model Intelligence and Runtime Parity

AI-CODER v0.5.4 makes provider discovery evidence-based and expands the machine-checked parity boundary between the Python reference runtime and the Code-OSS target runtime.

## 1. Provider-backed model discovery

Auto model selection no longer relies only on the static registry. When Auto selection needs a catalog, AI-CODER queries the configured provider:

- OpenAI-compatible providers: `GET /models`.
- Ollama: `GET /api/tags`.
- Codex remains an account-backed registry-only entry on the Python reference runtime.

A provider model listing proves that the model ID exists on that endpoint. It does **not** by itself prove tools, reasoning, vision, or structured-output support.

## 2. Capability provenance

Every model capability now has an explicit state:

- `supported`
- `unsupported`
- `unknown`

and a source such as:

- `registry`
- `provider-catalog-id`
- `provider-capability-probe`
- `unverified-manual`

Unknown capability states remain conservative in the legacy boolean compatibility view. AI-CODER therefore never turns an unknown capability into a silent `true`.

Known registry models keep their registry evidence even when their ID is rediscovered from a provider. Unknown models may be upgraded only for capabilities the provider explicitly reports. Ollama `/api/show` is used for bounded capability probing of unknown local model IDs when supported. OpenAI-compatible capability fields are consumed only if the provider explicitly exposes them in model metadata.

## 3. Routing rule for write tasks

Automatic routing of write tasks now requires `structured_output = supported`. This is the capability AI-CODER actually depends on for its JSON Agent plan contract.

An explicitly selected unknown model remains usable as a manual override, but its capability evidence remains `unknown / unverified-manual`. This prevents AI-CODER from inventing capabilities while preserving user control.

## 4. Code-OSS model refresh

The Code-OSS workbench now exposes a **Refresh models** action and the command:

`AI-CODER: Refresh Provider Model Catalog`

The resulting Architecture Control view shows provider-backed models, reachable providers, and capability state/source evidence. The model input has a provider-discovered suggestion list but still accepts an explicit ID.

## 5. Symbol-aware Smart Context

Both runtimes now extract lightweight symbol hints from the active file, current selection, and code-shaped task identifiers. Candidate source files are scanned without executing repository code, and files that reference those symbols receive a bounded `symbol-match` ranking boost.

This extends, rather than replaces, the existing ranking signals:

1. Git-modified paths,
2. related tests,
3. direct dependencies,
4. symbol references,
5. task/path matches,
6. same-directory/language neighbors,
7. deterministic fallback.

Symbol scanning is deliberately lightweight and does not claim LSP-quality semantic indexing.

## 6. Shared task/worktree/recovery behavior

New shared JSON vectors cover:

- pending-change merge and revert semantics,
- exact reviewed worktree identity,
- stale pending-state rejection,
- checkpoint-history recovery eligibility.

Both runtimes execute these vectors. Their recovery scanners now consume the same recovery rule: `ready` checkpoints can reconstruct task history only after the postimage bytes are verified.

## 7. Shared behavior specifications

Phase 5 adds:

- `spec/behavior/context-ranking-v2.json`
- `spec/behavior/task-state-v1.json`

alongside the Phase-4 router/context specifications.

## Security boundary

Phase 5 does not change the trusted filesystem mutation boundary. Reviewed full-file replacements, byte-exact checkpoints, stale-review checks, path confinement, hard-link/reparse protections, worktree isolation, and explicit verification-command approval remain authoritative.

Provider discovery affects model selection only; it never grants filesystem permissions.

## Deferred work

At the end of v0.5.4 these items were deferred. v0.5.5 adds Codex CLI account integration, provider-catalog caching, and bounded Code-OSS LSP reference hints, but richer provider capability probes, a fuller symbol index, full product build/signing, and runtime retirement remain incomplete:

- provider-specific rich capability probes beyond explicit provider metadata,
- deeper workspace symbol-index integration beyond bounded active-editor reference hints,
- complete branded Code-OSS distribution/build convergence,
- retirement of Tkinter/Python from the production runtime,
- granular patch operations (full-file reviewed replacements remain authoritative).
