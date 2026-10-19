from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

from ai_coder.application.agent_lifecycle import AgentLifecycleService
from ai_coder.application.changes import ChangeApplicationService, WorktreeApplyConflictError, UndoHistoryPersistenceError
from ai_coder.application.api import ApplicationApi
from ai_coder.application.verification import VerificationService
from ai_coder.core.agent import validate_plan
from ai_coder.core.checkpoints import CheckpointStore
from ai_coder.core.models import ModelRegistry
from ai_coder.core.providers import ProviderResponse
from ai_coder.core.skills import SkillStore
from ai_coder.core.threads import ThreadStore


class FakeCredentials:
    def get(self, provider: str) -> str:
        return "test-key" if provider == "openai-compatible" else ""


class FakeOpenAI:
    response_text = "ok"

    def __init__(self, base_url: str, api_key: str = ""):
        self.base_url = base_url
        self.api_key = api_key

    def health(self, timeout: int = 5) -> bool:
        return True

    def chat(self, *, model: str, messages: list[dict], effort: str = "auto") -> ProviderResponse:
        return ProviderResponse(self.response_text, {"input_tokens": 7, "output_tokens": 3})


class FakeOllama:
    def __init__(self, base_url: str):
        self.base_url = base_url

    def health(self, timeout: int = 3) -> bool:
        return False


class FakeCodex:
    def status(self):
        return SimpleNamespace(connected=False)


