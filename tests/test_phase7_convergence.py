from __future__ import annotations

import json
from pathlib import Path

from ai_coder.core.context import rank_workspace_candidates
from ai_coder.core.provider_contract import map_reasoning_effort, normalize_capability_record, normalize_ollama_capabilities

ROOT = Path(__file__).resolve().parents[1]
SPEC = ROOT / "spec" / "behavior"


def load(name: str) -> dict:
    return json.loads((SPEC / name).read_text(encoding="utf-8"))


def test_context_ranking_v4_workspace_symbol_vectors():
    for case in load("context-ranking-v4.json")["cases"]:
        ranked = rank_workspace_candidates(
            case["paths"], active_rel=case["activeRel"], active_text=case["activeText"], task_text=case["taskText"],
            modified_paths=set(case["modifiedPaths"]), symbol_hits=case.get("symbolHits", {}),
            semantic_paths=set(case.get("semanticPaths", [])), workspace_symbol_hits=case.get("workspaceSymbolHits", {}),
        )
        assert [item.path for item in ranked] == case["expectedOrder"], case["name"]
        by_path = {item.path: item for item in ranked}
        for rel, reason in case.get("expectedReasons", {}).items():
            assert by_path[rel].reasons[0] == reason, (case["name"], rel, by_path[rel].reasons)


def test_shared_provider_normalization_vectors():
    spec = load("provider-normalization-v1.json")
    for case in spec["capabilityCases"]:
        assert normalize_capability_record(case["raw"]) == case["expected"], case["name"]
    for case in spec["ollamaCases"]:
        assert normalize_ollama_capabilities(case["raw"]) == case["expected"], case["name"]
    for case in spec["effortCases"]:
        assert map_reasoning_effort(case["effort"], case["baseUrl"]) == case["expected"], case["name"]
