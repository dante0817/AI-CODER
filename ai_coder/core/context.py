from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

from .policy import is_sensitive_path, read_workspace_text, resolve_workspace_path
from .project_profile import load_profile

DEFAULT_EXCLUDES = {"node_modules", ".git", ".ai-coder", "dist", "build", ".next", "coverage", ".venv", "venv", "__pycache__"}
TEXT_EXTENSIONS = {".js", ".jsx", ".ts", ".tsx", ".json", ".md", ".txt", ".py", ".java", ".cs", ".cpp", ".c", ".h", ".hpp", ".go", ".rs", ".php", ".rb", ".html", ".css", ".scss", ".sql", ".yaml", ".yml", ".toml", ".ini", ".sh", ".ps1"}
STOP_WORDS = {
    "the", "and", "for", "with", "this", "that", "from", "into", "then", "than", "when", "where", "what", "which",
    "have", "has", "had", "will", "would", "should", "could", "can", "please", "pls", "app", "code", "file", "project",
    "fix", "add", "remove", "update", "change", "implement", "review", "make", "use", "using", "only", "also", "after", "before",
}


@dataclass(frozen=True)
class RankedContextCandidate:
    path: str
    score: int
    reasons: tuple[str, ...]


def should_include(path: Path, root: Path) -> bool:
    rel = path.relative_to(root)
    if any(part in DEFAULT_EXCLUDES for part in rel.parts):
        return False
    if is_sensitive_path(rel):
        return False
    try:
        actual = resolve_workspace_path(root, rel.as_posix())
        actual_rel = actual.relative_to(root.resolve())
    except (ValueError, OSError):
        return False
    if any(part in DEFAULT_EXCLUDES for part in actual_rel.parts):
        return False
    return (path.suffix.lower() in TEXT_EXTENSIONS or path.name.lower().startswith("readme")) and (
        actual.suffix.lower() in TEXT_EXTENSIONS or actual.name.lower().startswith("readme")
    )


def _clip(text: str, n: int) -> str:
    if n <= 0:
        return ""
    if len(text) <= n:
        return text
    suffix = "\n...[truncated]"
    if n <= len(suffix):
        return text[:n]
    return text[: n - len(suffix)] + suffix


def _terms(text: str) -> set[str]:
    return {
        token for token in re.findall(r"[a-zA-Z0-9_]+", str(text).lower())
        if len(token) >= 3 and token not in STOP_WORDS and not token.isdigit()
    }


def _path_terms(rel: str) -> set[str]:
    return _terms(re.sub(r"[\\/._\-]+", " ", rel))


def extract_dependency_hints(active_text: str) -> set[str]:
    """Extract lightweight import/include hints without executing project code."""
    hints: set[str] = set()
    text = str(active_text or "")
    patterns = (
        r"(?:from\s+|require\s*\(\s*|import\s+(?:[^'\"]+?\s+from\s+)?)[\"']([^\"']+)[\"']",
        r"^\s*from\s+([A-Za-z_][\w.]*)\s+import\b",
        r"^\s*import\s+([A-Za-z_][\w.]*)",
        r"^\s*#include\s*[<\"]([^>\"]+)[>\"]",
    )
    for pattern in patterns:
        for match in re.finditer(pattern, text, re.MULTILINE):
            raw = match.group(1).strip().replace("\\", "/")
            raw = re.sub(r"^(?:\.\./|\./)+", "", raw)
            raw = re.sub(r"\.(?:js|jsx|ts|tsx|py|json|java|cs|cpp|c|h|hpp|go|rs|php|rb)$", "", raw, flags=re.I)
            if raw:
                hints.add(raw.lower().replace(".", "/"))
    return hints



def extract_symbol_hints(active_text: str, task_text: str = "", selection: str = "") -> set[str]:
    """Extract identifiers likely to connect the active code/task to other source files."""
    combined = "\n".join((str(active_text or ""), str(selection or "")))
    symbols: set[str] = set()
    patterns = (
        r"\b(?:class|def|function|interface|enum|struct|type)\s+([A-Za-z_][A-Za-z0-9_]*)",
        r"\b(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>)",
    )
    for pattern in patterns:
        for match in re.finditer(pattern, combined):
            name = match.group(1)
            if len(name) >= 3 and name.lower() not in STOP_WORDS:
                symbols.add(name.lower())
    # Explicit identifier-shaped terms in the task are useful even when their definition is
    # outside the active file. Avoid broad prose terms by requiring code-like casing/shape.
    for token in re.findall(r"\b[A-Za-z_][A-Za-z0-9_]*\b", str(task_text or "")):
        if ("_" in token or re.search(r"[a-z][A-Z]", token) or token[:1].isupper()) and len(token) >= 3:
            symbols.add(token.lower())
    return set(sorted(symbols)[:40])


