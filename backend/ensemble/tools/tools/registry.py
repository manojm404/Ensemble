"""
core/tools/registry.py
Global registry for tools.
"""

from typing import Any, Callable, Dict


class ToolRegistry:
    def __init__(self):
        self.tools: Dict[str, Callable] = {}

    def register(self, name: str, func: Callable):
        self.tools[name] = func

    def get_tool(self, name: str) -> Callable:
        return self.tools.get(name)

    def list_tools(self) -> Dict[str, Any]:
        return {name: getattr(func, "_schema", {}) for name, func in self.tools.items()}


tool_registry = ToolRegistry()
