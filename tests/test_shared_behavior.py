from __future__ import annotations

import json
from pathlib import Path

from ai_coder.core.context import rank_workspace_candidates
from ai_coder.core.models import ModelRegistry
from ai_coder.core.router import analyze_task, choose_effort, select_execution_profile

ROOT = Path(__file__).resolve().parents[1]
SPEC = ROOT / "spec" / "behavior"


def load(name: str) -> dict:
    return json.loads((SPEC / name).read_text(encoding="utf-8"))


def test_router_shared_behavior_vectors():
    spec = load("router-v1.json")
    for case in spec["analysisCases"]:
        task = analyze_task(case["text"])
        expected = case["expected"]
        assert task.task_type == expected["taskType"], case["name"]
        assert task.complexity == expected["complexity"], case["name"]
        assert task.requires_write == expected["requiresWrite"], case["name"]
        assert task.requires_tools == expected["requiresTools"], case["name"]
        assert choose_effort(task, "auto") == expected["autoEffort"], case["name"]

    for case in spec["routingCases"]:
        profile = select_execution_profile(
            text=case["text"], registry=ModelRegistry(), routing_mode=case["routingMode"],
            available_providers=set(case["availableProviders"]),
        )
        expected = case["expected"]
        assert profile.provider == expected["provider"], case["name"]
        assert profile.model == expected["model"], case["name"]
        assert profile.effort == expected["effort"], case["name"]


def test_context_ranking_shared_behavior_vectors():
    spec = load("context-ranking-v1.json")
    for case in spec["cases"]:
        ranked = rank_workspace_candidates(
            case["paths"], active_rel=case["activeRel"], active_text=case["activeText"],
            task_text=case["taskText"], modified_paths=set(case["modifiedPaths"]),
        )
        assert [item.path for item in ranked] == case["expectedOrder"], case["name"]
        by_path = {item.path: item for item in ranked}
        for rel, reason in case.get("expectedReasons", {}).items():
            assert by_path[rel].reasons[0] == reason, (case["name"], rel, by_path[rel].reasons)


def test_smart_context_clips_large_active_file_and_keeps_ranked_workspace(tmp_path):
    from ai_coder.core.context import build_context

    src = tmp_path / "src"
    src.mkdir()
    active = src / "session.py"
    active.write_text("from token_helper import token\n" + ("x = 1\n" * 12000), encoding="utf-8")
    (tmp_path / "token_helper.py").write_text("token = 'safe'\n", encoding="utf-8")
    (tmp_path / "unrelated.py").write_text("value = 1\n", encoding="utf-8")
    manifest: list[dict] = []
    context, used = build_context(
        tmp_path, active_file=active, include_workspace=True, max_chars=12000,
        task_text="fix session token bug", manifest=manifest,
    )
    assert used <= 12000
    assert "ACTIVE FILE src/session.py" in context
    assert "FILE token_helper.py" in context
    active_item = next(x for x in manifest if x["reason"] == "active-file")
    assert active_item["truncated"] is True
    assert any(x["source"] == "token_helper.py" and x["reason"] == "direct-dependency" for x in manifest)