def scan_symbol_hits(project_root: Path, paths: list[str], symbols: set[str]) -> dict[str, int]:
    if not symbols:
        return {}
    hits: dict[str, int] = {}
    patterns = [(symbol, re.compile(rf"\b{re.escape(symbol)}\b", re.IGNORECASE)) for symbol in sorted(symbols)]
    for rel in paths:
        try:
            text = read_workspace_text(project_root, rel)
        except Exception:
            continue
        sample = text[:60000]
        count = sum(1 for _, pattern in patterns if pattern.search(sample))
        if count:
            hits[rel.replace("\\", "/").lower()] = count
    return hits

def git_modified_paths(project_root: Path) -> set[str]:
    try:
        proc = subprocess.run(
            ["git", "status", "--porcelain=v1", "-z"], cwd=project_root,
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, check=False, timeout=3,
        )
        if proc.returncode != 0:
            return set()
        out: set[str] = set()
        for entry in proc.stdout.decode("utf-8", errors="replace").split("\0"):
            if not entry or len(entry) < 4:
                continue
            payload = entry[3:]
            if " -> " in payload:
                payload = payload.split(" -> ", 1)[1]
            if payload:
                out.add(payload.replace("\\", "/"))
        return out
    except Exception:
        return set()


def rank_workspace_candidates(
    paths: list[str], *, active_rel: str = "", active_text: str = "", task_text: str = "", modified_paths: set[str] | None = None,
    symbol_hits: dict[str, int] | None = None, semantic_paths: set[str] | None = None, workspace_symbol_hits: dict[str, int] | None = None,
) -> list[RankedContextCandidate]:
    active_rel = str(active_rel or "").replace("\\", "/")
    active_path = Path(active_rel) if active_rel else None
    active_stem = active_path.stem.lower() if active_path else ""
    active_dir = active_path.parent.as_posix().lower() if active_path else ""
    active_ext = active_path.suffix.lower() if active_path else ""
    task_terms = _terms(task_text)
    dep_hints = extract_dependency_hints(active_text)
    modified = {str(p).replace("\\", "/").lower() for p in (modified_paths or set())}
    symbols_by_path = {str(p).replace("\\", "/").lower(): int(v) for p, v in (symbol_hits or {}).items()}
    semantic = {str(p).replace("\\", "/").lower() for p in (semantic_paths or set())}
    workspace_symbols_by_path = {str(p).replace("\\", "/").lower(): int(v) for p, v in (workspace_symbol_hits or {}).items()}

    ranked: list[RankedContextCandidate] = []
    for original in paths:
        rel = str(original).replace("\\", "/")
        if active_rel and rel.lower() == active_rel.lower():
            continue
        low = rel.lower()
        path_terms = _path_terms(low)
        score = 0
        reasons: list[str] = []

        if low in semantic:
            score += 90
            reasons.append("lsp-reference")
        workspace_symbol_count = max(0, workspace_symbols_by_path.get(low, 0))
        if workspace_symbol_count:
            score += min(85, 30 + 20 * workspace_symbol_count)
            reasons.append("workspace-symbol")
        if low in modified:
            score += 80
            reasons.append("git-modified")

        is_test = bool(re.search(r"(?:^|/)(?:test|tests|spec|specs)(?:/|$)", low)) or bool(re.search(r"(?:^|[._-])(?:test|spec)(?:[._-]|$)", Path(low).name))
        if is_test and active_stem and active_stem in low:
            score += 70
            reasons.append("related-test")

        dep_match = False
        stemless = re.sub(r"\.[^.\/]+$", "", low)
        for hint in dep_hints:
            hint_norm = hint.strip("/")
            if not hint_norm:
                continue
            if stemless.endswith(hint_norm) or f"/{hint_norm}/" in f"/{stemless}/" or Path(stemless).name == Path(hint_norm).name:
                dep_match = True
                break
        if dep_match:
            score += 75
            reasons.append("direct-dependency")

        symbol_count = max(0, symbols_by_path.get(low, 0))
        if symbol_count:
            score += min(60, 15 * symbol_count)
            reasons.append("symbol-match")

        overlap = sorted(task_terms & path_terms)
        if overlap:
            score += min(40, 10 * len(overlap))
            reasons.append("task-path-match")

        if active_dir and Path(low).parent.as_posix().lower() == active_dir:
            score += 20
            reasons.append("same-directory")
        if active_ext and Path(low).suffix.lower() == active_ext:
            score += 5
            reasons.append("same-language")
        if Path(low).name.startswith("readme"):
            score += 2
            reasons.append("repository-doc")

        ranked.append(RankedContextCandidate(rel, score, tuple(reasons or ("workspace-fallback",))))

    ranked.sort(key=lambda item: (-item.score, item.path.lower()))
    return ranked


