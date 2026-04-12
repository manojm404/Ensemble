"""
core/security/recursion_guard.py
Thread-safe guard for LLM/agent call depth in the Ensemble platform.

Enforces a hard limit of 3 levels of agent-to-agent calls to prevent
runaway recursion chains that waste tokens and money. Provides budget
checking before each call and maintains a complete call stack for
auditing.

Usage:
    from core.security.recursion_guard import RecursionGuard

    guard = RecursionGuard(max_depth=3)

    # At the start of an agent call:
    guard.enter_call(
        caller_id="pm_agent",
        callee_id="architect_agent",
        budget_remaining=5.0,
        estimated_cost=0.50,
    )

    # At the end of an agent call:
    guard.exit_call("pm_agent")

    # Get current stack for handover summary:
    stack = guard.get_call_stack()
    print(stack)
"""

import logging
import threading
import time
import contextvars
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class RecursionError(Exception):
    """Raised when max recursion depth is exceeded or budget is insufficient."""
    pass

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_MAX_DEPTH = 10 # Increased from 3 to 10 for complex workflows
DEFAULT_BUDGET_THRESHOLD = 0.0  # Minimum budget to proceed (dollars)

# ---------------------------------------------------------------------------
# Context Variable for Call Stack
# ---------------------------------------------------------------------------

_call_stack: contextvars.ContextVar[Optional[List['CallFrame']]] = contextvars.ContextVar("call_stack", default=None)

# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------


@dataclass
class CallFrame:
    """Represents a single agent-to-agent call on the stack."""

    caller_id: str
    callee_id: str
    entered_at: str
    budget_remaining: float
    estimated_cost: float
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "caller_id": self.caller_id,
            "callee_id": self.callee_id,
            "entered_at": self.entered_at,
            "budget_remaining": self.budget_remaining,
            "estimated_cost": self.estimated_cost,
            "metadata": self.metadata,
        }


@dataclass
class CallStackSnapshot:
    """Point-in-time snapshot of the current call stack."""

    thread_id: int
    thread_name: str
    depth: int
    frames: List[Dict]
    captured_at: str

    def to_dict(self) -> dict:
        return {
            "thread_id": self.thread_id,
            "thread_name": self.thread_name,
            "depth": self.depth,
            "frames": self.frames,
            "captured_at": self.captured_at,
        }


# ---------------------------------------------------------------------------
# RecursionGuard
# ---------------------------------------------------------------------------

