from __future__ import annotations

from dataclasses import asdict, dataclass, field, replace

CAPABILITY_NAMES = ("tools", "reasoning", "images", "structured_output")
CAPABILITY_STATES = {"supported", "unsupported", "unknown"}


def _state_from_bool(value: bool) -> str:
    return "supported" if bool(value) else "unsupported"


@dataclass
class ModelDefinition:
    provider: str
    model_id: str
    display_name: str
    profiles: dict[str, float]
    capabilities: dict[str, bool]
    context_class: str = "unknown"
    latency_class: str = "unknown"
    cost_class: str = "unknown"
    capability_states: dict[str, str] = field(default_factory=dict)
    capability_sources: dict[str, str] = field(default_factory=dict)
    discovery_source: str = "registry"

    def __post_init__(self) -> None:
        normalized_caps = {name: bool(self.capabilities.get(name, False)) for name in CAPABILITY_NAMES}
        self.capabilities = normalized_caps
        normalized_states: dict[str, str] = {}
        normalized_sources: dict[str, str] = {}
        for name in CAPABILITY_NAMES:
            raw_state = self.capability_states.get(name)
            if raw_state not in CAPABILITY_STATES:
                raw_state = _state_from_bool(normalized_caps[name])
            normalized_states[name] = raw_state
            normalized_sources[name] = str(self.capability_sources.get(name) or self.discovery_source or "registry")
            # Compatibility boolean stays conservative for unknown states.
            self.capabilities[name] = raw_state == "supported"
        self.capability_states = normalized_states
        self.capability_sources = normalized_sources

    def capability_evidence(self, name: str) -> dict[str, str]:
        if name not in CAPABILITY_NAMES:
            return {"state": "unknown", "source": "unknown-capability"}
        return {
            "state": self.capability_states.get(name, "unknown"),
            "source": self.capability_sources.get(name, self.discovery_source or "unknown"),
        }

    def with_discovery(self, *, discovery_source: str, capability_states: dict[str, str] | None = None, capability_sources: dict[str, str] | None = None) -> "ModelDefinition":
        states = dict(self.capability_states)
        sources = dict(self.capability_sources)
        for name, state in (capability_states or {}).items():
            if name in CAPABILITY_NAMES and state in CAPABILITY_STATES:
                states[name] = state
        for name, source in (capability_sources or {}).items():
            if name in CAPABILITY_NAMES and source:
                sources[name] = str(source)
        return replace(self, capability_states=states, capability_sources=sources, discovery_source=discovery_source)


def unknown_model(provider: str, model_id: str, *, source: str = "provider-catalog") -> ModelDefinition:
    return ModelDefinition(
        provider,
        model_id,
        model_id,
        {"quick_edit": .55, "debugging": .55, "architecture": .55, "documentation": .60, "general": .55},
        {name: False for name in CAPABILITY_NAMES},
        "unknown", "unknown", "unknown",
        capability_states={name: "unknown" for name in CAPABILITY_NAMES},
        capability_sources={name: source for name in CAPABILITY_NAMES},
        discovery_source=source,
    )


DEFAULT_MODELS = [
    ModelDefinition(
        "codex", "codex-default", "Codex (ChatGPT account)",
        {"quick_edit": .93, "debugging": .99, "architecture": .99, "documentation": .92, "general": .97},
        {"tools": True, "reasoning": True, "images": True, "structured_output": True},
        "large", "medium", "account",
    ),
    ModelDefinition(
        "openai-compatible", "gpt-5.6-sol", "GPT-5.6 Sol",
        {"quick_edit": .82, "debugging": .95, "architecture": .97, "documentation": .90, "general": .94},
        {"tools": True, "reasoning": True, "images": True, "structured_output": True},
        "large", "medium", "high",
    ),
    ModelDefinition(
        "openai-compatible", "gpt-5.6-luna", "GPT-5.6 Luna",
        {"quick_edit": .96, "debugging": .76, "architecture": .72, "documentation": .88, "general": .84},
        {"tools": True, "reasoning": True, "images": True, "structured_output": True},
        "medium", "fast", "low",
    ),
    ModelDefinition(
        "ollama", "qwen3-coder", "Qwen3 Coder (local example)",
        {"quick_edit": .78, "debugging": .77, "architecture": .68, "documentation": .70, "general": .72},
        {"tools": False, "reasoning": True, "images": False, "structured_output": True},
        "medium", "variable", "local",
    ),
]


class ModelRegistry:
    def __init__(self, custom: list[ModelDefinition] | None = None, *, include_defaults: bool = True):
        self.models = (list(DEFAULT_MODELS) if include_defaults else []) + list(custom or [])

    def list(self, provider: str | None = None) -> list[ModelDefinition]:
        return [m for m in self.models if not provider or m.provider == provider]

    def find(self, provider: str, model_id: str) -> ModelDefinition | None:
        return next((m for m in self.models if m.provider == provider and m.model_id == model_id), None)

    def add(self, model: ModelDefinition) -> None:
        for i, current in enumerate(self.models):
            if current.provider == model.provider and current.model_id == model.model_id:
                self.models[i] = model
                return
        self.models.append(model)

    def copy(self) -> "ModelRegistry":
        return ModelRegistry(custom=list(self.models), include_defaults=False)

    def to_dicts(self):
        return [asdict(m) for m in self.models]
