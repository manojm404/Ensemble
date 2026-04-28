# Compatibility shim re-exporting input_limiter implementation
from backend.ensemble.cost_control.cost_control import InputLimiter, InputResult, input_limiter

__all__ = ["InputLimiter", "InputResult", "input_limiter"]
