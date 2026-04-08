"""
core/settings.py - Settings management for Ensemble

Handles persistence of provider/model configuration in data/settings.json.
Provides thread-safe read/write access and LLM reinitialization.

Security: API keys are NEVER stored here - they remain in .env only.
"""

import json
import os
import threading
from typing import Dict, Any, Optional
from pathlib import Path

SETTINGS_FILE = "data/settings.json"
_lock = threading.Lock()

# In-memory cache to avoid disk I/O on every request
_active_config: Dict[str, Any] = {}


def _ensure_settings_file():
    """Create data/settings.json with defaults if it doesn't exist."""
    os.makedirs("data", exist_ok=True)
    if not os.path.exists(SETTINGS_FILE):
        defaults = {
            "provider": "gemini",
            "model": "gemini-2.5-flash",
            "base_url": None
        }
        with open(SETTINGS_FILE, "w") as f:
            json.dump(defaults, f, indent=2)
        return defaults
    return None


def load_settings() -> Dict[str, Any]:
    """Read settings from data/settings.json (thread-safe, cached)."""
    global _active_config
    
    with _lock:
        if not _active_config:
            _ensure_settings_file()
            try:
                with open(SETTINGS_FILE, "r") as f:
                    _active_config = json.load(f)
            except (json.JSONDecodeError, FileNotFoundError):
                _ensure_settings_file()
                with open(SETTINGS_FILE, "r") as f:
                    _active_config = json.load(f)
        
        return _active_config.copy()


def save_settings(settings: Dict[str, Any]) -> Dict[str, Any]:
    """Write settings to data/settings.json (thread-safe)."""
    global _active_config
    
    with _lock:
        # Validate required fields
        if "provider" not in settings:
            raise ValueError("provider is required")
        if "model" not in settings:
            raise ValueError("model is required")
        
        _active_config = {
            "provider": settings["provider"],
            "model": settings["model"],
            "base_url": settings.get("base_url")
        }
        
        os.makedirs("data", exist_ok=True)
        with open(SETTINGS_FILE, "w") as f:
            json.dump(_active_config, f, indent=2)
        
        return _active_config.copy()


def get_active_provider() -> Dict[str, Any]:
    """Return current provider config (NEVER includes API keys)."""
    settings = load_settings()
    return {
        "provider": settings.get("provider", "gemini"),
        "model": settings.get("model", "gemini-2.5-flash"),
        "base_url": settings.get("base_url")
    }


def switch_provider(provider: str, model: str, base_url: Optional[str] = None, llm_instance=None) -> Dict[str, Any]:
    """
    Switch the active provider and optionally reinitialize the LLM client.
    
    Args:
        provider: "gemini", "ollama", "openai", etc.
        model: Model name/ID
        base_url: Optional base URL for local LLMs (e.g., http://localhost:11434/v1)
        llm_instance: Optional LLMProvider instance to reinitialize
    
    Returns:
        Updated settings dict
    """
    settings = save_settings({
        "provider": provider,
        "model": model,
        "base_url": base_url
    })
    
    # Reinitialize LLM if instance provided
    if llm_instance:
        try:
            llm_instance.reinitialize(
                provider=provider,
                model=model,
                base_url=base_url
            )
            print(f"✅ [Settings] LLM switched to {provider}/{model}", flush=True)
        except Exception as e:
            print(f"❌ [Settings] LLM reinitialization failed: {e}", flush=True)
            # Still save the settings even if reinit fails
            raise
    
    return settings


async def test_llm_connection(llm_instance) -> Dict[str, Any]:
    """
    Send a simple test message to the current LLM and verify response.
    
    Returns:
        { "success": bool, "message": str, "response_time_ms": int }
    """
    import time
    
    settings = load_settings()
    provider = settings.get("provider", "gemini")
    model = settings.get("model", "gemini-2.5-flash")
    
    try:
        start = time.time()
        
        # Send a simple test message
        result = await llm_instance.chat(
            messages=[{"role": "user", "content": "Say 'Connection test successful' in 3 words or less."}],
            agent_name="Ensemble Connection Test"
        )
        
        elapsed_ms = int((time.time() - start) * 1000)
        response_text = result.get("text", "")
        
        if response_text and "error" not in response_text.lower():
            return {
                "success": True,
                "message": f"Successfully connected to {provider}/{model}",
                "response_time_ms": elapsed_ms,
                "response_preview": response_text[:100]
            }
        else:
            return {
                "success": False,
                "message": f"LLM returned error response: {response_text}",
                "response_time_ms": elapsed_ms
            }
    
    except Exception as e:
        return {
            "success": False,
            "message": f"Connection failed: {str(e)}",
            "response_time_ms": 0
        }


def initialize_llm_from_settings(llm_instance=None):
    """
    Load settings and initialize the LLM client at startup.
    Should be called once during app initialization.
    """
    settings = load_settings()
    provider = settings.get("provider", "gemini")
    model = settings.get("model", "gemini-2.5-flash")
    base_url = settings.get("base_url")
    
    print(f"🚀 [Settings] Initializing LLM: {provider}/{model}", flush=True)
    
    if llm_instance:
        llm_instance.reinitialize(
            provider=provider,
            model=model,
            base_url=base_url
        )
    
    return settings
