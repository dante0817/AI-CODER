from __future__ import annotations

import json
import tempfile
import threading
import unittest
from pathlib import Path

from ai_coder.core.settings import SettingsStore
from ai_coder.core.threads import ThreadStore


class SettingsConcurrencyTests(unittest.TestCase):
    def test_update_merges_latest_state_instead_of_stale_overwrite(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "settings.json"
            a = SettingsStore(path)
            b = SettingsStore(path)
            barrier = threading.Barrier(3)

            def update_a():
                barrier.wait()
                a.update({"provider": "ollama"})

            def update_b():
                barrier.wait()
                b.update({"routingMode": "quality"})

            t1 = threading.Thread(target=update_a)
            t2 = threading.Thread(target=update_b)
            t1.start(); t2.start(); barrier.wait(); t1.join(); t2.join()

            data = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(data["provider"], "ollama")
            self.assertEqual(data["routingMode"], "quality")
            self.assertFalse(any(path.parent.glob("settings.json.*.tmp")))


class ThreadStoreConcurrencyTests(unittest.TestCase):
    def test_parallel_message_mutations_do_not_drop_updates(self):
        with tempfile.TemporaryDirectory() as td:
            store = ThreadStore(Path(td))
            record = store.create("Concurrent task")
            errors = []

            def add(i: int):
                try:
                    store.add_message(record["id"], "assistant", f"message-{i}")
                except Exception as exc:  # pragma: no cover - assertion captures any failure
                    errors.append(exc)

            workers = [threading.Thread(target=add, args=(i,)) for i in range(20)]
            for worker in workers:
                worker.start()
            for worker in workers:
                worker.join()

            self.assertEqual(errors, [])
            loaded = store.get(record["id"])
            self.assertIsNotNone(loaded)
            contents = {m["content"] for m in loaded["messages"]}
            self.assertEqual(contents, {f"message-{i}" for i in range(20)})

    def test_patch_and_message_mutation_preserve_both_fields(self):
        with tempfile.TemporaryDirectory() as td:
            store = ThreadStore(Path(td))
            record = store.create("Concurrent patch")
            barrier = threading.Barrier(3)

            def patch_status():
                barrier.wait()
                store.patch(record["id"], status="running", execution={"provider": "codex"})

            def add_message():
                barrier.wait()
                store.add_message(record["id"], "user", "keep me")

            a = threading.Thread(target=patch_status)
            b = threading.Thread(target=add_message)
            a.start(); b.start(); barrier.wait(); a.join(); b.join()

            loaded = store.get(record["id"])
            self.assertEqual(loaded["status"], "running")
            self.assertEqual(loaded["execution"]["provider"], "codex")
            self.assertEqual(loaded["messages"][0]["content"], "keep me")


if __name__ == "__main__":
    unittest.main()
