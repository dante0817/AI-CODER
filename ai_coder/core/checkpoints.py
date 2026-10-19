from __future__ import annotations

import base64
import hashlib
import json
import time
import uuid
from dataclasses import dataclass
from pathlib import Path

from .policy import (
    decode_text_bytes,
    ensure_workspace_directory,
    read_workspace_bytes,
    read_workspace_text,
    resolve_workspace_path,
    unlink_workspace_file,
    validate_workspace_path,
    write_workspace_bytes,
    write_workspace_text,
)

MAX_CHECKPOINT_TEXT_BYTES = 2 * 1024 * 1024


@dataclass
class Change:
    path: str
    content: str


class CheckpointConflictError(ValueError):
    """Raised when a reviewed file changed before apply or undo."""


class CheckpointRecoveryError(RuntimeError):
    """Raised when an interrupted apply/undo could not be proven fully recovered."""

    def __init__(self, message: str, affected_paths: list[str] | None = None):
        self.affected_paths = affected_paths or []
        detail = message
        if self.affected_paths:
            detail += "\nRecovery needed for: " + ", ".join(self.affected_paths)
        super().__init__(detail)


def _b64(data: bytes | None) -> str | None:
    return None if data is None else base64.b64encode(data).decode("ascii")


def _unb64(value: str | None) -> bytes | None:
    return None if value is None else base64.b64decode(value.encode("ascii"), validate=True)


def _sha256(data: bytes | None) -> str | None:
    return None if data is None else hashlib.sha256(data).hexdigest()


