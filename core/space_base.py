"""
core/space_base.py
Shared message bus and space for agent communication.
Written from scratch.
"""
from typing import List, Dict, Any, Callable, Optional
import json

class Space:
    """Shared message bus for agents to publish and subscribe to messages."""

    def __init__(self):
        self._subscribers: Dict[str, List[Callable]] = {}
        self._history: List[Dict[str, Any]] = []

    def subscribe(self, topic: str, callback: Callable):
        """Subscribe to a specific topic."""
        if topic not in self._subscribers:
            self._subscribers[topic] = []
        self._subscribers[topic].append(callback)

    def publish(self, topic: str, message: Any):
        """Publish a message to a topic."""
        record = {
            "topic": topic,
            "message": message
        }
        self._history.append(record)
        if topic in self._subscribers:
            for callback in self._subscribers[topic]:
                callback(message)

    def get_history(self, topic: Optional[str] = None) -> List[Dict[str, Any]]:
        """Retrieve history, optionally filtered by topic."""
        if topic:
            return [m for m in self._history if m["topic"] == topic]
        return list(self._history)
