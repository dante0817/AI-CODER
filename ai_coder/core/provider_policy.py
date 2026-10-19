from __future__ import annotations


def manual_only_provider_eligible(requested_provider: str, provider_name: str, connected: bool) -> bool:
    """Return True only when the user explicitly selected a connected manual-only provider."""
    return bool(connected) and str(requested_provider or "auto") == str(provider_name or "")
