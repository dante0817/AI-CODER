# Phase 7 — Primary Code-OSS Runtime Qualification

AI-CODER v0.5.6 moves the Code-OSS target from “feature-converging candidate” toward the normal production runtime while keeping the Python/Tkinter implementation as a behavioral/security reference until native-platform qualification is complete.

## 1. Cross-process project-state locking

Durable Code-OSS task, checkpoint, and activity mutations now share a `CrossProcessProjectLock` in addition to their existing in-process queues.

The lock key is derived from the canonical local workspace path plus a namespace. Lock files are stored under extension global storage rather than inside the editable project tree. This avoids making a project-controlled file the synchronization authority.

Qualified scope:

- two AI-CODER Code-OSS extension hosts using the **same AI-CODER profile/global-storage root**;
- the same canonical local workspace path;
- task/checkpoint/activity mutations performed through the v0.5.6 stores.

This is not a distributed/network lock and does not coordinate different OS users, different AI-CODER profiles with different global-storage roots, or external programs that directly edit `.ai-coder/code-oss` files.

The lock uses exclusive creation, records the owner PID/token, removes locks whose owner process no longer exists, bounds acquisition time, and validates its token before release.

A regression test starts two separate Node processes, has both mutate the same durable task record repeatedly, and verifies that all increments survive.

## 2. Durable activity history

Code-OSS activity events now persist under:

```text
.ai-coder/code-oss/activity.json
```

Legacy workspace-state activity migrates on first use. Activity writes share the cross-process project-state lock.

## 3. Workspace-symbol-aware Smart Context

In addition to active selection/file, direct imports, Git modifications, related tests, lexical symbol scans, and direct LSP references, Code-OSS now queries the bounded workspace symbol provider:

```text
vscode.executeWorkspaceSymbolProvider
```

Only project-local, includable text paths are converted into ranking hits. Workspace-symbol evidence is a ranking signal only and never bypasses sensitive-file filtering, `.ai-coder` exclusion, path confinement, or context budgets.

The Python ranking reference accepts the same `workspace_symbol_hits` shape, allowing shared `context-ranking-v4.json` vectors to validate ordering in both runtimes.

## 4. Provider-contract convergence

`provider-normalization-v1.json` now drives common normalization behavior for:

- OpenAI-compatible capability aliases;
- explicit `supported` / `unsupported` / `unknown` states;
- Ollama capability names;
- reasoning-effort mapping, including `extra-high -> xhigh` on the official OpenAI endpoint and conservative `extra-high -> high` on generic compatible endpoints.

Python uses `ai_coder.core.provider_contract`; TypeScript/Node uses `providerContract.js`.

This reduces subtle routing differences without inventing unsupported provider capabilities.

## 5. Runtime qualification report

Code-OSS adds:

```text
AI-CODER: Runtime Qualification Report
```

The report identifies:

- AI-CODER built-in extension version;
- app/root/platform information;
- presence of `AI-CODER-UPSTREAM.json` at the application root;
- durable task/checkpoint/activity availability;
- cross-process project-state lock availability and qualified scope;
- authoritative Safe-I/O mode;
- Windows Safe-I/O helper presence/hash;
- explicit qualification warnings.

A missing upstream manifest is reported as a development/extension-host run rather than being misrepresented as a pinned branded build.

## 6. Pinned Code-OSS source/runtime qualification

`code-oss-mvp/qualify-code-oss.ps1` validates a staged Code-OSS checkout created by `bootstrap-code-oss.ps1`.

It verifies:

1. `AI-CODER-UPSTREAM.json` exists;
2. current Git HEAD matches the pinned upstream commit;
3. `product.json` has AI-CODER product branding;
4. built-in extension version matches the manifest;
5. the built-in Node regression suite passes unless explicitly skipped;
6. the Windows Safe-I/O helper is present and its SHA-256 is recorded.

It writes `AI-CODER-QUALIFICATION.json`.

With `-RunCompile`, it also invokes the pinned checkout's `npm run compile` when that script exists. A source/runtime qualification result is not represented as a signed/full binary build unless compile/package/sign steps were actually performed.

## 7. Security boundary unchanged

Phase 7 does not relax model authority:

- models propose changes;
- AI-CODER independently validates paths and commands;
- diffs are reviewed before writes;
- checkpoints preserve exact bytes;
- stale worktree/main state blocks application;
- Windows handle-bound Safe-I/O remains authoritative;
- approved verification remains shell-free;
- Codex remains explicit/manual-only because its external runtime is not treated as equivalent to AI-CODER's context/file confinement.

## Remaining limitations

- Native Windows Safe-I/O tests and Tk display tests still require the Windows release gate.
- Full branded Code-OSS compile/package/sign qualification has not been executed in this Linux artifact environment.
- The cross-process lock is intentionally scoped to the same AI-CODER profile/global-storage root and local workspace.
- Workspace-symbol quality depends on installed/enabled language services and their indexes.
- Python/Tkinter is not yet deleted; it remains the reference/fallback until TypeScript parity and native Windows qualification are sufficient to retire it safely.
- Granular patches remain deferred; reviewed full-file replacements are still authoritative.
