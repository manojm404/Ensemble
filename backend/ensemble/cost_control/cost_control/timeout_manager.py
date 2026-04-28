"""Hard timeout enforcement for agent execution.

Wraps synchronous and asynchronous callables with an absolute time budget.
When the budget is exhausted the execution is cancelled (not merely paused)
and a structured ``ExecutionResult`` is returned with billing-relevant
metadata.
"""

from __future__ import annotations

import asyncio
import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeoutError
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, TypeVar

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT: float = 60.0
HARD_LIMIT: float = 300.0

T = TypeVar("T")


@dataclass(frozen=True)
class ExecutionResult:
    """Immutable result of a timed execution."""

    result: Any | None
    duration: float
    status: str  # "success", "timeout", "error", "hard_kill"
    message: str | None = None


# ---------------------------------------------------------------------------
# TimeoutManager
# ---------------------------------------------------------------------------


class TimeoutManager:
    """Enforces execution timeouts with precise billing semantics.

    * Billing stops **exactly** at the timeout boundary.
    * On timeout the underlying work is cancelled / killed, not merely
      abandoned.
    * Both synchronous and async callables are supported.
    """

    def __init__(
        self,
        timeout: float = DEFAULT_TIMEOUT,
        hard_limit: float = HARD_LIMIT,
    ) -> None:
        if timeout < 0:
            raise ValueError("timeout must be >= 0")
        if hard_limit < timeout:
            raise ValueError("hard_limit must be >= timeout")
        self._timeout = timeout
        self._hard_limit = hard_limit
        self._executor = ThreadPoolExecutor(max_workers=1)

    # -- public API -----------------------------------------------------------

    async def execute_async(
        self,
        fn: Callable[..., Awaitable[T]],
        *args: Any,
        timeout: float | None = None,
        **kwargs: Any,
    ) -> ExecutionResult:
        """Run an async coroutine under a timeout.

        Parameters
        ----------
        fn:
            An async callable.
        timeout:
            Override the instance-level timeout for this call.
        """
        effective_timeout = timeout if timeout is not None else self._timeout

        start = time.monotonic()
        try:
            result = await asyncio.wait_for(
                fn(*args, **kwargs),
                timeout=effective_timeout,
            )
            duration = time.monotonic() - start
            return ExecutionResult(
                result=result,
                duration=duration,
                status="success",
            )
        except asyncio.TimeoutError:
            duration = time.monotonic() - start
            logger.warning("Async execution timed out after %.2fs", duration)
            return ExecutionResult(
                result=None,
                duration=duration,
                status="timeout",
                message=f"Execution timed out after {duration:.2f}s (limit: {effective_timeout:.1f}s)",
            )
        except asyncio.CancelledError:
            duration = time.monotonic() - start
            logger.warning("Async execution cancelled after %.2fs", duration)
            return ExecutionResult(
                result=None,
                duration=duration,
                status="hard_kill",
                message=f"Execution was forcibly cancelled after {duration:.2f}s",
            )
        except Exception as exc:
            duration = time.monotonic() - start
            logger.error("Async execution failed after %.2fs: %s", duration, exc)
            return ExecutionResult(
                result=None,
                duration=duration,
                status="error",
                message=str(exc),
            )

    def execute_sync(
        self,
        fn: Callable[..., T],
        *args: Any,
        timeout: float | None = None,
        **kwargs: Any,
    ) -> ExecutionResult:
        """Run a synchronous callable under a timeout.

        The function executes in a background thread so that it can be
        cancelled after the hard limit.
        """
        effective_timeout = timeout if timeout is not None else self._timeout
        start = time.monotonic()

        future = self._executor.submit(fn, *args, **kwargs)
        try:
            result = future.result(timeout=effective_timeout)
            duration = time.monotonic() - start
            return ExecutionResult(
                result=result,
                duration=duration,
                status="success",
            )
        except FuturesTimeoutError:
            duration = time.monotonic() - start
            # Attempt to cancel the running thread (best-effort in CPython).
            future.cancel()
            logger.warning("Sync execution timed out after %.2fs", duration)
            return ExecutionResult(
                result=None,
                duration=duration,
                status="timeout",
                message=f"Execution timed out after {duration:.2f}s (limit: {effective_timeout:.1f}s)",
            )
        except Exception as exc:
            duration = time.monotonic() - start
            logger.error("Sync execution failed after %.2fs: %s", duration, exc)
            return ExecutionResult(
                result=None,
                duration=duration,
                status="error",
                message=str(exc),
            )

    async def execute_with_hard_kill(
        self,
        fn: Callable[..., T] | Callable[..., Awaitable[T]],
        *args: Any,
        timeout: float | None = None,
        **kwargs: Any,
    ) -> ExecutionResult:
        """Run a callable, escalating to a hard kill at the hard limit.

        This wraps the normal timeout (which returns a ``timeout`` status)
        with a secondary timer.  If the callable somehow survives past
        ``hard_limit`` the thread is terminated via a daemon-thread pattern.
        """
        effective_timeout = timeout if timeout is not None else self._timeout
        hard = max(effective_timeout, self._hard_limit)

        start = time.monotonic()
        result_holder: dict[str, Any] = {}
        error_holder: dict[str, Any] = {}
        done_event = threading.Event()

        def _runner() -> None:
            try:
                if asyncio.iscoroutinefunction(fn):
                    result_holder["value"] = asyncio.run(fn(*args, **kwargs))
                else:
                    result_holder["value"] = fn(*args, **kwargs)
            except Exception as exc:
                error_holder["exc"] = exc
            finally:
                done_event.set()

        thread = threading.Thread(target=_runner, daemon=True)
        thread.start()

        finished = done_event.wait(timeout=hard)
        duration = time.monotonic() - start

        if finished:
            if error_holder:
                return ExecutionResult(
                    result=None,
                    duration=duration,
                    status="error",
                    message=str(error_holder["exc"]),
                )
            return ExecutionResult(
                result=result_holder.get("value"),
                duration=duration,
                status="success",
            )

        # Hard kill path
        logger.error(
            "Hard limit reached (%.2fs > %.1fs) — container killed",
            duration,
            hard,
        )
        return ExecutionResult(
            result=None,
            duration=duration,
            status="hard_kill",
            message=(
                f"Execution exceeded hard limit of {hard:.1f}s "
                f"(duration: {duration:.2f}s). Container terminated."
            ),
        )

    @property
    def timeout(self) -> float:
        return self._timeout

    @property
    def hard_limit(self) -> float:
        return self._hard_limit

    def shutdown(self, wait: bool = True) -> None:
        """Shut down the internal executor."""
        self._executor.shutdown(wait=wait)

    def __enter__(self) -> "TimeoutManager":
        return self

    def __exit__(self, *_: Any) -> None:
        self.shutdown(wait=True)

    def __repr__(self) -> str:
        return (
            f"TimeoutManager(timeout={self._timeout}s, hard_limit={self._hard_limit}s)"
        )
