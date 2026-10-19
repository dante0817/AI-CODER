from __future__ import annotations

from dataclasses import asdict, dataclass

from .models import CAPABILITY_NAMES, ModelDefinition, ModelRegistry, unknown_model


@dataclass(frozen=True)
class ProviderCatalogStatus:
    provider: str
    reachable: bool
    models: tuple[str, ...]
    error: str = ""


@dataclass(frozen=True)
class ModelCatalogSnapshot:
    models: tuple[ModelDefinition, ...]
    providers: tuple[ProviderCatalogStatus, ...]

    def to_dict(self) -> dict:
        return {
            "models": [asdict(model) for model in self.models],
            "providers": [asdict(provider) for provider in self.providers],
        }


def _provider_capability_metadata(adapter, model_id: str) -> dict[str, str]:
    inspector = getattr(adapter, "capability_metadata", None)
    if not callable(inspector):
        return {}
    try:
        raw = inspector(model_id)
    except Exception:
        return {}
    if not isinstance(raw, dict):
        return {}
    out: dict[str, str] = {}
    for name in CAPABILITY_NAMES:
        state = raw.get(name)
        if state in {"supported", "unsupported", "unknown"}:
            out[name] = state
    return out


def discover_model_catalog(
    registry: ModelRegistry,
    adapters: dict[str, object],
    *,
    probe_capabilities: bool = True,
    max_capability_probes: int = 20,
) -> ModelCatalogSnapshot:
    """Build an execution catalog from real provider model listings.

    Provider discovery proves only that an ID exists. Capability claims retain their
    provenance: known registry models keep registry evidence unless a provider-specific
    inspection gives stronger evidence; unknown IDs remain unknown rather than inheriting
    guessed capabilities.
    """
    discovered: list[ModelDefinition] = []
    statuses: list[ProviderCatalogStatus] = []
    seen: set[tuple[str, str]] = set()

    capability_probes = 0
    for provider_name, adapter in adapters.items():
        try:
            lister = getattr(adapter, "list_models", None)
            if callable(lister):
                model_ids = tuple(dict.fromkeys(str(item) for item in lister() if item))
            else:
                health = getattr(adapter, "health", None)
                if not callable(health) or not health():
                    raise RuntimeError("Provider does not expose model discovery and its health check failed.")
                # Compatibility path for older provider adapters: reachability is real, while
                # model IDs/capabilities remain explicitly registry-sourced.
                model_ids = tuple(model.model_id for model in registry.list(provider_name))
            statuses.append(ProviderCatalogStatus(provider_name, True, model_ids))
        except Exception as exc:
            statuses.append(ProviderCatalogStatus(provider_name, False, (), str(exc)))
            continue

        for model_id in model_ids:
            key = (provider_name, model_id)
            if key in seen:
                continue
            seen.add(key)
            known = registry.find(provider_name, model_id)
            model = known if known else unknown_model(provider_name, model_id, source="provider-catalog-id")
            should_probe = probe_capabilities and (known is None) and capability_probes < max(0, int(max_capability_probes))
            states = _provider_capability_metadata(adapter, model_id) if should_probe else {}
            if should_probe:
                capability_probes += 1
            if states:
                model = model.with_discovery(
                    discovery_source="provider-catalog+capability-probe",
                    capability_states=states,
                    capability_sources={name: "provider-capability-probe" for name in states},
                )
            else:
                # ID discovery does not upgrade capability provenance.
                model = model.with_discovery(discovery_source="provider-catalog")
            discovered.append(model)

    # Codex/account or other non-catalog providers may be inserted by the caller into the
    # base registry and selected separately. This snapshot intentionally contains only IDs
    # proven by the adapters above.
    discovered.sort(key=lambda m: (m.provider, m.model_id.lower()))
    statuses.sort(key=lambda p: p.provider)
    return ModelCatalogSnapshot(tuple(discovered), tuple(statuses))


def registry_with_catalog(base: ModelRegistry, snapshot: ModelCatalogSnapshot, *, include_registry_only: set[str] | None = None) -> ModelRegistry:
    providers = set(include_registry_only or set())
    models: list[ModelDefinition] = []
    for model in base.list():
        if model.provider in providers:
            models.append(model)
    models.extend(snapshot.models)
    # De-duplicate in favor of discovered/provider-backed records.
    merged: dict[tuple[str, str], ModelDefinition] = {}
    for model in models:
        merged[(model.provider, model.model_id)] = model
    return ModelRegistry(custom=list(merged.values()), include_defaults=False)
