# AI-CODER Studio — Phase 3C checkpoint

**Source:** `X:\2M\000\AI Coders\AI-CODER-v0.6.0-rc4-combined`  
**Packaged app:** `C:\Users\dantesoneja\AppData\Local\AI-CODER\dev\VSCode-win32-x64\AI-CODER.exe`  
**Launch:** `C:\Users\dantesoneja\AppData\Local\AI-CODER\dev\VSCode-win32-x64\Run AI-CODER Studio.bat`

**Codex request path:** Agents `submit` routes via the guarded model router to `CodexCliProvider.chat()`, invoking authenticated `codex exec` with prompt on stdin, read-only sandbox, no approvals, web search disabled, and multi-agent/tools features disabled. Chat mode stores and renders the returned assistant text; Agent mode is separately gated and was not run.

**Phase 3C UI fix:** Agents now shows an in-progress state, disables duplicate sends while a request is active, preserves the prompt on errors/cancellation, and clears it only after successful completion. Extension posts request lifecycle updates and reports errors/cancellation. Existing auth, Codex boundary confirmation, trust, and inference controls remain in place.

**Sync/checks:** Updated `extension.js` and `agentsWebview.js` are synchronized across project source, Code-OSS checkout, and packaged app (matching SHA-256). Targeted `node --check` passed for both files. No full rebuild performed.

**Current runtime/test state:** The packaged app is open with the project workspace trusted. In the Agents interface, provider `Codex (ChatGPT sign-in)` showed `Logged in using ChatGPT` and Codex CLI `0.163.0-alpha.10.2`; mode was `Chat`. With explicit authorization, one request was sent with the project context: `Reply with exactly: AI-CODER OpenAI connection successful.` The Agents conversation displayed the exact response `AI-CODER: AI-CODER OpenAI connection successful.` and returned to idle. This confirms the actual Codex-backed request/response/display path; no CLI-only or mock response was used. No Agent-mode execution or generated commands were run. Do not send another model request or sign out without authorization. Broader tests remain deferred.
