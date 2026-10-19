from __future__ import annotations

import os
from pathlib import Path
import tempfile
import unittest

from ai_coder.app import AICoderApp
from ai_coder.core.policy import write_workspace_text, read_workspace_bytes


class GuiSmokeTests(unittest.TestCase):
    app: AICoderApp | None = None

    @classmethod
    def setUpClass(cls):
        try:
            cls.app = AICoderApp()
            cls.app.withdraw()  # Headless execution; do not show UI window
            cls.app.update_idletasks()
        except Exception:
            cls.app = None

    @classmethod
    def tearDownClass(cls):
        if cls.app is not None:
            try:
                cls.app.destroy()
            except Exception:
                pass
            cls.app = None

    def setUp(self):
        if self.app is None:
            self.skipTest("Tkinter display not available for GUI smoke test")
        self.app.project_root = None
        self.app.current_file = None
        self.app.current_thread_id = None

    def test_gui_app_initialization_and_defaults(self):
        self.assertIsNotNone(self.app.settings)
        self.assertIsNotNone(self.app.registry)
        self.assertIsNotNone(self.app.credentials)
        self.assertEqual(self.app.mode.get(), "Agent")
        self.assertEqual(self.app.provider.get(), "auto")

    def test_gui_three_panel_layout(self):
        self.assertTrue(hasattr(self.app, "left_panel"))
        self.assertTrue(hasattr(self.app, "editor_panel"))
        self.assertTrue(hasattr(self.app, "prompt_panel"))
        self.assertIn("explorer", self.app.sidebar_frames)
        self.assertIn("tasks", self.app.sidebar_frames)
        self.assertEqual(str(self.app.center_notebook.tab(self.app.editor_tab, "text")), "Editor")
        self.assertEqual(str(self.app.center_notebook.tab(self.app.changes_tab, "text")), "Changes")
        self.assertEqual(self.app.mode.get(), "Agent")

    def test_gui_project_open_and_tree_population(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td).resolve()
            src = root / "src"
            src.mkdir()
            (src / "main.py").write_bytes(b"print('hello')\r\n")
            (root / "README.md").write_bytes(b"# Project\n")

            # Emulate opening project
            self.app.project_root = root
            self.app.activity = None
            self.app.project_checkpoints = None
            self.app.thread_store = None
            self.app.worktrees = None

            from ai_coder.core.activity import ActivityStore
            from ai_coder.core.checkpoints import CheckpointStore
            from ai_coder.core.skills import SkillStore
            from ai_coder.core.threads import ThreadStore
            from ai_coder.core.worktrees import WorktreeManager
            from ai_coder.core.windows_safe_io import register_workspace as register_windows_workspace

            if os.name == "nt":
                register_windows_workspace(root, force=True)

            self.app.activity = ActivityStore(root)
            self.app.project_checkpoints = CheckpointStore(root)
            self.app.thread_store = ThreadStore(root)
            self.app.skill_store = SkillStore(root)
            self.app.worktrees = WorktreeManager(root)

            self.app._populate_files()
            self.app.update_idletasks()

            # Ensure files appear in file tree
            items = self.app.file_tree.get_children()
            self.assertTrue(len(items) > 0)

            # Test opening file in editor
            self.app.open_file(src / "main.py")
            self.app.update_idletasks()
            self.assertEqual(self.app.current_file, src / "main.py")
            self.assertEqual(self.app.current_file_line_ending, "\r\n")
            editor_content = self.app.editor.get("1.0", "end-1c")
            self.assertEqual(editor_content, "print('hello')\n")

            # Modify and save
            self.app.editor.delete("1.0", "end")
            self.app.editor.insert("1.0", "print('hello world')\n")
            self.app.save_current()

            # Verify saved bytes on disk (preserves CRLF)
            saved_bytes = (src / "main.py").read_bytes()
            self.assertEqual(saved_bytes, b"print('hello world')\r\n")

    def test_editor_line_ending_and_bom_roundtrip(self):
        # CRLF round-trip
        crlf_bytes = b"line1\r\nline2\r\n"
        text, le, bom = self.app._editor_decode_bytes(crlf_bytes, "test.txt")
        self.assertEqual(le, "\r\n")
        self.assertFalse(bom)
        encoded = self.app._editor_encode_bytes(text, "test.txt", le, bom)
        self.assertEqual(encoded, crlf_bytes)

        # UTF-8 BOM preservation
        bom_bytes = b"\xef\xbb\xbfhello\n"
        text, le, bom = self.app._editor_decode_bytes(bom_bytes, "test.txt")
        self.assertTrue(bom)
        encoded = self.app._editor_encode_bytes(text, "test.txt", le, bom)
        self.assertEqual(encoded, bom_bytes)

        # Mixed line endings rejected
        mixed_bytes = b"line1\r\nline2\n"
        with self.assertRaises(ValueError):
            self.app._editor_decode_bytes(mixed_bytes, "mixed.txt")

    def test_checkpoint_diff_generation(self):
        # Verify single and multi-file diff rendering
        checkpoint = {
            "files": [
                {
                    "path": "file1.py",
                    "before": "def foo():\n    return 1\n",
                    "after": "def foo():\n    return 2\n",
                },
                {
                    "path": "file2.py",
                    "before": None,
                    "after": "new content\n",
                }
            ]
        }
        diff_text = self.app._checkpoint_diff(checkpoint)
        self.assertIn("--- a/file1.py", diff_text)
        self.assertIn("+++ b/file1.py", diff_text)
        self.assertIn("-    return 1", diff_text)
        self.assertIn("+    return 2", diff_text)
        self.assertIn("--- /dev/null", diff_text)
        self.assertIn("+++ b/file2.py", diff_text)
        self.assertIn("+new content", diff_text)

    def test_thread_management(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td).resolve()
            from ai_coder.core.threads import ThreadStore
            store = ThreadStore(root)
            self.app.project_root = root
            self.app.thread_store = store

            t1 = store.create("First Task")
            t2 = store.create("Second Task")

            self.app._refresh_threads(select_id=t2["id"])
            self.app._on_thread_select()
            self.app.update_idletasks()
            self.assertEqual(self.app.current_thread_id, t2["id"])

            self.app._refresh_threads(select_id=t1["id"])
            self.app._on_thread_select()
            self.app.update_idletasks()
            self.assertEqual(self.app.current_thread_id, t1["id"])
