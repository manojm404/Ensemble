"""Shared marketplace guardrails for pack discovery and sync."""

from __future__ import annotations

from typing import Any, Dict, Iterable, List

BLOCKED_PACK_IDS = {"china-market-pack"}


def is_blocked_pack(pack_id: str | None) -> bool:
    """Return True when a pack should never surface in marketplace flows."""
    return bool(pack_id and pack_id in BLOCKED_PACK_IDS)


def filter_blocked_packs(packs: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Remove blocked packs from a pack collection."""
    return [pack for pack in packs if not is_blocked_pack(pack.get("id"))]


def sanitize_manifest_data(data: Dict[str, Any]) -> Dict[str, Any]:
    """Return a copy of marketplace manifest data without blocked packs."""
    sanitized = dict(data)
    packs = sanitized.get("packs", [])
    if isinstance(packs, list):
        sanitized["packs"] = filter_blocked_packs(packs)
    return sanitized
