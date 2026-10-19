# Phase 6 — Code-OSS Product Convergence

AI-CODER v0.5.5 advances the Code-OSS target from a feature-parity prototype toward the primary product runtime while preserving the v0.4.7/v0.5 Python lineage as a behavioral and security reference.

## 1. Codex / ChatGPT account integration

The built-in Code-OSS runtime can now use an existing official Codex CLI sign-in as an **explicit manual-only** provider. Codex is deliberately excluded from Auto routing.

- `AI-CODER: Sign In to Codex` opens `codex login` in the integrated terminal.
- `AI-CODER: Check Codex Account Status` checks `codex --version` and `codex login status` without a shell.
- `AI-CODER: Sign Out of Codex` executes `codex logout` without a shell.
- On Windows, AI-CODER avoids shell-based npm `.cmd` launching: it prefers native `codex.exe` or invokes the official npm `codex.js` entry through the current Node executable.
- Agent/model execution uses non-interactive `codex exec`.
- The complete authorized AI-CODER prompt/context is sent through stdin rather than process arguments.
- Codex executes from an isolated AI-CODER global-storage runtime directory, not from the user project.
- The Codex subprocess receives a scrubbed environment containing only OS/runtime/auth-location/locale/temp/certificate variables rather than arbitrary parent-process secrets.
- User configuration/rules are ignored for the AI-CODER invocation, sandbox mode is requested as read-only, approval policy is forced to `never`, web search is disabled, and optional external app/hook/multi-agent features are disabled.
- For Agent mode, AI-CODER supplies a JSON output schema to Codex and still validates the returned plan independently before any review or file write.

The Codex CLI remains a model provider only. It is not granted authority to mutate the AI-CODER project. File changes continue through AI-CODER's reviewed checkpoint/safe-write boundary. **Important boundary:** Codex is an external local agent runtime; its own sandbox is not treated as equivalent to AI-CODER's context/file authorization boundary and may have broader filesystem read visibility on some versions/platforms. For that reason Codex is manual-only and the UI displays a modal warning before its first use in each session.

A shared `provider-policy-v1.json` behavior contract is executed by both Python and TypeScript so connected manual-only providers cannot silently re-enter Auto routing during later refactors.

## 2. Provider catalog caching

Provider model discovery can now be cached for a bounded TTL (10 minutes by default in Code-OSS and the Python reference cache).

The cache stores the exact discovery snapshot and its original capability provenance. Cached discovery never upgrades `provider-catalog-id` evidence into verified capability evidence.

The Code-OSS cache lives in extension global storage, not in the project/model context. Python uses `~/.ai-coder/model-catalog-v1.json`.

A manual provider-settings/API-key change clears the local catalog cache. Explicit **Refresh models** bypasses the cache.

## 3. LSP/reference-aware Smart Context

The Code-OSS context engine now consumes language-service reference results when available:

1. request document symbols for the active editor,
2. prioritize symbols under the cursor,
3. request references through `vscode.executeReferenceProvider`,
4. normalize only safe project-local file paths,
5. add a bounded `lsp-reference` ranking signal.

This signal affects context ranking only. It never bypasses sensitive/control-path exclusion or the context budget.

The Python ranking reference accepts the same semantic-path input shape so shared behavior vectors can validate ordering even though Tkinter does not provide an LSP service.

## 4. Shared context behavior v3

`spec/behavior/context-ranking-v3.json` adds cross-runtime vectors for semantic/LSP-reference ranking and ordinary Git/fallback ordering.

Both Python and TypeScript execute these vectors.

## 5. Multi-task concurrency qualification

The durable Code-OSS `TaskStore` is stress-tested with concurrent mutations across multiple task records. The extension-host writer serializes mutations so independent task updates are not lost within one running AI-CODER Code-OSS instance.

This does **not** yet claim safe concurrent mutation from two separate Code-OSS windows/processes opened on the same project. Cross-process/multi-window project-state locking remains a release-hardening item.

## 6. Reproducible Code-OSS staging evidence

`bootstrap-code-oss.ps1` now supports an optional `-CodeOSSRef` and writes `AI-CODER-UPSTREAM.json` containing:

- AI-CODER version,
- upstream repository,
- requested ref,
- exact resolved upstream commit,
- resolved Git description,
- staging timestamp,
- built-in extension location.

This does not claim that the full Code-OSS distribution was compiled in the artifact environment. It records the exact source revision that a downstream build must use.

## 7. Release hygiene

The Windows release packager is versioned for v0.5.5 and explicitly excludes transient dependency/cache directories plus real `.env` files and common private-key/container formats while retaining non-secret templates such as `.env.example`.

## Security boundary unchanged

Phase 6 does not relax the mutation boundary:

- model output is a proposal,
- paths and commands are independently validated,
- diffs are reviewed before writes,
- checkpoints preserve exact bytes,
- worktree/main stale-state checks remain authoritative,
- Windows handle-bound safe I/O remains authoritative,
- shell-free approved verification remains authoritative.

## Still deferred

- Building and signing a complete branded Code-OSS binary in this artifact environment.
- Cross-process locking for two independent Code-OSS windows editing the same `.ai-coder/code-oss` state simultaneously.
- Rich provider-specific capability verification for providers that do not expose trustworthy metadata/probes.
- Full retirement of Tkinter/Python from production before TypeScript parity and native Windows qualification are complete.
- Granular patch operations; reviewed full-file replacements remain the trusted write format.
