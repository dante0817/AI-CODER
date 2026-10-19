from __future__ import annotations

import json
import os
import tempfile
import time
from dataclasses import asdict
from pathlib import Path

from .model_discovery import ModelCatalogSnapshot, ProviderCatalogStatus
from .models import ModelDefinition


def catalog_cache_key(*, provider: str = "auto", base_url: str = "", codex_connected: bool = False) -> str:
    return json.dumps(
        {"provider": provider, "baseUrl": str(base_url or "").rstrip("/"), "codexConnected": bool(codex_connected)},
        sort_keys=True,
        separators=(",", ":"),
    )


def snapshot_from_dict(data: dict) -> ModelCatalogSnapshot:
    models = []
    for raw in data.get("models", []) if isinstance(data, dict) else []:
        if not isinstance(raw, dict):
            continue
        try:
            models.append(ModelDefinition(**raw))
        except (TypeError, ValueError):
            continue
    providers = []
    for raw in data.get("providers", []) if isinstance(data, dict) else []:
        if not isinstance(raw, dict):
            continue
        try:
            providers.append(ProviderCatalogStatus(
                provider=str(raw.get("provider", "")),
                reachable=bool(raw.get("reachable", False)),
                models=tuple(str(x) for x in raw.get("models", []) if x),
                error=str(raw.get("error", "")),
            ))
        except Exception:
            continue
    return ModelCatalogSnapshot(tuple(models), tuple(providers))


class ModelCatalogCache:
    """Small user-local cache for provider model discovery evidence.

    The cache stores the exact discovery snapshot; it never turns provider-catalog ID
    evidence into verified capability evidence. Expired entries are ignored unless the
    caller explicitly asks for stale fallback data.
    """

    def __init__(self, path: Path | None = None, *, ttl_seconds: int = 600, now=time.time):
        self.path = Path(path or (Path.home() / ".ai-coder" / "model-catalog-v1.json"))
        self.ttl_seconds = max(0, int(ttl_seconds))
        self.now = now

    def _read(self) -> dict:
        try:
            value = json.loads(self.path.read_text(encoding="utf-8"))
            return value if isinstance(value, dict) else {"formatVersion": 1, "entries": {}}
        except Exception:
            return {"formatVersion": 1, "entries": {}}

    def _write(self, value: dict) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp_name = tempfile.mkstemp(prefix=self.path.name + ".tmp-", dir=self.path.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(value, handle, indent=2)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(tmp_name, self.path)
            try:
                os.chmod(self.path, 0o600)
            except OSError:
                pass
        finally:
            try:
                os.unlink(tmp_name)
            except FileNotFoundError:
                pass

    def get(self, key: str, *, allow_stale: bool = False) -> tuple[ModelCatalogSnapshot, float, bool] | None:
        root = self._read()
        item = (root.get("entries") or {}).get(key)
        if not isinstance(item, dict) or not isinstance(item.get("snapshot"), dict):
            return None
        saved_at = float(item.get("savedAt", 0) or 0)
        age = max(0.0, self.now() - saved_at)
        stale = age > self.ttl_seconds
        if stale and not allow_stale:
            return None
        return snapshot_from_dict(item["snapshot"]), age, stale

    def put(self, key: str, snapshot: ModelCatalogSnapshot) -> None:
        root = self._read()
        entries = root.get("entries") if isinstance(root.get("entries"), dict) else {}
        entries[key] = {"savedAt": self.now(), "snapshot": snapshot.to_dict()}
        ordered = sorted(entries.items(), key=lambda item: float(item[1].get("savedAt", 0) or 0), reverse=True)[:12]
        self._write({"formatVersion": 1, "entries": dict(ordered)})

    def clear(self) -> None:
        try:
            self.path.unlink()
        except FileNotFoundError:
            pass
