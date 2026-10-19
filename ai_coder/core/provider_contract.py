from __future__ import annotations

CAPABILITY_ALIASES = {
    "tools": ("tools", "tool_calling", "tool_calls"),
    "reasoning": ("reasoning", "thinking"),
    "images": ("images", "vision", "image_input"),
    "structured_output": ("structured_output", "json_schema", "json_mode"),
}


def normalize_capability_record(raw: object) -> dict[str, str]:
    if not isinstance(raw, dict):
        return {}
    out: dict[str, str] = {}
    for target, keys in CAPABILITY_ALIASES.items():
        value = next((raw.get(key) for key in keys if key in raw), None)
        if isinstance(value, bool):
            out[target] = "supported" if value else "unsupported"
        elif isinstance(value, str) and value in {"supported", "unsupported", "unknown"}:
            out[target] = value
    return out


def normalize_ollama_capabilities(values: object) -> dict[str, str]:
    if not isinstance(values, list):
        return {}
    caps = {str(value).lower() for value in values}
    out: dict[str, str] = {}
    if {"tools", "tool", "tool_calling"} & caps:
        out["tools"] = "supported"
    if {"thinking", "reasoning"} & caps:
        out["reasoning"] = "supported"
    if {"vision", "images", "image"} & caps:
        out["images"] = "supported"
    if {"structured_output", "json", "json_schema"} & caps:
        out["structured_output"] = "supported"
    return out


def map_reasoning_effort(effort: str, base_url: str) -> str | None:
    value = str(effort or "auto")
    if value == "auto":
        return None
    if value == "extra-high":
        return "xhigh" if "api.openai.com" in str(base_url or "").lower() else "high"
    return value
