from __future__ import annotations

import subprocess
from dataclasses import dataclass, asdict
from pathlib import Path

from ..core.policy import classify_command


@dataclass(frozen=True)
class VerificationResult:
    command: str
    skipped: bool = False
    reason: str = ""
    code: int | None = None
    stdout: str = ""
    stderr: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


class VerificationService:
    """Run only policy-approved verification commands without a shell."""

    def __init__(self, timeout_seconds: int = 180, output_limit: int = 16000):
        self.timeout_seconds = timeout_seconds
        self.output_limit = output_limit

    def run(self, command: str, cwd: Path) -> dict:
        verdict = classify_command(command)
        if not verdict.allowed:
            return VerificationResult(command=command, skipped=True, reason=verdict.reason).to_dict()
        try:
            proc = subprocess.run(
                list(verdict.argv),
                cwd=Path(cwd),
                shell=False,
                capture_output=True,
                text=True,
                timeout=self.timeout_seconds,
            )
            return VerificationResult(
                command=command,
                code=proc.returncode,
                stdout=proc.stdout[-self.output_limit:],
                stderr=proc.stderr[-self.output_limit:],
            ).to_dict()
        except subprocess.TimeoutExpired:
            return VerificationResult(
                command=command,
                code=124,
                stderr=f"Timed out after {self.timeout_seconds} seconds",
            ).to_dict()
