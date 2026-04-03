"""
core/agent_base.py
Base Agent class for Ensemble.
Written from scratch.
"""
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from core.conversation_memory import ConversationBufferMemory

class Agent(ABC):
    """Abstract base class for all agents."""

    def __init__(self, name: str, system_prompt: str, tools: Optional[List[Any]] = None):
        self.name = name
        self.system_prompt = system_prompt
        self.memory = ConversationBufferMemory()
        self.tools = tools or []
        self.memory.add_message("system", system_prompt)

    @abstractmethod
    def run(self, user_input: str) -> str:
        """Run the agent with the given input."""
        pass

    def add_tool(self, tool_func: Any):
        """Add a tool to the agent's toolkit."""
        self.tools.append(tool_func)

    def get_tool_schemas(self) -> List[Dict[str, Any]]:
        """Return the schemas for all tools assigned to this agent."""
        return [getattr(t, "_schema", {}) for t in self.tools if hasattr(t, "_is_tool")]
