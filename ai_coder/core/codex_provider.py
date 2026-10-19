from __future__ import annotations

import importlib.util
import subprocess
import sys
import webbrowser
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from .providers import ProviderResponse


@dataclass(frozen=True)
class CodexAccountStatus:
    installed: bool
    connected: bool
    email: str = ""
    plan: str = ""
    detail: str = ""


def codex_sdk_available() -> bool:
    return importlib.util.find_spec("openai_codex") is not None


def normalize_codex_effort(effort: str) -> str | None:
    value = (effort or "auto").strip().lower()
    if value == "auto":
        return None
    if value == "extra-high":
        return "xhigh"
    return value


def _field(obj, name: str, default=None):
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(name, default)
    return getattr(obj, name, default)


def _enum_text(value) -> str:
    if value is None:
        return ""
    raw = getattr(value, "value", value)
    return str(raw)


def account_status_from_response(response) -> CodexAccountStatus:
    account = _field(response, "account")
    if account is None:
        requires = bool(_field(response, "requires_openai_auth", False))
        detail = "Sign in with ChatGPT to use your Codex account." if requires else "No Codex account session is currently active."
        return CodexAccountStatus(True, False, detail=detail)
    email = str(_field(account, "email", "") or "")
    plan = _enum_text(_field(account, "plan_type", ""))
    label = "Connected to Codex"
    if email:
        label += f" as {email}"
    if plan:
        label += f" ({plan})"
    return CodexAccountStatus(True, True, email=email, plan=plan, detail=label)


class CodexProvider:
    """Official OpenAI Codex SDK adapter.

    Codex is deliberately constrained to read-only + deny-all approvals here.
    AI-CODER owns file writes, checkpoints, command policy, and undo.
    """

    @staticmethod
    def sdk_available() -> bool:
        return codex_sdk_available()

    @staticmethod
    def install_sdk(timeout: int = 300) -> tuple[bool, str]:
        proc = subprocess.run(
            [sys.executable, "-m", "pip", "install", "--upgrade", "openai-codex"],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        output = (proc.stdout + "\n" + proc.stderr).strip()
        return proc.returncode == 0, output[-12000:]

    @staticmethod
    def _imports():
        if not codex_sdk_available():
            raise RuntimeError(
                "Codex support is not installed. Open AI > AI Connections and choose Install Codex Support."
            )
        from openai_codex import ApprovalMode, Codex, Sandbox
        return Codex, Sandbox, ApprovalMode

    def status(self, refresh: bool = False) -> CodexAccountStatus:
        if not self.sdk_available():
            return CodexAccountStatus(False, False, detail="Codex SDK is not installed.")
        Codex, _, _ = self._imports()
        try:
            with Codex() as codex:
                return account_status_from_response(codex.account(refresh_token=refresh))
        except Exception as exc:
            return CodexAccountStatus(True, False, detail=f"Codex status unavailable: {exc}")

    def login_chatgpt(self, on_url: Callable[[str], None] | None = None) -> CodexAccountStatus:
        Codex, _, _ = self._imports()
        with Codex() as codex:
            login = codex.login_chatgpt()
            url = str(login.auth_url)
            if on_url:
                on_url(url)
            webbrowser.open(url)
            completed = login.wait()
            if not bool(_field(completed, "success", False)):
                return CodexAccountStatus(True, False, detail="ChatGPT sign-in did not complete successfully.")
            return account_status_from_response(codex.account(refresh_token=False))

    def login_device_code(self, on_code: Callable[[str, str], None] | None = None) -> CodexAccountStatus:
        Codex, _, _ = self._imports()
        with Codex() as codex:
            login = codex.login_chatgpt_device_code()
            verification_url = str(login.verification_url)
            user_code = str(login.user_code)
            if on_code:
                on_code(verification_url, user_code)
            completed = login.wait()
            if not bool(_field(completed, "success", False)):
                return CodexAccountStatus(True, False, detail="Device-code sign-in did not complete successfully.")
            return account_status_from_response(codex.account(refresh_token=False))

    def logout(self) -> CodexAccountStatus:
        Codex, _, _ = self._imports()
        with Codex() as codex:
            codex.logout()
        return CodexAccountStatus(True, False, detail="Signed out of Codex.")

    def chat(
        self,
        *,
        model: str,
        messages: list[dict],
        effort: str = "auto",
        workspace: Path | str | None = None,
    ) -> ProviderResponse:
        Codex, Sandbox, ApprovalMode = self._imports()
        system_parts: list[str] = []
        conversation: list[str] = []
        for message in messages:
            role = str(message.get("role", "user")).upper()
            content = str(message.get("content", ""))
            if role == "SYSTEM":
                system_parts.append(content)
            else:
                conversation.append(f"{role}:\n{content}")
        developer_instructions = "\n\n".join(system_parts) or None
        prompt = "\n\n".join(conversation)
        model_arg = None if model in {"", "auto", "codex-default"} else model
        native_effort = normalize_codex_effort(effort)
        # Do not give the account-backed Codex agent direct workspace access.
        # AI-CODER's Context Engine is the authorization boundary and already
        # removes sensitive files. Codex receives only the context supplied in
        # the prompt and runs in an isolated read-only working directory.
        runtime_dir = Path.home() / ".ai-coder" / "codex-runtime"
        runtime_dir.mkdir(parents=True, exist_ok=True)
        cwd = str(runtime_dir.resolve())
        if developer_instructions:
            developer_instructions += "\n\nAI-CODER has supplied the authorized project context. Do not attempt to discover or access project files outside the supplied context."

        with Codex() as codex:
            thread = codex.thread_start(
                approval_mode=ApprovalMode.deny_all,
                developer_instructions=developer_instructions,
                cwd=cwd,
                model=model_arg,
                sandbox=Sandbox.read_only,
            )
            kwargs = {
                "approval_mode": ApprovalMode.deny_all,
                "cwd": cwd,
                "model": model_arg,
                "sandbox": Sandbox.read_only,
            }
            if native_effort:
                kwargs["effort"] = native_effort
            result = thread.run(prompt, **kwargs)

        usage_obj = getattr(result, "usage", None) or getattr(result, "token_usage", None)
        if usage_obj is None:
            usage = None
        elif isinstance(usage_obj, dict):
            usage = usage_obj
        elif hasattr(usage_obj, "model_dump"):
            usage = usage_obj.model_dump()
        elif hasattr(usage_obj, "__dict__"):
            usage = dict(usage_obj.__dict__)
        else:
            usage = {"raw": str(usage_obj)}
        return ProviderResponse(str(getattr(result, "final_response", "") or ""), usage)
