"""
core/settings.py - Settings Management for 0101 (Phase 3: Multi-Tenant)

Handles per-user settings stored in Supabase `user_settings` table.
Falls back to local JSON file for single-user mode (no Supabase).

Usage:
    from core.settings import get_user_settings, save_user_settings

    # Get settings for a specific user
    settings = get_user_settings(user_id="user-uuid")

    # Save settings
    save_user_settings(user_id="user-uuid", settings={"provider": "openai", ...})
"""

import json
import logging
import os
import threading
import uuid
import math
from typing import Dict, Any, Optional
from pathlib import Path

logger = logging.getLogger(__name__)

# Local fallback (single-user mode)
SETTINGS_FILE = "data/settings.json"
_local_config: Dict[str, Any] = {}
_lock = threading.Lock()


def _default_settings() -> Dict[str, Any]:
    return {
        "provider": "gemini",
        "model": "gemini-2.5-flash",
        "base_url": None,
        "approval_cost_threshold": 0.0001,
        "approval_timeout_seconds": 300,
        "theme": "dark",
    }


def _is_persistable_user_id(user_id: Optional[str]) -> bool:
    """Return True when the user_id looks like a real auth profile UUID."""
    if not user_id:
        return False
    try:
        uuid.UUID(str(user_id))
        return True
    except (TypeError, ValueError):
        return False


def _merge_settings(existing: Dict[str, Any], updates: Dict[str, Any]) -> Dict[str, Any]:
    merged = {**_default_settings(), **(existing or {})}
    for key, value in (updates or {}).items():
        if value is not None and value != "":
            merged[key] = value
    return merged


def validate_user_settings_update(updates: Dict[str, Any]) -> Dict[str, Any]:
    """Validate mutable account settings before they are persisted."""
    cleaned = dict(updates or {})

    if "approval_cost_threshold" in cleaned and cleaned["approval_cost_threshold"] not in (None, ""):
        try:
            threshold = float(cleaned["approval_cost_threshold"])
        except (TypeError, ValueError):
            raise ValueError("Approval threshold must be a number greater than or equal to 0.")
        if not math.isfinite(threshold) or threshold < 0:
            raise ValueError("Approval threshold must be a number greater than or equal to 0.")
        cleaned["approval_cost_threshold"] = threshold

    if "approval_timeout_seconds" in cleaned and cleaned["approval_timeout_seconds"] not in (None, ""):
        try:
            timeout = int(cleaned["approval_timeout_seconds"])
        except (TypeError, ValueError):
            raise ValueError("Approval timeout must be a whole number between 30 and 86400 seconds.")
        if timeout < 30 or timeout > 86400:
            raise ValueError("Approval timeout must be between 30 seconds and 86400 seconds.")
        cleaned["approval_timeout_seconds"] = timeout

    if "theme" in cleaned and cleaned["theme"] not in (None, ""):
        if cleaned["theme"] not in {"dark", "light", "system"}:
            raise ValueError("Theme must be dark, light, or system.")

    return cleaned


def _use_supabase() -> bool:
    """Check if Supabase is configured for multi-tenant mode."""
    return bool(os.getenv("SUPABASE_URL"))


# ============================================================
# Local Fallback (Single-User Mode)
# ============================================================

def _ensure_settings_file():
    """Create data/settings.json with defaults if it doesn't exist."""
    os.makedirs("data", exist_ok=True)
    if not os.path.exists(SETTINGS_FILE):
        defaults = _default_settings()
        with open(SETTINGS_FILE, "w") as f:
            json.dump(defaults, f, indent=2)
        return defaults
    return None


def _load_local_settings() -> Dict[str, Any]:
    """Read settings from local JSON file (thread-safe, cached)."""
    global _local_config
    with _lock:
        if not _local_config:
            _ensure_settings_file()
            try:
                with open(SETTINGS_FILE, "r") as f:
                    _local_config = _merge_settings({}, json.load(f))
            except (json.JSONDecodeError, FileNotFoundError):
                _ensure_settings_file()
                with open(SETTINGS_FILE, "r") as f:
                    _local_config = _merge_settings({}, json.load(f))
        return _local_config.copy()


def _save_local_settings(settings: Dict[str, Any]) -> Dict[str, Any]:
    """Write settings to local JSON file (thread-safe)."""
    global _local_config
    settings = validate_user_settings_update(settings)
    current = _load_local_settings() if not _local_config else _local_config.copy()
    with _lock:
        _local_config = _merge_settings(current, settings)
        os.makedirs("data", exist_ok=True)
        with open(SETTINGS_FILE, "w") as f:
            json.dump(_local_config, f, indent=2)
        return _local_config.copy()


# ============================================================
# Supabase Settings (Multi-Tenant Mode)
# ============================================================

def get_user_settings(user_id: str) -> Dict[str, Any]:
    """
    Get settings for a specific user.
    Falls back to local settings if Supabase is not configured.
    """
    if not _use_supabase() or not _is_persistable_user_id(user_id):
        return _load_local_settings()

    try:
        from core.supabase_client import supabase_admin

        result = supabase_admin.query("user_settings", "select", columns="*", eq="user_id", eq_value=user_id)

        if result.data:
            row = result.data[0]
            return _merge_settings(_default_settings(), {
                "provider": row.get("default_llm_provider", "gemini"),
                "model": row.get("default_model", "gemini-2.5-flash"),
                "base_url": row.get("base_url"),
                "approval_cost_threshold": row.get("approval_cost_threshold", 0.0001),
                "approval_timeout_seconds": row.get("approval_timeout_seconds", 300),
                "theme": row.get("theme", "dark"),
            })
        # No settings yet — return defaults
        return _default_settings()

    except Exception as e:
        logger.warning("⚠️ [Settings] Failed to fetch user settings from Supabase: %s — using defaults", e)
        return _default_settings()