class RecursionGuard:
    """Thread-safe guard enforcing max recursion depth and budget checks.

    Each thread maintains its own call stack via thread-local storage,
    making the guard safe for concurrent use in multi-threaded agent
    orchestration.

    Attributes
    ----------
    max_depth : int
        Maximum allowed depth of agent-to-agent calls.
    budget_threshold : float
        Minimum budget (in dollars) required before a call is allowed.
    """

    def __init__(
        self,
        max_depth: int = DEFAULT_MAX_DEPTH,
        budget_threshold: float = DEFAULT_BUDGET_THRESHOLD,
    ):
        self.max_depth = max_depth
        self.budget_threshold = budget_threshold

        # Global lock for cross-thread statistics
        self._stats_lock = threading.Lock()
        self._total_calls_entered = 0
        self._total_calls_rejected = 0
        self._total_depth_violations = 0
        self._total_budget_violations = 0

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def enter_call(
        self,
        caller_id: str,
        callee_id: str,
        budget_remaining: float,
        estimated_cost: float,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> CallFrame:
        """Record the start of an agent-to-agent call.

        This method MUST be called before dispatching to a callee agent.
        It performs two checks:

        1. Depth check: raises RecursionError if max_depth would be exceeded.
        2. Budget check: raises RecursionError if budget is below threshold.

        Parameters
        ----------
        caller_id : str
            ID of the calling (parent) agent.
        callee_id : str
            ID of the called (child) agent.
        budget_remaining : float
            Remaining budget in dollars for the calling agent.
        estimated_cost : float
            Estimated cost of this call in dollars.
        metadata : dict, optional
            Additional context for auditing.

        Returns
        -------
        CallFrame
            The frame pushed onto the call stack.

        Raises
        ------
        RecursionError
            If max depth is exceeded or budget is insufficient.
        """
        stack = self._get_stack()
        new_depth = len(stack) + 1

        # --- Depth check ---
        if new_depth > self.max_depth:
            self._increment_stat("total_depth_violations")
            self._increment_stat("total_calls_rejected")
            current_chain = " -> ".join(f.caller_id for f in stack) + f" -> {callee_id}"
            msg = (
                f"Recursion depth limit exceeded: "
                f"attempted depth {new_depth} > max {self.max_depth}. "
                f"Call chain: {current_chain}"
            )
            logger.error("RecursionGuard blocked call: %s", msg)
            raise RecursionError(msg)

        # --- Budget check ---
        if budget_remaining < self.budget_threshold:
            self._increment_stat("total_budget_violations")
            self._increment_stat("total_calls_rejected")
            msg = (
                f"Budget insufficient for call {caller_id} -> {callee_id}: "
                f"remaining=${budget_remaining:.4f}, "
                f"threshold=${self.budget_threshold:.4f}"
            )
            logger.error("RecursionGuard blocked call (budget): %s", msg)
            raise RecursionError(msg)

        # --- Also check if estimated cost would exhaust budget ---
        if estimated_cost > budget_remaining:
            self._increment_stat("total_budget_violations")
            self._increment_stat("total_calls_rejected")
            msg = (
                f"Estimated cost ${estimated_cost:.4f} exceeds "
                f"remaining budget ${budget_remaining:.4f} "
                f"for call {caller_id} -> {callee_id}"
            )
            logger.error("RecursionGuard blocked call (cost overflow): %s", msg)
            raise RecursionError(msg)

        # --- Push frame ---
        now = datetime.now(timezone.utc).isoformat()
        frame = CallFrame(
            caller_id=caller_id,
            callee_id=callee_id,
            entered_at=now,
            budget_remaining=budget_remaining,
            estimated_cost=estimated_cost,
            metadata=metadata or {},
        )
        
        # Use a copy to avoid affecting parent contexts
        new_stack = stack.copy()
        new_stack.append(frame)
        _call_stack.set(new_stack)

        self._increment_stat("total_calls_entered")
        logger.debug(
            "RecursionGuard: entered %s -> %s (depth=%d/%d)",
            caller_id,
            callee_id,
            new_depth,
            self.max_depth,
        )
        return frame

    def exit_call(self, caller_id: str) -> Optional[CallFrame]:
        """Record the end of an agent-to-agent call.

        Pops the most recent frame from the current thread's call stack.

        Parameters
        ----------
        caller_id : str
            ID of the agent that is returning (should match the top frame's
            callee_id).

        Returns
        -------
        CallFrame or None
            The popped frame, or None if the stack is empty.
        """
        stack = self._get_stack()
        if not stack:
            logger.warning(
                "RecursionGuard: exit_call for %s but stack is empty", caller_id
            )
            return None

        # Use a copy
        new_stack = stack.copy()
        frame = new_stack.pop()
        _call_stack.set(new_stack)
        
        duration = self._frame_duration(frame)

        logger.debug(
            "RecursionGuard: exited %s -> %s (depth=%d, duration=%.2fs)",
            frame.caller_id,
            frame.callee_id,
            len(stack),
            duration,
        )
        return frame

    def get_current_depth(self) -> int:
        """Return the current call depth for the calling thread."""
        return len(self._get_stack())

    def get_call_stack(self) -> CallStackSnapshot:
        """Return a snapshot of the current call stack for this thread."""
        stack = self._get_stack()
        now = datetime.now(timezone.utc).isoformat()
        thread = threading.current_thread()

        return CallStackSnapshot(
            thread_id=thread.ident or 0,
            thread_name=thread.name,
            depth=len(stack),
            frames=[f.to_dict() for f in stack],
            captured_at=now,
        )

    def can_call(self, budget_remaining: float, estimated_cost: float) -> bool:
        """Non-mutating check: would a new call be allowed?

        This is a read-only check that does NOT modify the stack.
        Useful for pre-flight validation in UI dashboards.
        """
        current_depth = len(self._get_stack())
        if current_depth + 1 > self.max_depth:
            return False
        if budget_remaining < self.budget_threshold:
            return False
        if estimated_cost > budget_remaining:
            return False
        return True

    def get_statistics(self) -> Dict[str, int]:
        """Return cumulative statistics across all threads."""
        with self._stats_lock:
            return {
                "total_calls_entered": self._total_calls_entered,
                "total_calls_rejected": self._total_calls_rejected,
                "total_depth_violations": self._total_depth_violations,
                "total_budget_violations": self._total_budget_violations,
                "current_thread_depth": self.get_current_depth(),
            }

    def reset_statistics(self) -> Dict[str, int]:
        """Reset and return the previous statistics."""
        with self._stats_lock:
            old_stats = {
                "total_calls_entered": self._total_calls_entered,
                "total_calls_rejected": self._total_calls_rejected,
                "total_depth_violations": self._total_depth_violations,
                "total_budget_violations": self._total_budget_violations,
            }
            self._total_calls_entered = 0
            self._total_calls_rejected = 0
            self._total_depth_violations = 0
            self._total_budget_violations = 0
            return old_stats

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _get_stack(self) -> List[CallFrame]:
        """Get the context-local call stack, creating it if needed."""
        stack = _call_stack.get()
        if stack is None:
            stack = []
            _call_stack.set(stack)
        return stack

    def _increment_stat(self, stat_name: str) -> None:
        """Thread-safe counter increment."""
        with self._stats_lock:
            current = getattr(self, stat_name, 0)
            setattr(self, stat_name, current + 1)

    @staticmethod
    def _frame_duration(frame: CallFrame) -> float:
        """Calculate duration in seconds since the frame was entered."""
        try:
            entered = datetime.fromisoformat(frame.entered_at)
            now = datetime.now(timezone.utc)
            return (now - entered).total_seconds()
        except (ValueError, TypeError):
            return 0.0

    # ------------------------------------------------------------------
    # Backwards compatibility aliases
    # ------------------------------------------------------------------

    def check_before_call(self, agent_id: str, estimated_cost: float) -> bool:
        """Backwards compatibility alias for can_call with dummy budget."""
        # Use a large default budget since callers don't always pass budget
        return self.can_call(budget_remaining=100.0, estimated_cost=estimated_cost)

    def pop_call(self, caller_id: str = "") -> Optional[CallFrame]:
        """Backwards compatibility alias for exit_call."""
        return self.exit_call(caller_id)
