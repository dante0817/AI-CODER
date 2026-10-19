from __future__ import annotations

import json
from dataclasses import dataclass
from .checkpoints import Change
from .policy import classify_command, validate_workspace_path

AGENT_SCHEMA_PROMPT = '''You are the editing planner for AI-CODER. Return ONLY valid JSON, no markdown fences.
Schema:
{
  "summary": "short explanation",
  "changes": [{"path":"relative/path","content":"complete replacement file content"}],
  "commands": ["safe verification command"]
}
Rules: only change files necessary for the user's request; paths must be workspace-relative; never request secrets; commands should be tests/lint/build/status/diff only. If no change is needed, return empty changes.'''

@dataclass
class AgentPlan:
    summary: str
    changes: list[Change]
    command_checks: list[dict]


def extract_json(text: str) -> dict:
    t = (text or "").strip()
    try:
        return json.loads(t)
    except Exception:
        start, end = t.find("{"), t.rfind("}")
        if start >= 0 and end > start:
            return json.loads(t[start:end+1])
        raise ValueError("Agent response was not valid JSON")


def validate_plan(plan: dict) -> AgentPlan:
    if not isinstance(plan, dict):
        raise ValueError("Invalid agent plan")
    changes: list[Change] = []
    for item in plan.get("changes") or []:
        rel = validate_workspace_path(str(item.get("path", "")))
        content = item.get("content")
        if not isinstance(content, str):
            raise ValueError(f"Missing content for {rel}")
        changes.append(Change(rel, content))
    checks = []
    for command in plan.get("commands") or []:
        verdict = classify_command(str(command))
        checks.append({"command": str(command), "allowed": verdict.allowed, "level": verdict.level, "reason": verdict.reason})
    return AgentPlan(str(plan.get("summary") or ""), changes, checks)
