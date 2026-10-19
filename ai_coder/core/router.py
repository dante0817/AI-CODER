from __future__ import annotations

import re
from dataclasses import dataclass
from .models import ModelDefinition, ModelRegistry, unknown_model

@dataclass(frozen=True)
class TaskAnalysis:
    task_type: str
    complexity: str
    requires_write: bool
    requires_tools: bool

@dataclass(frozen=True)
class ExecutionProfile:
    task: TaskAnalysis
    provider: str
    model: str
    display_name: str
    effort: str
    routing_mode: str
    reason: str
    alternatives: tuple[tuple[str, str, str], ...]
    capabilities: dict[str, bool]
    capability_evidence: dict[str, dict[str, str]]
    capability_source: str


def analyze_task(text: str = "") -> TaskAnalysis:
    s = text.lower()
    task_type, complexity = "general", "medium"
    if re.search(r"architecture|design|review.*app|review.*codebase|entire.*project", s):
        task_type, complexity = "architecture", "high"
    elif re.search(r"bug|debug|exception|error|failing|race|deadlock|timeout", s):
        task_type = "debugging"
        complexity = "high" if re.search(r"intermittent|race|deadlock|concurrency|root cause", s) else "medium"
    elif re.search(r"readme|document|docs|comment|explain", s):
        task_type, complexity = "documentation", "medium"
    elif re.search(r"rename|typo|small change|one line|simple", s):
        task_type, complexity = "quick_edit", "low"
    requires_write = bool(re.search(r"fix|implement|change|edit|refactor|add|remove|create|update", s))
    requires_tools = requires_write or bool(re.search(r"test|run|build|lint|diagnostic", s))
    return TaskAnalysis(task_type, complexity, requires_write, requires_tools)


def choose_effort(task: TaskAnalysis, requested: str = "auto") -> str:
    if requested != "auto":
        return requested
    return {"high": "high", "low": "low"}.get(task.complexity, "medium")


def score_model(model: ModelDefinition, task: TaskAnalysis, routing_mode: str) -> float:
    score = model.profiles.get(task.task_type, model.profiles.get("general", .5))
    if task.requires_tools and model.capability_states.get("tools") == "unsupported":
        score -= .35
    if routing_mode == "quality":
        score += .08 if model.cost_class == "high" else 0
    elif routing_mode == "fast":
        score += .15 if model.latency_class == "fast" else -.03
    elif routing_mode == "low-cost":
        score += .18 if model.cost_class in {"low", "local"} else -.10
    elif routing_mode == "local-only":
        score += 1 if model.provider == "ollama" else -10
    return score


def _auto_eligible(model: ModelDefinition, task: TaskAnalysis) -> bool:
    # Agent-style write tasks require reliable machine-readable plans. Auto routing must
    # not select an unknown/explicitly unsupported model for that hard requirement.
    if task.requires_write and model.capability_states.get("structured_output", "unknown") != "supported":
        return False
    return True


def select_execution_profile(*, text: str, registry: ModelRegistry, provider: str = "auto", model: str = "auto", effort: str = "auto", routing_mode: str = "balanced", available_providers: set[str] | None = None) -> ExecutionProfile:
    task = analyze_task(text)
    candidates = registry.list()
    if available_providers is not None:
        candidates = [m for m in candidates if m.provider in available_providers]
    if provider != "auto":
        candidates = [m for m in candidates if m.provider == provider]
    explicit_manual_model = model != "auto" and provider != "auto"
    if model != "auto":
        exact = [m for m in candidates if m.model_id == model]
        if exact:
            candidates = exact
        elif provider != "auto":
            candidates = [unknown_model(provider, model, source="unverified-manual")]
    if routing_mode == "local-only":
        candidates = [m for m in candidates if m.provider == "ollama"]
    if not explicit_manual_model:
        candidates = [m for m in candidates if _auto_eligible(m, task)]
    if not candidates:
        detail = " Auto routing requires verified structured-output support for write tasks." if task.requires_write and not explicit_manual_model else ""
        raise ValueError("No compatible model candidates. Check provider/model settings." + detail)
    ranked = sorted(((score_model(m, task, routing_mode), m) for m in candidates), key=lambda x: x[0], reverse=True)
    chosen = ranked[0][1]
    bits = [f"{task.task_type} task", f"{task.complexity} complexity", f"{routing_mode} routing"]
    if task.requires_tools:
        bits.append("tool-capable workflow preferred")
    if task.requires_write:
        bits.append("verified structured output required" if not explicit_manual_model else "manual model override")
    if chosen.provider == "ollama":
        bits.append("local provider selected")
    if chosen.provider == "codex":
        bits.append("authenticated Codex account selected")
    evidence = {name: chosen.capability_evidence(name) for name in chosen.capability_states}
    return ExecutionProfile(
        task, chosen.provider, chosen.model_id, chosen.display_name,
        choose_effort(task, effort), routing_mode, "; ".join(bits),
        tuple((m.provider, m.model_id, m.display_name) for _, m in ranked[1:3]),
        dict(chosen.capabilities), evidence, chosen.discovery_source,
    )
