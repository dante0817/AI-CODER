import hashlib
import os
import subprocess
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from ai_coder.app import AICoderApp
from ai_coder.core.agent import validate_plan
from ai_coder.core.checkpoints import Change, CheckpointStore, CheckpointConflictError
from ai_coder.core.context import build_context
from ai_coder.core.policy import (
    append_workspace_text,
    classify_command,
    read_workspace_text,
    validate_windows_component,
    validate_workspace_path,
    write_workspace_text,
)
from ai_coder.core.threads import ThreadStore
from ai_coder.core import windows_safe_io


class SecurityTests(unittest.TestCase):
    def test_review_snapshot_does_not_write_checkpoint_and_detects_stale_file(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / 'a.txt').write_text('before', encoding='utf-8')
            store = CheckpointStore(root)
            preview = store.preview([Change('a.txt', 'after')])
            self.assertEqual(list(store.dir.glob('*.json')), [])
            with self.assertRaises(CheckpointConflictError):
                store.create([Change('a.txt', 'different approved content')], expected=preview)
            (root / 'a.txt').write_text('external edit', encoding='utf-8')
            with self.assertRaises(CheckpointConflictError):
                store.create([Change('a.txt', 'after')], expected=preview)
            self.assertEqual((root / 'a.txt').read_text(), 'external edit')

    def test_task_specific_undo_does_not_undo_newer_other_task_checkpoint(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / 'a.txt').write_text('a0', encoding='utf-8')
            (root / 'b.txt').write_text('b0', encoding='utf-8')
            store = CheckpointStore(root)
            task_a = store.create([Change('a.txt', 'a1')]); store.apply(task_a)
            task_b = store.create([Change('b.txt', 'b1')]); store.apply(task_b)
            restored = store.undo_checkpoint(task_a['id'])
            self.assertEqual(restored['id'], task_a['id'])
            self.assertEqual((root / 'a.txt').read_text(), 'a0')
            self.assertEqual((root / 'b.txt').read_text(), 'b1')

    def test_pending_change_merge_accumulates_and_removes_reverted_paths(self):
        merge = AICoderApp._merge_pending_changes
        first = {'files': [{'path': 'a.txt', 'before': 'old', 'after': 'first'}]}
        pending = merge(None, {}, first)
        second = {'files': [{'path': 'a.txt', 'before': 'first', 'after': 'second'},
                            {'path': 'b.txt', 'before': None, 'after': 'new'}]}
        pending = merge(None, pending, second)
        self.assertEqual(pending['a.txt'], {'before': 'old', 'after': 'second'})
        self.assertEqual(pending['b.txt'], {'before': None, 'after': 'new'})
        reverted = {'files': [{'path': 'a.txt', 'before': 'second', 'after': 'old'}]}
        pending = merge(None, pending, reverted)
        self.assertNotIn('a.txt', pending)
        self.assertIn('b.txt', pending)
        self.assertEqual(AICoderApp._worktree_pending(None, {'pendingChanges': {}}, Path('/missing')), {})
        new_file_diff = AICoderApp._checkpoint_diff(None, {'files': [{'path': 'new.txt', 'before': None, 'after': 'new\n'}]})
        self.assertIn('--- /dev/null', new_file_diff)

    def test_checkpoint_apply_rolls_back_completed_files_on_failure(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / 'a.txt').write_text('old-a', encoding='utf-8')
            (root / 'b.txt').write_text('old-b', encoding='utf-8')
            store = CheckpointStore(root)
            cp = store.create([Change('a.txt', 'new-a'), Change('b.txt', 'new-b')])
            from ai_coder.core import checkpoints as checkpoint_module
            original_write = checkpoint_module.write_workspace_bytes

            def fail_second(base, rel, content, **kwargs):
                if rel == 'b.txt' and content == b'new-b':
                    raise OSError('simulated write failure')
                return original_write(base, rel, content, **kwargs)

            with patch('ai_coder.core.checkpoints.write_workspace_bytes', side_effect=fail_second):
                with self.assertRaises(RuntimeError):
                    store.apply(cp)
            self.assertEqual((root / 'a.txt').read_text(), 'old-a')
            self.assertEqual((root / 'b.txt').read_text(), 'old-b')

    def test_selected_sensitive_file_is_not_context(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            secret = root / '.env'
            secret.write_text('TOKEN=something', encoding='utf-8')
            context, _ = build_context(root, active_file=secret, selection='TOKEN=something', include_workspace=True)
            self.assertNotIn('TOKEN=something', context)

    def test_symlink_to_sensitive_and_external_files_is_excluded(self):
        with tempfile.TemporaryDirectory() as td, tempfile.TemporaryDirectory() as external:
            root = Path(td)
            (root / '.env').write_text('INSIDE_SECRET', encoding='utf-8')
            (Path(external) / 'outside.txt').write_text('OUTSIDE_SECRET', encoding='utf-8')
            try:
                (root / 'alias.txt').symlink_to(root / '.env')
                (root / 'outside.txt').symlink_to(Path(external) / 'outside.txt')
            except (OSError, NotImplementedError):
                self.skipTest('Symlinks unavailable')
            context, _ = build_context(root, active_file=root / 'alias.txt', selection='INSIDE_SECRET', include_workspace=True)
            self.assertNotIn('INSIDE_SECRET', context)
            self.assertNotIn('OUTSIDE_SECRET', context)
            with self.assertRaises(ValueError):
                read_workspace_text(root, 'outside.txt')
            with self.assertRaises(ValueError):
                write_workspace_text(root, 'outside.txt', 'tampered')
            self.assertEqual((Path(external) / 'outside.txt').read_text(), 'OUTSIDE_SECRET')
            with self.assertRaises(ValueError):
                CheckpointStore(root).create([Change('outside.txt', 'tampered')])

    def test_symlink_swap_before_checkpoint_apply_is_blocked(self):
        with tempfile.TemporaryDirectory() as td, tempfile.TemporaryDirectory() as external:
            root = Path(td)
            target = root / 'src'
            target.mkdir()
            outside = Path(external) / 'a.txt'
            outside.write_text('safe')
            store = CheckpointStore(root)
            cp = store.create([Change('src/a.txt', 'new')])
            target.rmdir()
            try:
                target.symlink_to(external, target_is_directory=True)
            except (OSError, NotImplementedError):
                self.skipTest('Symlinks unavailable')
            with self.assertRaises(ValueError):
                store.apply(cp)
            self.assertEqual(outside.read_text(), 'safe')

    def test_command_is_exact_and_spawned_without_shell(self):
        with self.assertRaises(ValueError):
            write_workspace_text(Path(tempfile.gettempdir()), '.ai-coder/threads/forged.json', '{}')
        for payload in ['pytest && echo PWN', 'npm test; echo PWN', 'git diff | cat', 'python -m pytest $(whoami)', 'npm run test -- --evil']:
            self.assertFalse(classify_command(payload).allowed)
        with patch('ai_coder.application.verification.subprocess.run') as run:
            run.return_value.returncode = 0
            run.return_value.stdout = ''
            run.return_value.stderr = ''
            app = object.__new__(AICoderApp)
            from ai_coder.application.verification import VerificationService
            app.verification = VerificationService()
            AICoderApp._run_allowed_command(app, 'pytest', Path('.'))
            self.assertEqual(run.call_args.args[0], ['pytest'])
            self.assertFalse(run.call_args.kwargs['shell'])

class ByteExactCheckpointTests(unittest.TestCase):
    def test_crlf_checkpoint_roundtrip_restores_exact_original_bytes(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            target = root / 'crlf.txt'
            original = b'a\r\nb\r\n'
            target.write_bytes(original)
            store = CheckpointStore(root)
            cp = store.create([Change('crlf.txt', 'changed\n')])
            self.assertEqual(cp['files'][0]['before'], 'a\r\nb\r\n')
            store.apply(cp)
            self.assertEqual(target.read_bytes(), b'changed\n')
            store.undo_checkpoint(cp['id'])
            self.assertEqual(target.read_bytes(), original)

    def test_checkpoint_rejects_invalid_utf8_nul_and_oversized_files(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            store = CheckpointStore(root)
            (root / 'invalid.txt').write_bytes(b'abc\xffdef')
            with self.assertRaises(ValueError):
                store.preview([Change('invalid.txt', 'x')])
            (root / 'nul.txt').write_bytes(b'abc\x00def')
            with self.assertRaises(ValueError):
                store.preview([Change('nul.txt', 'x')])
            (root / 'big.txt').write_bytes(b'a' * (2 * 1024 * 1024 + 1))
            with self.assertRaises(ValueError):
                store.preview([Change('big.txt', 'x')])

    def test_apply_rolls_back_file_that_was_replaced_before_write_error(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / 'a.txt').write_bytes(b'old-a')
            (root / 'b.txt').write_bytes(b'old-b')
            store = CheckpointStore(root)
            cp = store.create([Change('a.txt', 'new-a'), Change('b.txt', 'new-b')])
            from ai_coder.core import checkpoints as checkpoint_module
            original_write = checkpoint_module.write_workspace_bytes
            failed = {'done': False}

            def replace_then_fail(base, rel, data, **kwargs):
                original_write(base, rel, data, **kwargs)
                if rel == 'b.txt' and data == b'new-b' and not failed['done']:
                    failed['done'] = True
                    raise OSError('simulated post-replace failure')

            with patch('ai_coder.core.checkpoints.write_workspace_bytes', side_effect=replace_then_fail):
                with self.assertRaises(RuntimeError):
                    store.apply(cp)
            self.assertEqual((root / 'a.txt').read_bytes(), b'old-a')
            self.assertEqual((root / 'b.txt').read_bytes(), b'old-b')
            self.assertIsNone(store.get_checkpoint(cp['id']))

    def test_undo_rolls_back_file_that_was_restored_before_write_error(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / 'a.txt').write_bytes(b'old-a')
            (root / 'b.txt').write_bytes(b'old-b')
            store = CheckpointStore(root)
            cp = store.create([Change('a.txt', 'new-a'), Change('b.txt', 'new-b')])
            store.apply(cp)
            from ai_coder.core import checkpoints as checkpoint_module
            original_write = checkpoint_module.write_workspace_bytes
            failed = {'done': False}

            def restore_then_fail(base, rel, data, **kwargs):
                original_write(base, rel, data, **kwargs)
                if rel == 'b.txt' and data == b'old-b' and not failed['done']:
                    failed['done'] = True
                    raise OSError('simulated post-restore failure')

            with patch('ai_coder.core.checkpoints.write_workspace_bytes', side_effect=restore_then_fail):
                with self.assertRaises(RuntimeError):
                    store.undo_checkpoint(cp['id'])
            self.assertEqual((root / 'a.txt').read_bytes(), b'new-a')
            self.assertEqual((root / 'b.txt').read_bytes(), b'new-b')
            self.assertIsNotNone(store.get_checkpoint(cp['id']))

    @unittest.skipIf(os.name == 'nt', 'POSIX mode-bit assertion')
    def test_atomic_write_preserves_existing_permissions(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            target = root / 'mode.txt'
            target.write_text('before', encoding='utf-8')
            target.chmod(0o640)
            write_workspace_text(root, 'mode.txt', 'after')
            self.assertEqual(target.stat().st_mode & 0o777, 0o640)

    def test_desktop_editor_preserves_crlf_policy_and_rejects_mixed_endings(self):
        original = b'\xef\xbb\xbfa\r\nb\r\n'
        text, ending, bom = AICoderApp._editor_decode_bytes(original, 'a.txt')
        self.assertEqual(text, 'a\nb\n')
        self.assertEqual(ending, '\r\n')
        self.assertTrue(bom)
        self.assertEqual(AICoderApp._editor_encode_bytes(text, 'a.txt', ending, bom), original)
        with self.assertRaises(ValueError):
            AICoderApp._editor_decode_bytes(b'a\r\nb\n', 'mixed.txt')


    def test_orphaned_applied_checkpoint_can_recover_task_action_after_record_save_failure(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / 'a.txt').write_text('before', encoding='utf-8')
            threads = ThreadStore(root)
            record = threads.create('Recovery test')
            store = CheckpointStore(root)
            preview = store.preview([Change('a.txt', 'after')])
            action = AICoderApp._new_task_action(
                checkpoint_id=preview['id'], scope='project', record=record,
                pending_before={}, pending_after={}, status_after='changed', last_changes_after=['a.txt'])
            cp = store.create(
                [Change('a.txt', 'after')], expected=preview,
                metadata={'taskId': record['id'], 'scope': 'project', 'action': action})
            store.apply(cp)
            # Simulate the file apply succeeding while the task record never received actionHistory.
            self.assertEqual((threads.get(record['id']) or {}).get('actionHistory'), [])

            app = object.__new__(AICoderApp)
            app.project_checkpoints = store
            app.thread_store = threads
            recovered = AICoderApp._task_action_history(app, record, persist_recovery=True)
            loaded = threads.get(record['id'])
            self.assertEqual(len(recovered), 1)
            self.assertEqual(recovered[0]['checkpointId'], cp['id'])
            self.assertTrue(recovered[0]['recoveredFromCheckpoint'])
            self.assertEqual(loaded['status'], 'changed')
            self.assertEqual(loaded['lastCheckpoint'], cp['id'])
            self.assertEqual(loaded['lastChanges'], ['a.txt'])
            self.assertEqual(loaded['actionHistory'][0]['checkpointId'], cp['id'])

    def test_task_action_history_handles_three_plans_and_two_main_apply_cycles(self):
        record = {'status': 'ready', 'lastChanges': [], 'appliedWorktreeChanges': {}}
        history = []
        pending = {}

        cp1 = {'id': 'plan-1', 'files': [{'path': 'a.txt', 'before': 'a0', 'after': 'a1'}]}
        p1 = AICoderApp._merge_pending_changes(None, pending, cp1)
        history.append(AICoderApp._new_task_action(
            checkpoint_id='plan-1', scope='worktree', record=record,
            pending_before=pending, pending_after=p1, status_after='review', last_changes_after=['a.txt']))
        record = {**record, 'status': 'review', 'lastChanges': ['a.txt'], 'pendingChanges': p1}

        applied1 = {k: dict(v) for k, v in p1.items()}
        history.append(AICoderApp._new_task_action(
            checkpoint_id='main-1', scope='main_apply', record=record,
            pending_before=p1, pending_after={}, status_after='applied',
            applied_before={}, applied_after=applied1, last_changes_after=['a.txt']))
        record = {**record, 'status': 'applied', 'pendingChanges': {}, 'appliedWorktreeChanges': applied1}
        pending = {}

        cp2 = {'id': 'plan-2', 'files': [{'path': 'b.txt', 'before': 'b0', 'after': 'b1'}]}
        p2 = AICoderApp._merge_pending_changes(None, pending, cp2)
        history.append(AICoderApp._new_task_action(
            checkpoint_id='plan-2', scope='worktree', record=record,
            pending_before=pending, pending_after=p2, status_after='review', last_changes_after=['b.txt']))
        record = {**record, 'status': 'review', 'lastChanges': ['b.txt'], 'pendingChanges': p2}

        applied2 = {**applied1, **{k: dict(v) for k, v in p2.items()}}
        history.append(AICoderApp._new_task_action(
            checkpoint_id='main-2', scope='main_apply', record=record,
            pending_before=p2, pending_after={}, status_after='applied',
            applied_before=applied1, applied_after=applied2, last_changes_after=['b.txt']))
        record = {**record, 'status': 'applied', 'pendingChanges': {}, 'appliedWorktreeChanges': applied2}
        pending = {}

        cp3 = {'id': 'plan-3', 'files': [{'path': 'c.txt', 'before': 'c0', 'after': 'c1'}]}
        p3 = AICoderApp._merge_pending_changes(None, pending, cp3)
        history.append(AICoderApp._new_task_action(
            checkpoint_id='plan-3', scope='worktree', record=record,
            pending_before=pending, pending_after=p3, status_after='review', last_changes_after=['c.txt']))

        self.assertEqual([a['checkpointId'] for a in history], ['plan-1', 'main-1', 'plan-2', 'main-2', 'plan-3'])
        self.assertEqual(history[-1]['pendingBefore'], {})
        self.assertEqual(history[-1]['pendingAfter']['c.txt']['after'], 'c1')
        self.assertEqual(history[-2]['appliedBefore'], applied1)
        self.assertEqual(history[-2]['appliedAfter'], applied2)

    def test_platform_neutral_windows_canonicalization_and_device_names(self):
        # Superscript devices with and without extensions must be blocked
        blocked = [
            "COM¹", "com¹", "COM¹.txt", "COM².tar.gz", "LPT¹", "lpt².log", "LPT³.dat",
            "COM1", "com2", "com3.txt", "lpt1", "lpt9.log", "CON", "con.txt", "PRN", "AUX", "NUL", "nul.bin",
        ]
        for name in blocked:
            with self.assertRaises((ValueError, RuntimeError), msg=f"Expected {name} to be blocked"):
                validate_workspace_path(name)
            with self.assertRaises((ValueError, RuntimeError), msg=f"Expected {name} component to be blocked"):
                validate_windows_component(name)

        # Non-reserved names that resemble devices must be accepted
        accepted = ["COM10", "LPT10", "COMX", "con_file.txt", "my_com1.py", "normal.txt"]
        for name in accepted:
            self.assertEqual(validate_workspace_path(name), name)
            validate_windows_component(name)

        # Control directories, trailing dots/spaces, leading spaces
        with self.assertRaisesRegex(ValueError, "Control data blocked"):
            validate_workspace_path(".AI-CODER/project.json")
        with self.assertRaises(ValueError):
            validate_workspace_path(".ai-coder./project.json")
        with self.assertRaises(ValueError):
            validate_workspace_path(".ai-coder /project.json")
        with self.assertRaises(ValueError):
            validate_workspace_path("src/file.")
        with self.assertRaises(ValueError):
            validate_workspace_path("src/file ")
        with self.assertRaises(ValueError):
            validate_workspace_path("src/ file")

    def test_privilege_separation_allow_sensitive_vs_allow_control(self):
        # Case 1: .ai-coder/project.json with no options -> BLOCKED
        with self.assertRaisesRegex(ValueError, "Control data blocked"):
            validate_workspace_path(".ai-coder/project.json")

        # Case 2: .ai-coder/project.json with allow_sensitive=True only -> STILL BLOCKED
        with self.assertRaisesRegex(ValueError, "Control data blocked"):
            validate_workspace_path(".ai-coder/project.json", allow_sensitive=True)

        # Case 3: .ai-coder/project.json with allow_control=True -> ALLOWED
        self.assertEqual(
            validate_workspace_path(".ai-coder/project.json", allow_control=True),
            ".ai-coder/project.json",
        )

        # Case 4: .env with allow_control=True only -> STILL BLOCKED (sensitive policy applies)
        with self.assertRaisesRegex(ValueError, "Sensitive path blocked"):
            validate_workspace_path(".env", allow_control=True)

        # Case 5: normal project file -> ALLOWED with default options
        self.assertEqual(validate_workspace_path("src/app.py"), "src/app.py")

        # Case 6: model plan proposing .ai-coder target is strictly rejected
        evil_plan = {
            "summary": "hacked",
            "changes": [{"path": ".ai-coder/evil.py", "content": "malicious"}],
        }
        with self.assertRaises(ValueError):
            validate_plan(evil_plan)


@unittest.skipUnless(os.name == "nt", "Windows native safe-I/O integration")
class WindowsSafeIoIntegrationTests(unittest.TestCase):
    def test_windows_safe_io_early_lexical_control_rejection(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td).resolve()
            windows_safe_io.register_workspace(root, force=True)
            # Without allow_control, helper rejects literal .ai-coder early
            with self.assertRaises((ValueError, RuntimeError)):
                windows_safe_io.validate_path(root, ".ai-coder/project.json", allow_control=False)
            # With allow_control=True, helper allows internal control path
            target = windows_safe_io.validate_path(root, ".ai-coder/project.json", allow_control=True)
            self.assertTrue(str(target).endswith("project.json"))

    def test_junction_component_cannot_redirect_write_outside_workspace(self):
        with tempfile.TemporaryDirectory() as td, tempfile.TemporaryDirectory() as external:
            root = Path(td)
            outside = Path(external) / "a.txt"
            outside.write_text("safe", encoding="utf-8")
            junction = root / "src"
            result = subprocess.run(
                ["cmd", "/c", "mklink", "/J", str(junction), str(Path(external))],
                capture_output=True, text=True,
            )
            if result.returncode != 0:
                self.skipTest(f"Junction creation unavailable: {result.stderr or result.stdout}")
            windows_safe_io.register_workspace(root, force=True)
            with self.assertRaises(ValueError):
                write_workspace_text(root, "src/a.txt", "tampered")
            self.assertEqual(outside.read_text(encoding="utf-8"), "safe")

    def test_workspace_root_replacement_is_detected_by_file_identity(self):
        with tempfile.TemporaryDirectory() as td:
            base = Path(td)
            root = base / "workspace"
            root.mkdir()
            (root / "a.txt").write_text("original", encoding="utf-8")
            windows_safe_io.register_workspace(root, force=True)
            moved = base / "workspace-original"
            root.rename(moved)
            root.mkdir()
            (root / "a.txt").write_text("replacement", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "workspace identity changed"):
                read_workspace_text(root, "a.txt")

    def test_pinned_parent_blocks_deterministic_rename_swap(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / "workspace"
            root.mkdir()
            src = root / "src"
            src.mkdir()
            (src / "a.txt").write_text("safe", encoding="utf-8")
            identity = windows_safe_io.register_workspace(root, force=True)
            helper = windows_safe_io._helper_path()
            ready = root.parent / "safeio-ready"
            cont = root.parent / "safeio-continue"
            env = os.environ.copy()
            env.update({
                "AI_CODER_SAFEIO_TEST_HOOKS": "1",
                "AI_CODER_SAFEIO_TEST_READY_FILE": str(ready),
                "AI_CODER_SAFEIO_TEST_CONTINUE_FILE": str(cont),
            })
            proc = subprocess.Popen(
                [str(helper), "test-hold-parent", "--root", str(root),
                 "--expected-root-id", str(identity), "--rel", "src/a.txt"],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            try:
                deadline = time.time() + 5
                while not ready.exists() and time.time() < deadline:
                    time.sleep(0.02)
                self.assertTrue(ready.exists(), "safe-I/O helper did not reach pinned-parent test point")
                with self.assertRaises(OSError):
                    src.rename(root / "src-swapped")
            finally:
                cont.write_text("continue", encoding="ascii")
                stdout, stderr = proc.communicate(timeout=5)
            self.assertEqual(proc.returncode, 0, stderr.decode("utf-8", errors="replace"))

    def test_hard_linked_file_blocked_on_read_and_append(self):
        with tempfile.TemporaryDirectory() as td:
            outside = Path(td) / "outside"
            outside.mkdir()
            victim = outside / "victim.txt"
            victim.write_text("SECRET", encoding="utf-8")

            workspace = Path(td) / "workspace"
            workspace.mkdir()
            alias = workspace / "alias.txt"
            try:
                os.link(str(victim), str(alias))
            except (OSError, NotImplementedError) as exc:
                self.skipTest(f"Hard links not supported in this environment: {exc}")

            with self.assertRaises(ValueError) as ctx:
                read_workspace_text(workspace, "alias.txt")
            self.assertIn("hard-linked", str(ctx.exception).lower())

            with self.assertRaises(ValueError) as ctx:
                append_workspace_text(workspace, "alias.txt", "INJECT\n")
            self.assertIn("hard-linked", str(ctx.exception).lower())
            self.assertEqual(victim.read_text(encoding="utf-8"), "SECRET")

    def test_windows_safe_io_blocks_8_3_alias_to_control_directory(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            identity = windows_safe_io.register_workspace(root, force=True)
            ai_coder_dir = root / ".ai-coder"
            ai_coder_dir.mkdir(exist_ok=True)
            secret_file = ai_coder_dir / "threat.json"
            secret_file.write_text('{"secret": true}', encoding="utf-8")

            # 1. Direct case variation blocked
            with self.assertRaises(ValueError):
                windows_safe_io.validate_path(root, ".AI-CODER/threat.json")

            # 2. Check if an 8.3 short name exists on this volume
            import ctypes
            buf = ctypes.create_unicode_buffer(260)
            if ctypes.windll.kernel32.GetShortPathNameW(str(ai_coder_dir), buf, 260) > 0:
                short_name = Path(buf.value).name
                if short_name.upper() != ".AI-CODER":
                    # Handle normalization MUST resolve the 8.3 alias and reject access
                    with self.assertRaises(ValueError) as ctx:
                        windows_safe_io._run(["validate", "--root", str(root),
                                              "--expected-root-id", identity,
                                              "--rel", f"{short_name}/threat.json"])
                    self.assertIn("protected control path blocked by handle normalization", str(ctx.exception))

    def test_bundled_helper_binary_packaging_and_parity(self):
        native_exe = Path(__file__).resolve().parents[1] / "native" / "windows-safeio" / "windows-safeio.exe"
        code_oss_exe = Path(__file__).resolve().parents[1] / "code-oss-mvp" / "builtin-ai-coder" / "native" / "windows-safeio.exe"
        self.assertTrue(native_exe.is_file(), f"Missing native helper: {native_exe}")
        self.assertTrue(code_oss_exe.is_file(), f"Missing Code-OSS helper: {code_oss_exe}")

        native_bytes = native_exe.read_bytes()
        code_oss_bytes = code_oss_exe.read_bytes()
        self.assertEqual(hashlib.sha256(native_bytes).hexdigest(), hashlib.sha256(code_oss_bytes).hexdigest(),
                         "native helper and Code-OSS helper have different build hashes")

        self.assertIn(b"NtSetInformationFile", native_bytes, "Helper binary lacks NtSetInformationFile symbol/string")
        self.assertIn(b"AI_CODER_SAFEIO_TEST_HOOKS", native_bytes, "Helper binary lacks test hook strings")

        # Verify version and build provenance command
        res = subprocess.run([str(native_exe), "version"], capture_output=True, text=True, check=True)
        import json
        ver_info = json.loads(res.stdout.strip())
        self.assertEqual(ver_info.get("protocol"), 1)
        self.assertEqual(ver_info.get("arch"), "windows/amd64")
        self.assertEqual(ver_info.get("build_provenance"), "AI-CODER-MVP-SafeIO-v0.4.6")

    def test_windows_safe_io_new_file_and_atomic_replace_and_append(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            windows_safe_io.register_workspace(root, force=True)
            # 1. New file write in nested dir
            write_workspace_text(root, "nested/file.txt", "initial content")
            self.assertEqual(read_workspace_text(root, "nested/file.txt"), "initial content")

            # 2. Append to existing file
            append_workspace_text(root, "nested/file.txt", " appended")
            self.assertEqual(read_workspace_text(root, "nested/file.txt"), "initial content appended")

            # 3. Atomic replacement of existing file via NtSetInformationFile rename
            write_workspace_text(root, "nested/file.txt", "completely replaced")
            self.assertEqual(read_workspace_text(root, "nested/file.txt"), "completely replaced")

            # 4. Checkpoint create, apply, and undo
            store = CheckpointStore(root)
            cp = store.create([Change("nested/file.txt", "checkpoint updated")])
            store.apply(cp)
            self.assertEqual(read_workspace_text(root, "nested/file.txt"), "checkpoint updated")
            store.undo_checkpoint(cp["id"])
            self.assertEqual(read_workspace_text(root, "nested/file.txt"), "completely replaced")

