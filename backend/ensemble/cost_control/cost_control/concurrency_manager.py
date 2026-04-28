"""Concurrency management with per-tier parallel execution limits.

Controls how many agents may run in parallel based on subscription tier.
Excess agents are queued with FIFO ordering and a maximum wait time.
All slot acquisition and release is async-safe.
"""

from __future__ import annotations

import asyncio
import logging
import threading
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Tier configuration
# ---------------------------------------------------------------------------

class Tier(str, Enum):
    FREE = "free"
    PRO = "pro"
    ENTERPRISE = "enterprise"


@dataclass(frozen=True)
class TierLimits:
    max_parallel: int
    max_queue: int
    queue_timeout: float = 30.0


TIER_LIMITS: dict[Tier, TierLimits] = {
    Tier.FREE:        TierLimits(max_parallel=2,  max_queue=10),
    Tier.PRO:         TierLimits(max_parallel=10, max_queue=50),
    Tier.ENTERPRISE:  TierLimits(max_parallel=50, max_queue=200),
}


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class ConcurrencyError(Exception):
    """Raised when concurrency limits prevent execution."""

    def __init__(self, message: str, *, active_count: int = 0, queue_depth: int = 0) -> None:
        super().__init__(message)
        self.active_count = active_count
        self.queue_depth = queue_depth


@dataclass(frozen=True)
class ConcurrencyResult:
    """Result of an acquire attempt."""

    acquired: bool
    active_count: int
    queue_depth: int
    wait_time: float = 0.0
    message: str | None = None


# ---------------------------------------------------------------------------
# ConcurrencyManager
# ---------------------------------------------------------------------------

