"""
core/tools/registry.py
Central registry for Ensemble tools.
"""
from typing import Dict, Any, Callable
from core.tool_decorator import REGISTERED_TOOLS

TOOL_REGISTRY = REGISTERED_TOOLS

def register_tool(name: str, func: Callable):
    """Registers a new tool in the central registry."""
    TOOL_REGISTRY[name] = func

def get_tool(name: str) -> Optional[Callable]:
    """Retrieves a tool function by name."""
    return TOOL_REGISTRY.get(name)

def list_tools() -> Dict[str, Any]:
    """Returns all registered tool names and their schemas."""
    return {name: getattr(t, "_schema", {}) for name, t in TOOL_REGISTRY.items()}
