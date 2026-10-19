from __future__ import annotations

import json
from pathlib import Path

import pytest

from ai_coder.core.context import rank_workspace_candidates
from ai_coder.core.model_discovery import discover_model_catalog
from ai_coder.core.models import ModelRegistry, unknown_model
from ai_coder.core.router import select_execution_profile
from ai_coder.core.task_state import checkpoint_recovery_eligible, merge_pending_changes, reviewed_worktree_state_matches

ROOT = Path(__file__).resolve().parents[1]
SPEC = ROOT / "spec" / "behavior"


def load(name: str) -> dict:
    return json.loads((SPEC / name).read_text(encoding="utf-8"))


def test_context_ranking_v2_symbol_vectors():
    for case in load("context-ranking-v2.json")["cases"]:
        ranked = rank_workspace_candidates(
            case["paths"], active_rel=case["activeRel"], active_text=case["activeText"],
            task_text=case["taskText"], modified_paths=set(case["modifiedPaths"]), symbol_hits=case.get("symbolHits", {}),
        )
        assert [item.path for item in ranked] == case["expectedOrder"], case["name"]
        by_path = {item.path: item for item in ranked}
        for rel, reason in case.get("expectedReasons", {}).items():
            assert by_path[rel].reasons[0] == reason, (case["name"], rel, by_path[rel].reasons)


def test_task_state_shared_vectors():
    spec = load("task-state-v1.json")
    for case in spec["mergeCases"]:
        assert merge_pending_changes(case["previous"], case["files"]) == case["expected"], case["name"]
    for case in spec["reviewCases"]:
        assert reviewed_worktree_state_matches(case["record"], case["reviewedWorktree"], case["reviewedPending"]) is case["expected"], case["name"]
    for case in spec["recoveryCases"]:
        assert checkpoint_recovery_eligible(case["state"], after_bytes_verified=case["afterBytesVerified"]) is case["expected"], case["name"]


class _FakeCatalogAdapter:
    def __init__(self, ids, metadata=None):
        self.ids = list(ids)
        self.metadata = metadata or {}
    def list_models(self):
        return list(self.ids)
    def capability_metadata(self, model):
        return dict(self.metadata.get(model, {}))


def test_model_catalog_preserves_provenance_and_unknown_state():
    registry = ModelRegistry()
    adapter = _FakeCatalogAdapter(
        ["gpt-5.6-sol", "future-coder"],
        {"future-coder": {"structured_output": "supported"}},
    )
    snapshot = discover_model_catalog(registry, {"openai-compatible": adapter})
    models = {m.model_id: m for m in snapshot.models}
    assert models["gpt-5.6-sol"].capability_evidence("reasoning")["state"] == "supported"
    assert models["gpt-5.6-sol"].capability_evidence("reasoning")["source"] == "registry"
    future = models["future-coder"]
    assert future.capability_evidence("tools") == {"state": "unknown", "source": "provider-catalog-id"}
    assert future.capability_evidence("structured_output") == {"state": "supported", "source": "provider-capability-probe"}


def test_auto_write_rejects_unknown_structured_output_but_manual_override_is_explicit():
    unknown = unknown_model("openai-compatible", "future-coder", source="provider-catalog-id")
    registry = ModelRegistry([unknown], include_defaults=False)
    with pytest.raises(ValueError, match="structured-output"):
        select_execution_profile(
            text="Fix the bug", registry=registry, available_providers={"openai-compatible"}, provider="auto", model="auto"
        )
    manual = select_execution_profile(
        text="Fix the bug", registry=ModelRegistry(), provider="openai-compatible", model="future-coder"
    )
    assert manual.capability_source == "unverified-manual"
    assert manual.capability_evidence["structured_output"]["state"] == "unknown"

def test_smart_context_scans_symbol_references_from_real_files(tmp_path):
    from ai_coder.core.context import build_context

    src = tmp_path / "src"
    lib = tmp_path / "lib"
    src.mkdir(); lib.mkdir()
    active = src / "controller.py"
    active.write_text("class SessionManager:\n    pass\nclass CleanupPolicy:\n    pass\n", encoding="utf-8")
    (src / "helper.py").write_text("def helper():\n    return 1\n", encoding="utf-8")
    (lib / "usage.py").write_text("def use(manager: SessionManager, policy: CleanupPolicy):\n    return manager\n", encoding="utf-8")
    manifest: list[dict] = []
    build_context(tmp_path, active_file=active, include_workspace=True, max_chars=20000, task_text="Fix SessionManager CleanupPolicy behavior", manifest=manifest)
    usage = next(x for x in manifest if x.get("source") == "lib/usage.py")
    assert usage["reason"] == "symbol-match"