class ConcurrencyManager:
    """Async-safe concurrency manager with per-tier limits and FIFO queuing.

    Each manager instance is associated with a single *tier*.  Callers
    acquire a slot before starting work and release it when done.  If all
    slots are taken the caller is placed in a FIFO queue; if the queue
    itself is full or the caller waits longer than ``queue_timeout`` a
    ``ConcurrencyError`` is raised.

    Example::

        mgr = ConcurrencyManager(tier=Tier.PRO)

        async with mgr.slot(agent_id="agent-1"):
            ... do work ...

        # or manually:
        acquired = await mgr.acquire("agent-2")
        try:
            ... do work ...
        finally:
            await mgr.release("agent-2")
    """

    def __init__(
        self,
        tier: Tier = Tier.FREE,
        *,
        max_parallel: int | None = None,
        max_queue: int | None = None,
        queue_timeout: float | None = None,
    ) -> None:
        limits = TIER_LIMITS[tier]

        self._tier = tier
        self._max_parallel = max_parallel if max_parallel is not None else limits.max_parallel
        self._max_queue = max_queue if max_queue is not None else limits.max_queue
        self._queue_timeout = queue_timeout if queue_timeout is not None else limits.queue_timeout

        if self._max_parallel < 1:
            raise ValueError("max_parallel must be >= 1")
        if self._max_queue < 0:
            raise ValueError("max_queue must be >= 0")

        # Synchronisation primitives
        self._lock = asyncio.Lock()
        self._semaphore = asyncio.Semaphore(self._max_parallel)

        # State
        self._active: set[str] = set()          # agent_ids currently running
        self._queue: asyncio.Queue[str] = asyncio.Queue()  # FIFO queue of waiting agent_ids
        self._queued: set[str] = set()          # agent_ids currently in the queue
        self._queue_times: dict[str, float] = {}  # agent_id -> enqueue timestamp

        # Metrics
        self._total_acquired = 0
        self._total_rejected = 0
        self._total_released = 0

    # -- public API -----------------------------------------------------------

    async def acquire(self, agent_id: str) -> ConcurrencyResult:
        """Try to acquire an execution slot for *agent_id*.

        If no slot is immediately available the caller is queued.  If the
        queue is full a ``ConcurrencyError`` is raised immediately.  If the
        caller waits longer than ``queue_timeout`` seconds a
        ``ConcurrencyError`` is raised.
        """
        start = time.monotonic()

        async with self._lock:
            # Already active?  Re-entrant not allowed — treat as a bug.
            if agent_id in self._active:
                self._total_rejected += 1
                raise ConcurrencyError(
                    f"Agent '{agent_id}' already holds a slot",
                    active_count=len(self._active),
                    queue_depth=len(self._queued),
                )

            # Already queued?
            if agent_id in self._queued:
                self._total_rejected += 1
                raise ConcurrencyError(
                    f"Agent '{agent_id}' is already in the queue",
                    active_count=len(self._active),
                    queue_depth=len(self._queued),
                )

            # Fast path: semaphore available right now.
            if self._semaphore.locked():
                # All slots taken — must queue.
                if len(self._queued) >= self._max_queue:
                    self._total_rejected += 1
                    raise ConcurrencyError(
                        f"Queue is full ({self._max_queue} waiting). "
                        f"Tier '{self._tier.value}' allows {self._max_parallel} parallel agents.",
                        active_count=len(self._active),
                        queue_depth=len(self._queued),
                    )
            else:
                # At least one slot is free — take it immediately.
                await self._semaphore.acquire()
                self._active.add(agent_id)
                self._total_acquired += 1
                return ConcurrencyResult(
                    acquired=True,
                    active_count=len(self._active),
                    queue_depth=len(self._queued),
                    wait_time=0.0,
                )

        # Slow path: wait in the queue.
        self._queued.add(agent_id)
        self._queue_times[agent_id] = time.monotonic()
        await self._queue.put(agent_id)

        try:
            # Wait for a slot, with timeout.
            remaining = self._queue_timeout
            while True:
                elapsed = time.monotonic() - self._queue_times.get(agent_id, start)
                remaining = self._queue_timeout - elapsed
                if remaining <= 0:
                    raise ConcurrencyError(
                        f"Agent '{agent_id}' waited too long in queue "
                        f"({elapsed:.1f}s > {self._queue_timeout:.1f}s). "
                        f"Tier '{self._tier.value}' limit: {self._max_parallel} parallel.",
                        active_count=len(self._active),
                        queue_depth=len(self._queued),
                    )

                try:
                    await asyncio.wait_for(
                        self._semaphore.acquire(),
                        timeout=min(remaining, 1.0),  # poll in small increments
                    )
                    break  # got a slot
                except asyncio.TimeoutError:
                    # Check if we were removed from the queue (e.g. cancelled).
                    if agent_id not in self._queued:
                        raise ConcurrencyError(
                            f"Agent '{agent_id}' was removed from the queue",
                            active_count=len(self._active),
                            queue_depth=len(self._queued),
                        )
                    # Loop again — maybe a slot opened up.

        finally:
            # Clean up queue bookkeeping.
            self._queued.discard(agent_id)
            self._queue_times.pop(agent_id, None)
            # Drain this agent's entry from the queue (may have been consumed
            # by the acquire above if we're the head).
            # We do NOT drain from the queue here because the semaphore
            # acquire already removed one slot.  The queue entry is just
            # bookkeeping.

        wait_time = time.monotonic() - start
        async with self._lock:
            self._active.add(agent_id)
            self._total_acquired += 1

        return ConcurrencyResult(
            acquired=True,
            active_count=len(self._active),
            queue_depth=len(self._queued),
            wait_time=wait_time,
            message=f"Acquired after {wait_time:.2f}s wait",
        )

    async def release(self, agent_id: str) -> ConcurrencyResult:
        """Release the slot held by *agent_id*."""
        async with self._lock:
            if agent_id not in self._active:
                return ConcurrencyResult(
                    acquired=False,
                    active_count=len(self._active),
                    queue_depth=len(self._queued),
                    message=f"Agent '{agent_id}' does not hold a slot",
                )

            self._active.discard(agent_id)
            self._total_released += 1
            self._semaphore.release()

            return ConcurrencyResult(
                acquired=False,
                active_count=len(self._active),
                queue_depth=len(self._queued),
            )

    # -- context manager ------------------------------------------------------

    class _SlotContext:
        """Async context manager returned by :meth:`slot`."""

        def __init__(self, mgr: "ConcurrencyManager", agent_id: str) -> None:
            self._mgr = mgr
            self._agent_id = agent_id
            self.result: ConcurrencyResult | None = None

        async def __aenter__(self) -> ConcurrencyResult:
            self.result = await self._mgr.acquire(self._agent_id)
            return self.result

        async def __aexit__(self, *_: Any) -> None:
            await self._mgr.release(self._agent_id)

    def slot(self, agent_id: str) -> _SlotContext:
        """Return an async context manager for a named slot.

        Example::

            async with mgr.slot("agent-1"):
                ... work ...
        """
        return self._SlotContext(self, agent_id)

    # -- metrics / introspection ---------------------------------------------

    @property
    def active_count(self) -> int:
        """Number of agents currently executing."""
        return len(self._active)

    @property
    def queue_depth(self) -> int:
        """Number of agents waiting in the queue."""
        return len(self._queued)

    @property
    def available_slots(self) -> int:
        """Slots still available for immediate acquisition."""
        return self._max_parallel - len(self._active)

    @property
    def tier(self) -> Tier:
        return self._tier

    @property
    def limits(self) -> TierLimits:
        return TierLimits(
            max_parallel=self._max_parallel,
            max_queue=self._max_queue,
            queue_timeout=self._queue_timeout,
        )

    def stats(self) -> dict[str, Any]:
        """Return a snapshot of manager metrics."""
        return {
            "tier": self._tier.value,
            "active_count": len(self._active),
            "queue_depth": len(self._queued),
            "max_parallel": self._max_parallel,
            "max_queue": self._max_queue,
            "queue_timeout": self._queue_timeout,
            "total_acquired": self._total_acquired,
            "total_released": self._total_released,
            "total_rejected": self._total_rejected,
            "available_slots": self.available_slots,
        }

    def reset(self) -> None:
        """Clear all state.  Useful for tests.

        WARNING: Do not call while agents are actively using slots.
        """
        self._active.clear()
        self._queued.clear()
        self._queue_times.clear()
        # Rebuild the semaphore and queue — the old ones may have waiters.
        self._semaphore = asyncio.Semaphore(self._max_parallel)
        self._queue = asyncio.Queue()
        self._total_acquired = 0
        self._total_rejected = 0
        self._total_released = 0

    def __repr__(self) -> str:
        return (
            f"ConcurrencyManager(tier={self._tier.value}, "
            f"active={len(self._active)}, queued={len(self._queued)}, "
            f"max_parallel={self._max_parallel})"
        )
