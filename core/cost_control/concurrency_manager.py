# Compatibility shim re-exporting concurrency manager
from backend.ensemble.cost_control.cost_control import ConcurrencyManager, ConcurrencyError, concurrency_manager

__all__ = ["ConcurrencyManager", "ConcurrencyError", "concurrency_manager"]
