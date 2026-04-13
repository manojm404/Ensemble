"""
core/settings.py - Settings Management for Ensemble (Phase 3: Multi-Tenant)

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
from typing import Dict, Any, Optional
from pathlib import Path

logger = logging.getLogger(__name__)

# Local fallback (single-user mode)
SETTINGS_FILE = "data/settings.json"
_local_config: Dict[str, Any] = {}
_lock = threading.Lock()


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
        defaults = {
            "provider": "gemini",
            "model": "gemini-2.5-flash",
            "base_url": None,
        }
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
                    _local_config = json.load(f)
            except (json.JSONDecodeError, FileNotFoundError):
                _ensure_settings_file()
                with open(SETTINGS_FILE, "r") as f:
                    _local_config = json.load(f)
        return _local_config.copy()


def _save_local_settings(settings: Dict[str, Any]) -> Dict[str, Any]:
    """Write settings to local JSON file (thread-safe)."""
    global _local_config
    with _lock:
        if "provider" not in settings:
            raise ValueError("provider is required")
        if "model" not in settings:
            raise ValueError("model is required")

        _local_config = {
            "provider": settings["provider"],
            "model": settings["model"],
            "base_url": settings.get("base_url"),
        }
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
    if not _use_supabase() or not user_id:
        return _load_local_settings()

    try:
        from core.supabase_client import supabase_admin

        result = supabase_admin.query("user_settings", "select", columns="*", eq="user_id", eq_value=user_id)

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
        else:
            # No settings yet — return defaults
            return {
                "provider": "gemini",
                "model": "gemini-2.5-flash",
                "base_url": None,
                "approval_cost_threshold": 0.0001,
                "approval_timeout_seconds": 300,
                "theme": "dark",
            }

    except Exception as e:
        logger.warning("⚠️ [Settings] Failed to fetch user settings from Supabase: %s — using local fallback", e)
        return _load_local_settings()


def save_user_settings(user_id: str, settings: Dict[str, Any]) -> Dict[str, Any]:
    """
    Save settings for a specific user.
    Falls back to local settings if Supabase is not configured.
    """
    if not _use_supabase() or not user_id:
        return _save_local_settings(settings)

    try:
        from core.supabase_client import supabase_admin

        db_settings = {
            "user_id": user_id,
            "default_llm_provider": settings.get("provider", "gemini"),
            "default_model": settings.get("model", "gemini-2.5-flash"),
            "base_url": settings.get("base_url"),
            "approval_cost_threshold": settings.get("approval_cost_threshold", 0.0001),
            "approval_timeout_seconds": settings.get("approval_timeout_seconds", 300),
            "theme": settings.get("theme", "dark"),
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

        return settings

    except Exception as e:
        logger.warning("⚠️ [Settings] Failed to save user settings to Supabase: %s — using local fallback", e)
        return _save_local_settings(settings)


# ============================================================
# Legacy API (backward compatible)
# ============================================================

def load_settings() -> Dict[str, Any]:
    """Read settings (legacy API — reads local config)."""
    return _load_local_settings()


def save_settings(settings: Dict[str, Any]) -> Dict[str, Any]:
    """Write settings (legacy API — writes local config)."""
    return _save_local_settings(settings)


def get_active_provider() -> Dict[str, Any]:
    """Return current provider config (NEVER includes API keys)."""
    settings = _load_local_settings()
    return {
        "provider": settings.get("provider", "gemini"),
        "model": settings.get("model", "gemini-2.5-flash"),
        "base_url": settings.get("base_url"),
    }


def switch_provider(provider: str, model: str, base_url: Optional[str] = None, llm_instance=None) -> Dict[str, Any]:
    """
    Switch the active provider and optionally reinitialize the LLM client.
    (Legacy API — writes to local config.)
    """
    settings = _save_local_settings({
        "provider": provider,
        "model": model,
        "base_url": base_url,
    })

    if llm_instance:
        try:
            llm_instance.reinitialize(provider=provider, model=model, base_url=base_url)
            logger.info("✅ [Settings] LLM switched to %s/%s", provider, model)
        except Exception as e:
            logger.error("❌ [Settings] LLM reinitialization failed: %s", e)
            raise

    return settings


async def test_llm_connection(llm_instance) -> Dict[str, Any]:
    """Send a simple test message to the current LLM and verify response."""
    import time
    settings = _load_local_settings()
    provider = settings.get("provider", "gemini")
    model = settings.get("model", "gemini-2.5-flash")

    try:
        start = time.time()
        result = await llm_instance.chat(
            messages=[{"role": "user", "content": "Say 'Connection test successful' in 3 words or less."}],
            agent_name="Ensemble Connection Test",
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