def build_context(
    project_root: Path, *, active_file: Path | None = None, selection: str = "", include_workspace: bool = False,
    max_chars: int = 80000, task_text: str = "", manifest: list[dict] | None = None, profile_override: dict | None = None,
) -> tuple[str, int]:
    """Build bounded task-aware context while preserving the legacy (text, chars) return shape.

    If *manifest* is supplied, it is populated with execution-derived context items for UI/diagnostics.
    """
    parts: list[str] = []
    used = 0
    items = manifest if manifest is not None else []

    def push(label: str, content: str, *, source: str = "", reason: str = "context", priority: int = 0, limit: int | None = None, score: int | None = None):
        nonlocal used
        remaining = max_chars - used
        if remaining <= 0:
            return False
        allowed = remaining if limit is None else min(remaining, max(0, int(limit)))
        if allowed <= 0:
            return False
        original = str(content)
        clipped = _clip(original, allowed)
        if not clipped:
            return False
        parts.append(f"\n--- {label} ---\n{clipped}")
        used += len(clipped)
        items.append({
            "label": label, "source": source, "reason": reason, "priority": priority,
            "score": score if score is not None else priority, "chars": len(clipped),
            "estimatedTokens": max(1, (len(clipped) + 3) // 4), "truncated": len(clipped) < len(original),
        })
        return True

    active_rel = ""
    active_text = ""
    if active_file:
        try:
            active_rel = active_file.relative_to(project_root).as_posix()
            actual = resolve_workspace_path(project_root, active_rel)
            if any(part in DEFAULT_EXCLUDES for part in actual.relative_to(project_root.resolve()).parts):
                raise ValueError("Excluded active file")
            active_text = read_workspace_text(project_root, active_rel)
            if selection:
                push(
                    f"SELECTION {active_rel}", selection, source=active_rel, reason="selected-text", priority=100,
                    limit=min(12000, max(1000, int(max_chars * 0.20))),
                )
            push(
                f"ACTIVE FILE {active_rel}", active_text, source=active_rel, reason="active-file", priority=95,
                limit=min(30000, max(2000, int(max_chars * 0.45))),
            )
        except (ValueError, OSError):
            active_rel = ""
            active_text = ""

    profile = profile_override if profile_override is not None else load_profile(project_root)
    if profile and used < max_chars:
        push(
            "PROJECT PROFILE", json.dumps(profile, indent=2), source=".ai-coder/project.json", reason="project-profile", priority=85,
            limit=min(8000, max(1000, int(max_chars * 0.12))),
        )

    if include_workspace and used < max_chars:
        paths: list[str] = []
        for path in project_root.rglob("*"):
            if len(paths) >= 400:
                break
            if not path.is_file() or not should_include(path, project_root):
                continue
            try:
                if path.stat().st_size > 200_000:
                    continue
                paths.append(path.relative_to(project_root).as_posix())
            except Exception:
                continue
        symbol_hints = extract_symbol_hints(active_text, task_text, selection)
        symbol_hits = scan_symbol_hits(project_root, paths, symbol_hints)
        ranked = rank_workspace_candidates(
            paths, active_rel=active_rel, active_text=active_text, task_text=task_text,
            modified_paths=git_modified_paths(project_root), symbol_hits=symbol_hits,
        )
        per_file_cap = min(12000, max(1500, int(max_chars * 0.15)))
        count = 0
        for candidate in ranked:
            if count >= 120 or used >= max_chars:
                break
            try:
                content = read_workspace_text(project_root, candidate.path)
                push(
                    f"FILE {candidate.path}", content, source=candidate.path,
                    reason=candidate.reasons[0], priority=10 + min(candidate.score, 80), score=candidate.score, limit=per_file_cap,
                )
                count += 1
            except Exception:
                continue
    return "\n".join(parts), used
