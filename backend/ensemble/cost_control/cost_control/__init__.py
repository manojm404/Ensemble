"""Ensemble Cost Control Components.

This package provides deterministic cost control primitives for the Ensemble platform:
- Input token limiting and truncation
- Execution timeout enforcement
- Budget enforcement with escrow
- Concurrency management with queuing
"""

from .budget_enforcer import BudgetCheckResult, BudgetEnforcer
from .concurrency_manager import ConcurrencyError, ConcurrencyManager
from .input_limiter import InputLimiter, InputResult
from .timeout_manager import ExecutionResult, TimeoutManager

__all__ = [
    "InputLimiter",
    "InputResult",
    "TimeoutManager",
    "ExecutionResult",
    "BudgetEnforcer",
    "BudgetCheckResult",
    "ConcurrencyManager",
    "ConcurrencyError",
]

# Global instances
input_limiter = InputLimiter()
timeout_manager = TimeoutManager()
budget_enforcer = BudgetEnforcer()
concurrency_manager = ConcurrencyManager()
