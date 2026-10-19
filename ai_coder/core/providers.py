from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import dataclass

from .provider_contract import map_reasoning_effort, normalize_capability_record, normalize_ollama_capabilities


@dataclass
class ProviderResponse:
    text: str
    usage: dict | None = None


def _request_json(url: str, *, method: str = "GET", payload: dict | None = None, headers: dict | None = None, timeout: int = 180) -> dict:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={"Content-Type": "application/json", **(headers or {})},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw = response.read().decode("utf-8", errors="replace")
            return json.loads(raw)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:1000]
        raise RuntimeError(f"Provider HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Provider connection failed: {exc.reason}") from exc


def _post_json(url: str, payload: dict, headers: dict | None = None, timeout: int = 180) -> dict:
    return _request_json(url, method="POST", payload=payload, headers=headers, timeout=timeout)


class OpenAICompatibleProvider:
    def __init__(self, base_url: str, api_key: str = ""):
        self.base_url = (base_url or "").rstrip("/")
        self.api_key = api_key
        self._last_model_records: list[dict] | None = None

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}

    def list_model_records(self, timeout: int = 5) -> list[dict]:
        data = _request_json(f"{self.base_url}/models", headers=self._headers(), timeout=timeout)
        items = data.get("data") if isinstance(data, dict) else None
        records = [dict(item) for item in items if isinstance(item, dict) and item.get("id")] if isinstance(items, list) else []
        self._last_model_records = records
        return records

    def list_models(self, timeout: int = 5) -> list[str]:
        return [str(item["id"]) for item in self.list_model_records(timeout=timeout)]

    def capability_metadata(self, model: str) -> dict[str, str]:
        # OpenAI-compatible /models responses are not standardized for capability metadata.
        # Only consume explicit capability fields when a compatible server actually exposes them.
        try:
            records = self._last_model_records if self._last_model_records is not None else self.list_model_records(timeout=5)
            record = next((item for item in records if str(item.get("id")) == model), None)
        except Exception:
            return {}
        if not record:
            return {}
        return normalize_capability_record(record.get("capabilities"))

    def health(self, timeout: int = 5) -> bool:
        try:
            self.list_models(timeout=timeout)
            return True
        except Exception:
            return False

    def chat(self, *, model: str, messages: list[dict], effort: str = "auto") -> ProviderResponse:
        body = {"model": model, "messages": messages, "stream": False}
        mapped_effort = map_reasoning_effort(effort, self.base_url)
        if mapped_effort:
            body["reasoning_effort"] = mapped_effort
        data = _post_json(f"{self.base_url}/chat/completions", body, self._headers())
        content = (((data.get("choices") or [{}])[0].get("message") or {}).get("content"))
        if isinstance(content, list):
            content = "\n".join(str(x.get("text") or x.get("content") or "") for x in content if isinstance(x, dict))
        return ProviderResponse(str(content if content is not None else data), data.get("usage"))


class OllamaProvider:
    def __init__(self, base_url: str):
        self.base_url = (base_url or "").rstrip("/")

    def list_model_records(self, timeout: int = 3) -> list[dict]:
        data = _request_json(f"{self.base_url}/api/tags", timeout=timeout)
        items = data.get("models") if isinstance(data, dict) else None
        return [dict(item) for item in items if isinstance(item, dict) and (item.get("name") or item.get("model"))] if isinstance(items, list) else []

    def list_models(self, timeout: int = 3) -> list[str]:
        return [str(item.get("name") or item.get("model")) for item in self.list_model_records(timeout=timeout)]

    def capability_metadata(self, model: str) -> dict[str, str]:
        try:
            data = _post_json(f"{self.base_url}/api/show", {"model": model}, timeout=5)
        except Exception:
            return {}
        caps = data.get("capabilities") if isinstance(data, dict) else None
        # Omission is not treated as unsupported because server/model versions vary.
        return normalize_ollama_capabilities(caps)

    def health(self, timeout: int = 3) -> bool:
        try:
            self.list_models(timeout=timeout)
            return True
        except Exception:
            return False

    def chat(self, *, model: str, messages: list[dict], effort: str = "auto") -> ProviderResponse:
        data = _post_json(f"{self.base_url}/api/chat", {"model": model, "messages": messages, "stream": False})
        usage = {"input_tokens": data.get("prompt_eval_count"), "output_tokens": data.get("eval_count")}
        return ProviderResponse(str((data.get("message") or {}).get("content") or ""), usage)


class CredentialBroker:
    """MVP credential broker: environment variables + session-only memory. No plaintext persistence."""

    def __init__(self):
        self._session: dict[str, str] = {}

    def set_session_secret(self, provider: str, value: str) -> None:
        if value:
            self._session[provider] = value

    def get(self, provider: str) -> str:
        import os

        if provider in self._session:
            return self._session[provider]
        env = {
            "openai-compatible": "AI_CODER_API_KEY",
        }.get(provider)
        return os.environ.get(env, "") if env else ""