def save_user_settings(user_id: str, settings: Dict[str, Any]) -> Dict[str, Any]:
    """
    Save settings for a specific user.
    Falls back to local settings if Supabase is not configured.
    """
    settings = validate_user_settings_update(settings)

    if not _use_supabase() or not _is_persistable_user_id(user_id):
        return _save_local_settings(settings)

    try:
        from core.supabase_client import supabase_admin

        current = get_user_settings(user_id)
        merged = _merge_settings(current, settings)
        db_settings = {
            "user_id": user_id,
            "default_llm_provider": merged.get("provider", "gemini"),
            "default_model": merged.get("model", "gemini-2.5-flash"),
            "base_url": merged.get("base_url"),
            "approval_cost_threshold": merged.get("approval_cost_threshold", 0.0001),
            "approval_timeout_seconds": merged.get("approval_timeout_seconds", 300),
            "theme": merged.get("theme", "dark"),
        }

        result = supabase_admin.query("user_settings", "upsert", data=db_settings, on_conflict="user_id")

        if result.data:
            row = result.data[0]
            return {
                "provider": row.get("default_llm_provider", "gemini"),
                "model": row.get("default_model", "gemini-2.5-flash"),
                "base_url": row.get("base_url"),
                "approval_cost_threshold": row.get("approval_cost_threshold", 0.0001),
                "approval_timeout_seconds": row.get("approval_timeout_seconds", 300),
                "theme": row.get("theme", "dark"),
            }

        return merged

    except Exception as e:
        logger.warning("⚠️ [Settings] Failed to save user settings to Supabase: %s — returning merged in-memory settings", e)
        return merged


# ============================================================
# Legacy API (backward compatible)
# ============================================================

def load_settings() -> Dict[str, Any]:
    """Read settings (legacy API — reads local config)."""
    return _load_local_settings()


def save_settings(settings: Dict[str, Any]) -> Dict[str, Any]:
    """Write settings (legacy API — writes local config)."""
    return _save_local_settings(settings)


def get_active_provider(user_id: Optional[str] = None) -> Dict[str, Any]:
    """Return current provider config (NEVER includes API keys)."""
    settings = get_user_settings(user_id) if user_id else _load_local_settings()
    return {
        "provider": settings.get("provider", "gemini"),
        "model": settings.get("model", "gemini-2.5-flash"),
        "base_url": settings.get("base_url"),
    }


def switch_provider(provider: str, model: str, base_url: Optional[str] = None, llm_instance=None, user_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Switch the active provider and optionally reinitialize the LLM client.
    (Legacy API — writes to local config.)
    """
    if user_id and _is_persistable_user_id(user_id):
        settings = save_user_settings(user_id, {
            "provider": provider,
            "model": model,
            "base_url": base_url,
        })
    else:
        settings = _save_local_settings({
            "provider": provider,
            "model": model,
            "base_url": base_url,
        })

    if llm_instance and not user_id:
        try:
            llm_instance.reinitialize(provider=provider, model=model, base_url=base_url)
            logger.info("✅ [Settings] LLM switched to %s/%s", provider, model)
        except Exception as e:
            logger.error("❌ [Settings] LLM reinitialization failed: %s", e)
            raise

    return settings


async def test_llm_connection(
    llm_instance,
    provider: Optional[str] = None,
    model: Optional[str] = None,
    base_url: Optional[str] = None,
) -> Dict[str, Any]:
    """Send a simple test message to the current LLM and verify response."""
    import time
    settings = _load_local_settings()
    provider = provider or settings.get("provider", "gemini")
    model = model or settings.get("model", "gemini-2.5-flash")
    base_url = base_url or settings.get("base_url")
    original = get_active_provider()

    try:
        start = time.time()
        if any([provider, model, base_url]):
            llm_instance.reinitialize(provider=provider, model=model, base_url=base_url)
        result = await llm_instance.chat(
            messages=[{"role": "user", "content": "Say 'Connection test successful' in 3 words or less."}],
            agent_name="0101 Connection Test",
        )
        elapsed_ms = int((time.time() - start) * 1000)
        response_text = result.get("text", "")

        if response_text and "error" not in response_text.lower():
            return {
                "success": True,
                "message": f"Successfully connected to {provider}/{model}",
                "response_time_ms": elapsed_ms,
                "response_preview": response_text[:100],
            }
        else:
            return {
                "success": False,
                "message": f"LLM returned error response: {response_text}",
                "response_time_ms": elapsed_ms,
            }
    except Exception as e:
        return {
            "success": False,
            "message": f"Connection failed: {str(e)}",
            "response_time_ms": 0,
        }
    finally:
        try:
            llm_instance.reinitialize(
                provider=original.get("provider"),
                model=original.get("model"),
                base_url=original.get("base_url"),
            )
        except Exception:
            pass


def initialize_llm_from_settings(llm_instance=None):
    """Load settings and initialize the LLM client at startup."""
    settings = _load_local_settings()
    provider = settings.get("provider", "gemini")
    model = settings.get("model", "gemini-2.5-flash")
    base_url = settings.get("base_url")

    logger.info("🚀 [Settings] Initializing LLM: %s/%s", provider, model)

    if llm_instance:
        llm_instance.reinitialize(provider=provider, model=model, base_url=base_url)

    return settings