class ApplicationLifecycleTests(unittest.TestCase):
    def _service(self, root: Path, openai_factory=FakeOpenAI, codex_factory=FakeCodex):
        threads = ThreadStore(root)
        skills = SkillStore(root)
        return threads, AgentLifecycleService(
            registry=ModelRegistry(),
            credentials=FakeCredentials(),
            thread_store=threads,
            skill_store=skills,
            worktrees=None,
            activity=None,
            codex_factory=codex_factory,
            ollama_factory=FakeOllama,
            openai_factory=openai_factory,
        )

    def test_chat_lifecycle_routes_context_calls_provider_and_persists_response(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "main.py").write_text("print('hello')\n", encoding="utf-8")
            threads, service = self._service(root)
            task = threads.create("Explain")
            threads.add_message(task["id"], "user", "Explain this file")
            snapshot = {
                "thread_id": task["id"],
                "mode": "chat",
                "routing": "balanced",
                "provider": "openai-compatible",
                "model": "gpt-5.6-sol",
                "effort": "medium",
                "include_workspace": True,
                "use_worktree": False,
                "selection": "",
                "active_file": root / "main.py",
                "project_root": root,
            }
            result = service.run(
                "Explain this file",
                snapshot,
                {"openaiCompatibleBaseUrl": "https://api.openai.com/v1", "maxContextChars": 80000},
            )
            self.assertEqual(result.response_text, "ok")
            self.assertGreater(result.context_chars, 0)
            loaded = threads.get(task["id"])
            self.assertEqual(loaded["status"], "ready")
            self.assertEqual(loaded["execution"]["provider"], "openai-compatible")
            self.assertEqual(loaded["messages"][-1]["content"], "ok")

    def test_agent_lifecycle_returns_validated_plan_without_writing_files(self):
        class AgentOpenAI(FakeOpenAI):
            response_text = '{"summary":"change it","changes":[{"path":"a.txt","content":"after"}],"commands":[]}'

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            target = root / "a.txt"
            target.write_text("before", encoding="utf-8")
            threads, service = self._service(root, AgentOpenAI)
            task = threads.create("Edit")
            threads.add_message(task["id"], "user", "Update a.txt")
            snapshot = {
                "thread_id": task["id"],
                "mode": "agent",
                "routing": "balanced",
                "provider": "openai-compatible",
                "model": "gpt-5.6-sol",
                "effort": "high",
                "include_workspace": True,
                "use_worktree": False,
                "selection": "",
                "active_file": target,
                "project_root": root,
            }
            result = service.run(
                "Update a.txt",
                snapshot,
                {"openaiCompatibleBaseUrl": "https://api.openai.com/v1", "maxContextChars": 80000},
            )
            self.assertIsNotNone(result.plan)
            self.assertEqual(result.plan.changes[0].path, "a.txt")
            self.assertEqual(target.read_text(encoding="utf-8"), "before")
            self.assertEqual((threads.get(task["id"]) or {})["status"], "awaiting_review")

    def test_auto_routing_does_not_include_connected_manual_only_codex(self):
        class ConnectedCodex:
            def status(self):
                return SimpleNamespace(installed=True, connected=True, detail="connected")

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            threads, service = self._service(root, codex_factory=ConnectedCodex)
            runtime, available, catalog = service._runtime_registry(
                "auto", "auto", {"openaiCompatibleBaseUrl": "https://api.openai.com/v1"}
            )
            self.assertNotIn("codex", available or set())
            self.assertIsNone(runtime.find("codex", "codex-default"))
            self.assertTrue(catalog["codex"]["connected"])
            self.assertFalse(catalog["codex"]["autoRouting"])

    def test_auto_routing_uses_only_provider_proven_reachable(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            threads, service = self._service(root)
            task = threads.create("Auto")
            threads.add_message(task["id"], "user", "Explain")
            snapshot = {
                "thread_id": task["id"],
                "mode": "chat",
                "routing": "balanced",
                "provider": "auto",
                "model": "auto",
                "effort": "auto",
                "include_workspace": False,
                "use_worktree": False,
                "selection": "",
                "active_file": None,
                "project_root": root,
            }
            result = service.run(
                "Explain",
                snapshot,
                {"openaiCompatibleBaseUrl": "https://api.openai.com/v1", "maxContextChars": 80000},
            )
            self.assertEqual(result.profile.provider, "openai-compatible")
            execution = (threads.get(task["id"]) or {})["execution"]
            self.assertEqual(execution["availableProviders"], ["openai-compatible"])


class ChangeApplicationServiceTests(unittest.TestCase):
    def test_reviewed_plan_apply_and_finalize_are_ui_independent(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            target = root / "a.txt"
            target.write_text("before", encoding="utf-8")
            threads = ThreadStore(root)
            task = threads.create("Apply")
            service = ChangeApplicationService(
                thread_store=threads,
                project_checkpoints=CheckpointStore(root),
                verification=VerificationService(),
            )
            plan = validate_plan(
                {"summary": "Updated a.txt", "changes": [{"path": "a.txt", "content": "after"}], "commands": []}
            )
            prepared = service.prepare_agent_plan(
                plan, root, {"enabled": False, "reason": "Direct project workspace"}, task["id"]
            )
            self.assertTrue(prepared.has_changes)
            self.assertIn("a/a.txt", prepared.diff_text)
            self.assertEqual(target.read_text(encoding="utf-8"), "before")

            applied = service.apply_reviewed_plan(plan, prepared)
            self.assertEqual(target.read_text(encoding="utf-8"), "after")
            self.assertEqual((threads.get(task["id"]) or {})["status"], "changed")

            finalized = service.finalize_agent_apply(
                SimpleNamespace(display_name="Test Model", effort="high"), plan, applied, []
            )
            loaded = threads.get(task["id"])
            self.assertEqual(loaded["verification"]["status"], "complete")
            self.assertIn("Updated a.txt", loaded["messages"][-1]["content"])
            self.assertIn("Agent used Test Model", finalized.status_text)

    def test_rejected_plan_leaves_file_unchanged(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            target = root / "a.txt"
            target.write_text("before", encoding="utf-8")
            threads = ThreadStore(root)
            task = threads.create("Reject")
            service = ChangeApplicationService(thread_store=threads)
            plan = validate_plan(
                {"summary": "Proposed", "changes": [{"path": "a.txt", "content": "after"}], "commands": []}
            )
            prepared = service.prepare_agent_plan(plan, root, {"enabled": False}, task["id"])
            service.reject_plan(plan, prepared)
            self.assertEqual(target.read_text(encoding="utf-8"), "before")
            loaded = threads.get(task["id"])
            self.assertEqual(loaded["status"], "ready")
            self.assertIn("not applied", loaded["messages"][-1]["content"])


class _FakeWorktrees:
    def __init__(self, conflicts=None):
        self.conflicts = list(conflicts or [])

    def conflicting_paths(self, _base_commit, paths):
        return [item for item in self.conflicts if item in paths]


class WorktreeApplyAndApiTests(unittest.TestCase):
    def _setup_task(self, main_root: Path, worktree_root: Path):
        (main_root / "a.txt").write_text("before", encoding="utf-8")
        (worktree_root / "a.txt").write_text("after", encoding="utf-8")
        threads = ThreadStore(main_root)
        task = threads.create("Isolated")
        threads.patch(
            task["id"],
            status="review",
            worktree={"enabled": True, "path": str(worktree_root), "branch": "ai-coder/test", "baseCommit": "base"},
            pendingChanges={"a.txt": {"before": "before", "after": "after"}},
            appliedWorktreeChanges={},
        )
        return threads, task

    def test_worktree_apply_and_task_local_undo_live_in_service(self):
        with tempfile.TemporaryDirectory() as main_td, tempfile.TemporaryDirectory() as wt_td:
            main_root, worktree_root = Path(main_td), Path(wt_td)
            threads, task = self._setup_task(main_root, worktree_root)
            service = ChangeApplicationService(
                thread_store=threads,
                project_checkpoints=CheckpointStore(main_root),
                worktrees=_FakeWorktrees(),
            )
            prepared = service.prepare_worktree_apply(task["id"])
            self.assertEqual((main_root / "a.txt").read_text(encoding="utf-8"), "before")
            self.assertIn("a/a.txt", prepared.diff_text)

            applied = service.apply_worktree_to_project(prepared)
            self.assertEqual((main_root / "a.txt").read_text(encoding="utf-8"), "after")
            current = threads.get(task["id"])
            self.assertEqual(current["status"], "applied")
            self.assertEqual(current["pendingChanges"], {})
            self.assertEqual(current["mainProjectCheckpoint"], applied.checkpoint["id"])

            undone = service.undo_last_task_action(task["id"])
            self.assertIsNotNone(undone)
            self.assertEqual((main_root / "a.txt").read_text(encoding="utf-8"), "before")
            restored = threads.get(task["id"])
            self.assertEqual(restored["status"], "review")
            self.assertEqual(restored["pendingChanges"]["a.txt"]["after"], "after")

    def test_repeated_worktree_apply_uses_last_ai_applied_main_snapshot(self):
        with tempfile.TemporaryDirectory() as main_td, tempfile.TemporaryDirectory() as wt_td:
            main_root, worktree_root = Path(main_td), Path(wt_td)
            threads, task = self._setup_task(main_root, worktree_root)
            fake = _FakeWorktrees()
            service = ChangeApplicationService(
                thread_store=threads, project_checkpoints=CheckpointStore(main_root), worktrees=fake
            )
            first = service.prepare_worktree_apply(task["id"])
            service.apply_worktree_to_project(first)
            self.assertEqual((main_root / "a.txt").read_text(encoding="utf-8"), "after")

            # The original Git base would now report this path as diverged, but AI-CODER knows
            # the exact main snapshot it previously applied for this task.
            fake.conflicts = ["a.txt"]
            (worktree_root / "a.txt").write_text("after-two", encoding="utf-8")
            threads.patch(
                task["id"], status="review",
                pendingChanges={"a.txt": {"before": "after", "after": "after-two"}},
            )
            second = service.prepare_worktree_apply(task["id"])
            service.apply_worktree_to_project(second)
            self.assertEqual((main_root / "a.txt").read_text(encoding="utf-8"), "after-two")

            # A later user/external edit no longer matches the last trusted apply snapshot.
            (main_root / "a.txt").write_text("user-edit", encoding="utf-8")
            (worktree_root / "a.txt").write_text("after-three", encoding="utf-8")
            threads.patch(
                task["id"], status="review",
                pendingChanges={"a.txt": {"before": "after-two", "after": "after-three"}},
            )
            with self.assertRaises(WorktreeApplyConflictError):
                service.prepare_worktree_apply(task["id"])

    def test_worktree_apply_rechecks_worktree_identity_after_review(self):
        with tempfile.TemporaryDirectory() as main_td, tempfile.TemporaryDirectory() as wt_td:
            main_root, worktree_root = Path(main_td), Path(wt_td)
            threads, task = self._setup_task(main_root, worktree_root)
            service = ChangeApplicationService(
                thread_store=threads,
                project_checkpoints=CheckpointStore(main_root),
                worktrees=_FakeWorktrees(),
            )
            prepared = service.prepare_worktree_apply(task["id"])
            changed = dict((threads.get(task["id"]) or {})["worktree"])
            changed["baseCommit"] = "different-base"
            threads.patch(task["id"], worktree=changed)
            with self.assertRaisesRegex(ValueError, "worktree changed after review"):
                service.apply_worktree_to_project(prepared)
            self.assertEqual((main_root / "a.txt").read_text(encoding="utf-8"), "before")

    def test_worktree_apply_rechecks_source_after_review(self):
        with tempfile.TemporaryDirectory() as main_td, tempfile.TemporaryDirectory() as wt_td:
            main_root, worktree_root = Path(main_td), Path(wt_td)
            threads, task = self._setup_task(main_root, worktree_root)
            service = ChangeApplicationService(
                thread_store=threads,
                project_checkpoints=CheckpointStore(main_root),
                worktrees=_FakeWorktrees(),
            )
            prepared = service.prepare_worktree_apply(task["id"])
            (worktree_root / "a.txt").write_text("changed-after-review", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "changed while the diff was open"):
                service.apply_worktree_to_project(prepared)
            self.assertEqual((main_root / "a.txt").read_text(encoding="utf-8"), "before")

    def test_undo_retains_checkpoint_until_history_update_can_retry(self):
        with tempfile.TemporaryDirectory() as main_td, tempfile.TemporaryDirectory() as wt_td:
            main_root, worktree_root = Path(main_td), Path(wt_td)
            threads, task = self._setup_task(main_root, worktree_root)
            checkpoints = CheckpointStore(main_root)
            service = ChangeApplicationService(
                thread_store=threads, project_checkpoints=checkpoints, worktrees=_FakeWorktrees()
            )
            prepared = service.prepare_worktree_apply(task["id"])
            applied = service.apply_worktree_to_project(prepared)
            original_mutate = threads.mutate
            calls = {"failed": False}

            def fail_once(thread_id, mutator):
                if not calls["failed"]:
                    calls["failed"] = True
                    raise OSError("simulated task-history failure")
                return original_mutate(thread_id, mutator)

            threads.mutate = fail_once
            with self.assertRaises(UndoHistoryPersistenceError):
                service.undo_last_task_action(task["id"])
            self.assertEqual((main_root / "a.txt").read_text(encoding="utf-8"), "before")
            retained = checkpoints.get_checkpoint(applied.checkpoint["id"])
            self.assertEqual(retained["state"], "undone-pending-history")

            threads.mutate = original_mutate
            retried = service.undo_last_task_action(task["id"])
            self.assertIsNotNone(retried)
            self.assertIsNone(checkpoints.get_checkpoint(applied.checkpoint["id"]))
            self.assertEqual((threads.get(task["id"]) or {})["status"], "review")

    def test_application_api_uses_one_time_review_ids_and_emits_conflicts(self):
        with tempfile.TemporaryDirectory() as main_td, tempfile.TemporaryDirectory() as wt_td:
            main_root, worktree_root = Path(main_td), Path(wt_td)
            threads, task = self._setup_task(main_root, worktree_root)
            events = []
            worktrees = _FakeWorktrees()
            service = ChangeApplicationService(
                thread_store=threads, project_checkpoints=CheckpointStore(main_root), worktrees=worktrees
            )
            api = ApplicationApi(thread_store=threads, changes=service, emit=events.append)
            preview = api.dispatch({"type": "worktree.prepare_apply", "taskId": task["id"]})
            self.assertEqual(preview["type"], "worktree.apply_preview_ready")
            result = api.dispatch({"type": "worktree.apply", "reviewId": preview["reviewId"]})
            self.assertEqual(result["type"], "worktree.applied_to_project")
            with self.assertRaisesRegex(ValueError, "no longer active"):
                api.dispatch({"type": "worktree.apply", "reviewId": preview["reviewId"]})
            self.assertTrue(any(event["type"] == "command.failed" for event in events))

            # Prepare a second pending apply and prove conflict details are structured.
            (worktree_root / "a.txt").write_text("after-two", encoding="utf-8")
            (main_root / "a.txt").write_text("external-edit", encoding="utf-8")
            threads.patch(task["id"], status="review", pendingChanges={"a.txt": {"before": "after", "after": "after-two"}})
            worktrees.conflicts = ["a.txt"]
            with self.assertRaises(WorktreeApplyConflictError):
                api.dispatch({"type": "worktree.prepare_apply", "taskId": task["id"]})
            self.assertEqual(events[-1]["conflicts"], ["a.txt"])


if __name__ == "__main__":
    unittest.main()
