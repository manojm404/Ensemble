# Compatibility shim re-exporting budget enforcer
from backend.ensemble.cost_control.cost_control import BudgetEnforcer, BudgetCheckResult, budget_enforcer

__all__ = ["BudgetEnforcer", "BudgetCheckResult", "budget_enforcer"]