class CheckpointStore:
    def __init__(self, project_root: Path):
        self.root = Path(project_root).resolve()
        self.dir = ensure_workspace_directory(self.root, ".ai-coder/checkpoints")

    def _checkpoint_file(self, checkpoint_id: str) -> Path | None:
        candidates = sorted(self.dir.glob(f"*-{checkpoint_id}.json"))
        return candidates[0] if candidates else None

    def _save(self, checkpoint: dict) -> None:
        cp_file = self._checkpoint_file(checkpoint["id"])
        if cp_file is None:
            cp_file = self.dir / f"{int(time.time()*1000)}-{checkpoint['id']}.json"
        write_workspace_text(
            self.root,
            cp_file.relative_to(self.root).as_posix(),
            json.dumps(checkpoint, indent=2, ensure_ascii=False),
            allow_control=True,
        )

    def _delete(self, checkpoint_id: str) -> None:
        cp_file = self._checkpoint_file(checkpoint_id)
        if cp_file is not None:
            unlink_workspace_file(self.root, cp_file.relative_to(self.root).as_posix(), allow_control=True)

    @staticmethod
    def _item_before_bytes(item: dict) -> bytes | None:
        if "beforeBytes" in item:
            return _unb64(item.get("beforeBytes"))
        before = item.get("before")
        return None if before is None else str(before).encode("utf-8")

    @staticmethod
    def _item_after_bytes(item: dict) -> bytes:
        if "afterBytes" in item:
            value = _unb64(item.get("afterBytes"))
            if value is None:
                raise ValueError("Checkpoint afterBytes cannot be null")
            return value
        return str(item.get("after", "")).encode("utf-8")

    @staticmethod
    def _upgrade_loaded(checkpoint: dict) -> dict:
        """Make legacy checkpoints usable without claiming byte history that was never stored."""
        cp = dict(checkpoint)
        files = []
        exact = True
        for original in cp.get("files", []):
            item = dict(original)
            if "beforeBytes" not in item:
                before = item.get("before")
                item["beforeBytes"] = None if before is None else _b64(str(before).encode("utf-8"))
                exact = False
            if "afterBytes" not in item:
                item["afterBytes"] = _b64(str(item.get("after", "")).encode("utf-8"))
                exact = False
            item.setdefault("beforeSha256", _sha256(_unb64(item.get("beforeBytes"))))
            item.setdefault("afterSha256", _sha256(_unb64(item.get("afterBytes"))))
            files.append(item)
        cp["files"] = files
        cp.setdefault("formatVersion", 1 if not exact else 2)
        cp.setdefault("byteExact", exact)
        cp.setdefault("state", "applied")
        return cp

    def preview(self, changes: list[Change]) -> dict:
        """Capture byte-exact preimages for a review preview without writing a checkpoint."""
        files = []
        seen_targets: set[str] = set()
        for change in changes:
            rel = validate_workspace_path(change.path)
            path = resolve_workspace_path(self.root, rel)
            canonical_rel = path.relative_to(self.root).as_posix()
            if canonical_rel in seen_targets:
                raise ValueError(f"Multiple proposed changes target the same file: {change.path}")
            seen_targets.add(canonical_rel)

            before_bytes: bytes | None = None
            before_text: str | None = None
            if path.exists():
                if not path.is_file():
                    raise ValueError(f"Checkpoint target is not a regular file: {change.path}")
                before_bytes = read_workspace_bytes(self.root, canonical_rel)
                before_text = decode_text_bytes(
                    before_bytes,
                    source=change.path,
                    max_bytes=MAX_CHECKPOINT_TEXT_BYTES,
                    reject_nul=True,
                )

            if not isinstance(change.content, str):
                raise ValueError(f"Proposed content for {change.path} is not text.")
            if "\x00" in change.content:
                raise ValueError(f"Proposed content for {change.path} contains NUL characters.")
            after_bytes = change.content.encode("utf-8", errors="strict")
            if len(after_bytes) > MAX_CHECKPOINT_TEXT_BYTES:
                raise ValueError(
                    f"Proposed content for {change.path} is too large for safe review "
                    f"({len(after_bytes)} bytes; limit {MAX_CHECKPOINT_TEXT_BYTES} bytes)."
                )

            files.append({
                "path": rel,
                "resolvedPath": canonical_rel,
                "before": before_text,
                "after": change.content,
                "beforeBytes": _b64(before_bytes),
                "afterBytes": _b64(after_bytes),
                "beforeSha256": _sha256(before_bytes),
                "afterSha256": _sha256(after_bytes),
            })
        return {
            "id": str(uuid.uuid4()),
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "createdAtMs": int(time.time() * 1000),
            "formatVersion": 2,
            "byteExact": True,
            "state": "preview",
            "files": files,
        }

    def create(self, changes: list[Change], *, expected: dict | None = None, metadata: dict | None = None) -> dict:
        checkpoint = self.preview(changes)
        if expected is not None:
            previous = {
                f["path"]: (f["resolvedPath"], f.get("beforeBytes"), f.get("afterBytes"))
                for f in expected["files"]
            }
            current = {
                f["path"]: (f["resolvedPath"], f.get("beforeBytes"), f.get("afterBytes"))
                for f in checkpoint["files"]
            }
            if current != previous:
                raise CheckpointConflictError("A file changed after diff review. Review the updated diff before applying.")
            checkpoint["id"] = expected["id"]
        checkpoint["state"] = "ready"
        if metadata:
            checkpoint["metadata"] = dict(metadata)
        self._save(checkpoint)
        return checkpoint

    def mark_state(self, checkpoint_id: str, state: str, **details) -> dict | None:
        checkpoint = self.get_checkpoint(checkpoint_id)
        if checkpoint is None:
            return None
        checkpoint["state"] = state
        checkpoint.update(details)
        self._save(checkpoint)
        return checkpoint

    def discard_checkpoint(self, checkpoint_id: str) -> None:
        self._delete(checkpoint_id)

    def list_checkpoints(self, *, task_id: str | None = None) -> list[dict]:
        results: list[dict] = []
        for cp_file in sorted(self.dir.glob("*.json")):
            try:
                cp = self.get_checkpoint(cp_file.stem.split("-", 1)[1])
                if cp is None:
                    continue
                if task_id is not None and (cp.get("metadata") or {}).get("taskId") != task_id:
                    continue
                results.append(cp)
            except Exception:
                continue
        results.sort(key=lambda cp: (cp.get("createdAtMs", 0), cp.get("createdAt", ""), cp.get("id", "")))
        return results

    def _current_bytes(self, item: dict) -> bytes | None:
        rel = item.get("resolvedPath") or item["path"]
        path = resolve_workspace_path(self.root, rel)
        if not path.exists():
            return None
        if not path.is_file():
            raise CheckpointConflictError(f"{item['path']} is no longer a regular file; operation cancelled.")
        return read_workspace_bytes(self.root, rel)

    def _affected_paths(self, checkpoint: dict, *, expect_after: bool) -> list[str]:
        affected: list[str] = []
        for item in checkpoint["files"]:
            try:
                current = self._current_bytes(item)
                expected = self._item_after_bytes(item) if expect_after else self._item_before_bytes(item)
                if current != expected:
                    affected.append(item["path"])
            except Exception:
                affected.append(item["path"])
        return affected

    def apply(self, checkpoint: dict) -> None:
        checkpoint = self._upgrade_loaded(checkpoint)
        self._verify_state(checkpoint, use_after=False)
        attempted: list[dict] = []
        current_item: dict | None = None
        try:
            for item in checkpoint["files"]:
                current_item = item
                attempted.append(item)  # include the file whose write may fail after replacement
                rel = item.get("resolvedPath") or item["path"]
                write_workspace_bytes(self.root, rel, self._item_after_bytes(item))
                current_item = None
        except Exception as exc:
            rollback_errors: list[str] = []
            for item in reversed(attempted):
                rel = item.get("resolvedPath") or item["path"]
                try:
                    before = self._item_before_bytes(item)
                    if before is None:
                        unlink_workspace_file(self.root, rel)
                    else:
                        write_workspace_bytes(self.root, rel, before)
                except Exception as rollback_exc:
                    rollback_errors.append(f"{item['path']}: {rollback_exc}")
            affected = self._affected_paths(checkpoint, expect_after=False)
            if not affected:
                self._delete(checkpoint["id"])
                detail = f"Apply failed; all attempted files were verified back at their original bytes: {exc}"
                if rollback_errors:
                    detail += "\nRollback warnings: " + "; ".join(rollback_errors)
                raise RuntimeError(detail) from exc
            try:
                checkpoint["state"] = "recovery-needed"
                checkpoint["recoveryOperation"] = "apply"
                checkpoint["recoveryError"] = str(exc)
                checkpoint["affectedPaths"] = affected
                if current_item is not None:
                    checkpoint["currentPath"] = current_item["path"]
                self._save(checkpoint)
            except Exception:
                pass
            detail = f"Apply failed and exact-byte recovery could not be confirmed: {exc}"
            if rollback_errors:
                detail += "\nRollback errors: " + "; ".join(rollback_errors)
            raise CheckpointRecoveryError(detail, affected) from exc

        checkpoint["state"] = "applied"
        checkpoint.pop("affectedPaths", None)
        checkpoint.pop("currentPath", None)
        checkpoint.pop("recoveryError", None)
        try:
            self._save(checkpoint)
        except Exception as metadata_exc:
            # The user files are already fully replaced at this point. Do not report the apply as
            # failed merely because checkpoint metadata could not be advanced from "ready".
            checkpoint["metadataWarning"] = str(metadata_exc)

    def _verify_state(self, checkpoint: dict, *, use_after: bool) -> None:
        checkpoint = self._upgrade_loaded(checkpoint)
        for item in checkpoint["files"]:
            current = self._current_bytes(item)
            expected = self._item_after_bytes(item) if use_after else self._item_before_bytes(item)
            if current != expected:
                raise CheckpointConflictError(f"{item['path']} changed after review; operation cancelled.")

    def _latest_file(self) -> Path | None:
        files = sorted(self.dir.glob("*.json"), reverse=True)
        return files[0] if files else None

    def get_checkpoint(self, checkpoint_id: str) -> dict | None:
        cp_file = self._checkpoint_file(checkpoint_id)
        if cp_file is None:
            return None
        cp_rel = cp_file.relative_to(self.root).as_posix()
        return self._upgrade_loaded(json.loads(read_workspace_text(self.root, cp_rel, allow_control=True, reject_nul=True)))

    def undo_last(self) -> dict | None:
        cp_file = self._latest_file()
        if not cp_file:
            return None
        return self.undo_checkpoint(cp_file.stem.split("-", 1)[1])

    def verify_checkpoint_state(self, checkpoint_id: str, *, use_after: bool) -> dict | None:
        cp = self.get_checkpoint(checkpoint_id)
        if cp is None:
            return None
        self._verify_state(cp, use_after=use_after)
        return cp

    def finalize_undo(self, checkpoint_id: str) -> None:
        self._delete(checkpoint_id)

    def undo_checkpoint(self, checkpoint_id: str, *, remove: bool = True) -> dict | None:
        """Undo one named checkpoint instead of whichever task wrote most recently."""
        cp = self.get_checkpoint(checkpoint_id)
        if cp is None:
            return None
        self._verify_state(cp, use_after=True)
        attempted: list[dict] = []
        current_item: dict | None = None
        try:
            for item in cp["files"]:
                current_item = item
                attempted.append(item)  # include a file that may fail after its replacement
                rel = item.get("resolvedPath") or item["path"]
                before = self._item_before_bytes(item)
                if before is None:
                    unlink_workspace_file(self.root, rel)
                else:
                    write_workspace_bytes(self.root, rel, before)
                current_item = None
        except Exception as exc:
            rollback_errors: list[str] = []
            for item in reversed(attempted):
                rel = item.get("resolvedPath") or item["path"]
                try:
                    write_workspace_bytes(self.root, rel, self._item_after_bytes(item))
                except Exception as rollback_exc:
                    rollback_errors.append(f"{item['path']}: {rollback_exc}")
            affected = self._affected_paths(cp, expect_after=True)
            if not affected:
                try:
                    cp["state"] = "applied"
                    self._save(cp)
                except Exception:
                    pass
                detail = f"Undo failed; the applied bytes were restored and the checkpoint was retained: {exc}"
                if rollback_errors:
                    detail += "\nRollback warnings: " + "; ".join(rollback_errors)
                raise RuntimeError(detail) from exc
            try:
                cp["state"] = "recovery-needed"
                cp["recoveryOperation"] = "undo"
                cp["recoveryError"] = str(exc)
                cp["affectedPaths"] = affected
                if current_item is not None:
                    cp["currentPath"] = current_item["path"]
                self._save(cp)
            except Exception:
                pass
            detail = f"Undo failed and exact-byte recovery could not be confirmed: {exc}"
            if rollback_errors:
                detail += "\nRollback errors: " + "; ".join(rollback_errors)
            raise CheckpointRecoveryError(detail, affected) from exc

        cp["state"] = "undone" if remove else "undone-pending-history"
        if remove:
            self._delete(cp["id"])
        else:
            self._save(cp)
        return cp
