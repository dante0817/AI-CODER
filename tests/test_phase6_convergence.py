from __future__ import annotations

import json
from pathlib import Path

from ai_coder.core.context import rank_workspace_candidates
from ai_coder.core.model_catalog_cache import ModelCatalogCache, catalog_cache_key
from ai_coder.core.model_discovery import ModelCatalogSnapshot, ProviderCatalogStatus
from ai_coder.core.models import ModelRegistry

ROOT = Path(__file__).resolve().parents[1]
SPEC = ROOT / "spec" / "behavior"


def load(name: str) -> dict:
    return json.loads((SPEC / name).read_text(encoding="utf-8"))


def test_context_ranking_v3_semantic_reference_vectors():
    for case in load("context-ranking-v3.json")["cases"]:
        ranked = rank_workspace_candidates(
            case["paths"],
            active_rel=case["activeRel"],
            active_text=case["activeText"],
            task_text=case["taskText"],
            modified_paths=set(case["modifiedPaths"]),
            symbol_hits=case.get("symbolHits", {}),
            semantic_paths=set(case.get("semanticPaths", [])),
        )
        assert [item.path for item in ranked] == case["expectedOrder"], case["name"]
        by_path = {item.path: item for item in ranked}
        for rel, reason in case.get("expectedReasons", {}).items():
            assert by_path[rel].reasons[0] == reason, (case["name"], rel, by_path[rel].reasons)


def test_model_catalog_cache_preserves_capability_provenance_and_ttl(tmp_path):
    registry = ModelRegistry()
    model = registry.find("openai-compatible", "gpt-5.6-sol")
    assert model is not None
    snapshot = ModelCatalogSnapshot(
        models=(model,),
        providers=(ProviderCatalogStatus("openai-compatible", True, (model.model_id,)),),
    )
    now = [1000.0]
    cache = ModelCatalogCache(tmp_path / "catalog.json", ttl_seconds=30, now=lambda: now[0])
    key = catalog_cache_key(provider="auto", base_url="openai=https://api.openai.com/v1", codex_connected=False)
    cache.put(key, snapshot)
    loaded, age, stale = cache.get(key)
    assert age == 0
    assert stale is False
    restored = loaded.models[0]
    assert restored.capability_evidence("reasoning") == model.capability_evidence("reasoning")

    now[0] += 31
    assert cache.get(key) is None
    loaded, age, stale = cache.get(key, allow_stale=True)
    assert age == 31
    assert stale is True
    assert loaded.models[0].discovery_source == model.discovery_source


def test_shared_manual_only_provider_policy_vectors():
    from ai_coder.core.provider_policy import manual_only_provider_eligible

    for case in load("provider-policy-v1.json")["cases"]:
        assert manual_only_provider_eligible(
            case["requestedProvider"], case["providerName"], case["connected"]
        ) is case["eligible"], case["name"]
