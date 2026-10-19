from pathlib import Path
import tempfile
import unittest
import shutil
import subprocess
import uuid

from ai_coder.core.agent import validate_plan
from ai_coder.core.checkpoints import CheckpointStore
from ai_coder.core.codex_provider import CodexProvider, account_status_from_response, normalize_codex_effort
from ai_coder.core.models import ModelRegistry
from ai_coder.core.policy import classify_command, is_sensitive_path, validate_workspace_path
from ai_coder.core.router import analyze_task, select_execution_profile

class CoreTests(unittest.TestCase):
    def test_architecture_routes_high(self):
        task = analyze_task("Review this entire application architecture")
        self.assertEqual(task.task_type, "architecture")
        self.assertEqual(task.complexity, "high")

    def test_quick_edit_routes_low(self):
        task = analyze_task("Rename this variable, simple change")
        self.assertEqual(task.task_type, "quick_edit")
        self.assertEqual(task.complexity, "low")

    def test_local_only(self):
        p = select_execution_profile(text="Explain this", registry=ModelRegistry(), routing_mode="local-only")
        self.assertEqual(p.provider, "ollama")

    def test_safe_command(self):
        self.assertTrue(classify_command("npm test").allowed)
        self.assertTrue(classify_command("git diff").allowed)

    def test_dangerous_command(self):
        self.assertFalse(classify_command("git reset --hard HEAD").allowed)
        self.assertFalse(classify_command("rm -rf .").allowed)

    def test_sensitive_file(self):
        self.assertTrue(is_sensitive_path("app/.env"))
        self.assertTrue(is_sensitive_path("keys/private.pem"))

    def test_path_traversal(self):
        with self.assertRaises(ValueError): validate_workspace_path("../secret.txt")

    def test_agent_plan(self):
        plan = validate_plan({"summary":"x","changes":[{"path":"src/a.py","content":"print('x')"}],"commands":["pytest"]})
        self.assertEqual(plan.changes[0].path, "src/a.py")
        self.assertTrue(plan.command_checks[0]["allowed"])


    def test_auto_can_filter_to_codex(self):
        p = select_execution_profile(
            text="Review this entire application architecture",
            registry=ModelRegistry(),
            available_providers={"codex"},
        )
        self.assertEqual(p.provider, "codex")

    def test_codex_effort_mapping(self):
        self.assertEqual(normalize_codex_effort("extra-high"), "xhigh")
        self.assertIsNone(normalize_codex_effort("auto"))

    def test_codex_account_status_parsing(self):
        class Account:
            email = "user@example.com"
            plan_type = "plus"
        class Response:
            account = Account()
            requires_openai_auth = True
        status = account_status_from_response(Response())
        self.assertTrue(status.connected)
        self.assertEqual(status.email, "user@example.com")


    def test_codex_adapter_keeps_workspace_behind_context_gate(self):
        captured = {}
        class Sandbox:
            read_only = "read-only"
        class ApprovalMode:
            deny_all = "deny-all"
        class Result:
            final_response = "ok"
            usage = {"input_tokens": 1}
        class Thread:
            def run(self, prompt, **kwargs):
                captured["run"] = kwargs
                return Result()
        class FakeCodex:
            def __enter__(self): return self
            def __exit__(self, *args): return None
            def thread_start(self, **kwargs):
                captured["start"] = kwargs
                return Thread()
        provider = CodexProvider()
        provider._imports = lambda: (FakeCodex, Sandbox, ApprovalMode)
        result = provider.chat(
            model="codex-default",
            messages=[{"role":"system","content":"safe context"},{"role":"user","content":"review it"}],
            effort="high",
            workspace=Path("/tmp/private-project"),
        )
        self.assertEqual(result.text, "ok")
        self.assertNotEqual(captured["start"]["cwd"], "/tmp/private-project")
        self.assertEqual(captured["start"]["sandbox"], "read-only")
        self.assertEqual(captured["start"]["approval_mode"], "deny-all")

    def test_checkpoint_apply_undo(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            target = root / "a.txt"; target.write_text("before", encoding="utf-8")
            store = CheckpointStore(root)
            from ai_coder.core.checkpoints import Change
            cp = store.create([Change("a.txt", "after")])
            store.apply(cp)
            self.assertEqual(target.read_text(), "after")
            store.undo_last()
            self.assertEqual(target.read_text(), "before")

# v0.4 Codex-style command-center tests
from ai_coder.core.threads import ThreadStore
from ai_coder.core.skills import SkillStore
from ai_coder.core.worktrees import WorktreeManager, is_git_repository

class CommandCenterTests(unittest.TestCase):
    def test_thread_store_persists_messages_and_status(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            store = ThreadStore(root)
            t = store.create("Fix login")
            store.add_message(t["id"], "user", "Please fix it")
            store.patch(t["id"], status="running", execution={"provider":"codex"})
            loaded = store.get(t["id"])
            self.assertEqual(loaded["title"], "Fix login")
            self.assertEqual(loaded["status"], "running")
            self.assertEqual(loaded["messages"][0]["content"], "Please fix it")
            self.assertEqual(loaded["execution"]["provider"], "codex")

    def test_skill_mentions_are_explicit(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            skills = SkillStore(root)
            skills.save("review", "Always run tests before finalizing.")
            self.assertEqual(skills.resolve_mentions("hello"), "")
            resolved = skills.resolve_mentions("Use @skill:review for this")
            self.assertIn("Always run tests", resolved)

    def test_non_git_project_does_not_create_worktree(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            self.assertFalse(is_git_repository(root))
            result = WorktreeManager(root).ensure("12345678-test")
            self.assertFalse(result["enabled"])

    @unittest.skipUnless(shutil.which("git"), "git is required")
    def test_worktree_conflict_guard(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / "repo"
            root.mkdir()
            subprocess.run(["git", "init"], cwd=root, check=True, capture_output=True)
            subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=root, check=True)
            subprocess.run(["git", "config", "user.name", "AI-CODER Test"], cwd=root, check=True)
            (root / "a.txt").write_text("before\n", encoding="utf-8")
            subprocess.run(["git", "add", "a.txt"], cwd=root, check=True)
            subprocess.run(["git", "commit", "-m", "init"], cwd=root, check=True, capture_output=True)
            manager = WorktreeManager(root)
            thread_id = str(uuid.uuid4())
            info = manager.ensure(thread_id)
            self.assertTrue(info["enabled"], info)
            self.assertEqual(manager.conflicting_paths(info["baseCommit"], ["a.txt"]), [])
            (root / "a.txt").write_text("main changed\n", encoding="utf-8")
            self.assertEqual(manager.conflicting_paths(info["baseCommit"], ["a.txt"]), ["a.txt"])
            manager.remove(thread_id, force=True)

    @unittest.skipUnless(shutil.which("git"), "git is required")
    def test_worktree_changed_paths_includes_staged_unstaged_and_untracked(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / "repo"
            root.mkdir()
            subprocess.run(["git", "init"], cwd=root, check=True, capture_output=True)
            subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=root, check=True)
            subprocess.run(["git", "config", "user.name", "AI-CODER Test"], cwd=root, check=True)
            (root / "tracked.txt").write_text("base\n", encoding="utf-8")
            subprocess.run(["git", "add", "tracked.txt"], cwd=root, check=True)
            subprocess.run(["git", "commit", "-m", "init"], cwd=root, check=True, capture_output=True)
            (root / "tracked.txt").write_text("staged\n", encoding="utf-8")
            subprocess.run(["git", "add", "tracked.txt"], cwd=root, check=True)
            (root / "tracked.txt").write_text("unstaged too\n", encoding="utf-8")
            (root / "new file.txt").write_text("new\n", encoding="utf-8")
            paths = WorktreeManager(root).changed_paths(root)
            self.assertEqual(paths, {"tracked.txt", "new file.txt"})

if __name__ == "__main__":
    unittest.main()
