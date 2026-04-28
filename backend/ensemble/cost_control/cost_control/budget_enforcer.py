"""Hard budget enforcement with per-agent, per-workflow, and monthly caps.

All limits are *hard* — once exhausted the enforcer refuses further
spending.  An escrow system reserves funds before execution and confirms
or releases them afterwards, preventing double-spend and race conditions.
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)

# Default caps (in arbitrary cost units; e.g. USD cents or token-cost units)
DEFAULT_AGENT_LIMIT: float = 500.0
DEFAULT_WORKFLOW_LIMIT: float = 5000.0
DEFAULT_MONTHLY_CAP: float = 50000.0
ESCROW_TIMEOUT: float = 300.0  # escrows auto-expire after 5 minutes


class EscrowStatus(Enum):
    RESERVED = "reserved"
    CONFIRMED = "confirmed"
    RELEASED = "released"
    EXPIRED = "expired"


@dataclass(frozen=True)
class BudgetCheckResult:
    """Result of a budget check."""

    allowed: bool
    reason: str
    escrowed_amount: float = 0.0


@dataclass
class _EscrowEntry:
    """Internal escrow ledger entry."""

    escrow_id: str
    agent_id: str
    workflow_id: str
    amount: float
    status: EscrowStatus
    created_at: float
    expires_at: float


@dataclass
class _AgentBudget:
    spent: float = 0.0
    escrowed: float = 0.0


@dataclass
class _WorkflowBudget:
    spent: float = 0.0
    escrowed: float = 0.0


@dataclass
class _MonthlyBudget:
    month_key: str  # "YYYY-MM"
    spent: float = 0.0
    escrowed: float = 0.0


class BudgetEnforcer:
    """Thread-safe budget enforcer with escrow support.

    Tracks three independent budgets simultaneously:

    * **Per-agent** — maximum cost a single agent may incur.
    * **Per-workflow** — total budget for an entire workflow run.
    * **Monthly account** — global cap across all workflows in a calendar
      month.

    Escrow workflow
    ---------------
    1. ``escrow(agent_id, workflow_id, amount)`` — reserves funds.
    2. ``confirm_escrow(escrow_id)`` — commits the spend (moves escrow to
       ``spent``).
    3. ``release_escrow(escrow_id)`` — refunds the reservation.
    """

    def __init__(
        self,
        agent_limit: float = DEFAULT_AGENT_LIMIT,
        workflow_limit: float = DEFAULT_WORKFLOW_LIMIT,
        monthly_cap: float = DEFAULT_MONTHLY_CAP,
    ) -> None:
        if agent_limit <= 0 or workflow_limit <= 0 or monthly_cap <= 0:
            raise ValueError("All budget limits must be > 0")

        self._agent_limit = agent_limit
        self._workflow_limit = workflow_limit
        self._monthly_cap = monthly_cap
        self._lock = threading.Lock()

        # Budget stores
        self._agent_budgets: dict[str, _AgentBudget] = {}
        self._workflow_budgets: dict[str, _WorkflowBudget] = {}
        self._monthly_budgets: dict[str, _MonthlyBudget] = {}

        # Escrow ledger
        self._escrows: dict[str, _EscrowEntry] = {}
        self._escrow_counter = 0

    # -- budget queries -------------------------------------------------------

    def check_budget(
        self,
        agent_id: str,
        workflow_id: str,
        estimated_cost: float,
        *,
        month_key: str | None = None,
    ) -> BudgetCheckResult:
        """Check whether *estimated_cost* can be spent within all budgets.

        Does **not** reserve any funds — use :meth:`escrow` for that.
        """
        if estimated_cost <= 0:
            return BudgetCheckResult(
                allowed=False,
                reason="Estimated cost must be > 0",
            )

        with self._lock:
            ab = self._get_or_create_agent(agent_id)
            wb = self._get_or_create_workflow(workflow_id)
            mb = self._get_or_create_monthly(month_key or self._current_month())

            # Available = limit - (spent + escrowed)
            agent_avail = self._agent_limit - (ab.spent + ab.escrowed)
            workflow_avail = self._workflow_limit - (wb.spent + wb.escrowed)
            monthly_avail = self._monthly_cap - (mb.spent + mb.escrowed)

            reasons: list[str] = []
            if estimated_cost > agent_avail:
                reasons.append(
                    f"Agent '{agent_id}' budget exceeded: "
                    f"need {estimated_cost:.2f}, available {agent_avail:.2f}"
                )
            if estimated_cost > workflow_avail:
                reasons.append(
                    f"Workflow '{workflow_id}' budget exceeded: "
                    f"need {estimated_cost:.2f}, available {workflow_avail:.2f}"
                )
            if estimated_cost > monthly_avail:
                reasons.append(
                    f"Monthly cap exceeded: need {estimated_cost:.2f}, "
                    f"available {monthly_avail:.2f}"
                )

            if reasons:
                return BudgetCheckResult(
                    allowed=False,
                    reason="; ".join(reasons),
                )

            return BudgetCheckResult(
                allowed=True,
                reason="Budget available",
            )

    # -- escrow operations ----------------------------------------------------

    def escrow(
        self,
        agent_id: str,
        workflow_id: str,
        amount: float,
        *,
        month_key: str | None = None,
    ) -> BudgetCheckResult:
        """Reserve *amount* from all applicable budgets.

        Returns a ``BudgetCheckResult`` with ``allowed=True`` and the
        ``escrow_id`` embedded in the reason if successful.
        """
        if amount <= 0:
            return BudgetCheckResult(
                allowed=False,
                reason="Escrow amount must be > 0",
            )

        check = self.check_budget(agent_id, workflow_id, amount, month_key=month_key)
        if not check.allowed:
            return check

        with self._lock:
            self._escrow_counter += 1
            escrow_id = f"esc-{self._escrow_counter}"
            now = time.monotonic()

            ab = self._agent_budgets[agent_id]
            wb = self._workflow_budgets[workflow_id]
            mk = month_key or self._current_month()
            mb = self._monthly_budgets[mk]

            ab.escrowed += amount
            wb.escrowed += amount
            mb.escrowed += amount

            entry = _EscrowEntry(
                escrow_id=escrow_id,
                agent_id=agent_id,
                workflow_id=workflow_id,
                amount=amount,
                status=EscrowStatus.RESERVED,
                created_at=now,
                expires_at=now + ESCROW_TIMEOUT,
            )
            self._escrows[escrow_id] = entry

        logger.info(
            "Escrowed %.2f for agent=%s workflow=%s [%s]",
            amount,
            agent_id,
            workflow_id,
            escrow_id,
        )
        return BudgetCheckResult(
            allowed=True,
            reason=f"Escrowed: {escrow_id}",
            escrowed_amount=amount,
        )

    def confirm_escrow(self, escrow_id: str) -> BudgetCheckResult:
        """Commit a previously-reserved escrow (moves escrowed -> spent)."""
        with self._lock:
            entry = self._resolve_escrow(escrow_id)
            if entry is None:
                return BudgetCheckResult(
                    allowed=False,
                    reason=f"Escrow '{escrow_id}' not found",
                )

            if entry.status == EscrowStatus.CONFIRMED:
                return BudgetCheckResult(
                    allowed=False,
                    reason=f"Escrow '{escrow_id}' already confirmed",
                )

            if entry.status == EscrowStatus.EXPIRED:
                self._release_escrow_locked(entry)
                return BudgetCheckResult(
                    allowed=False,
                    reason=f"Escrow '{escrow_id}' expired and was released",
                )

            amount = entry.amount
            ab = self._agent_budgets[entry.agent_id]
            wb = self._workflow_budgets[entry.workflow_id]
            mb = self._monthly_budgets[self._current_month()]

            ab.escrowed -= amount
            ab.spent += amount
            wb.escrowed -= amount
            wb.spent += amount
            mb.escrowed -= amount
            mb.spent += amount

            entry.status = EscrowStatus.CONFIRMED

        logger.info("Confirmed escrow %s (%.2f)", escrow_id, amount)
        return BudgetCheckResult(
            allowed=True,
            reason=f"Confirmed: {escrow_id}",
            escrowed_amount=amount,
        )

    def release_escrow(self, escrow_id: str) -> BudgetCheckResult:
        """Release a reserved escrow back to the available budget."""
        with self._lock:
            entry = self._resolve_escrow(escrow_id)
            if entry is None:
                return BudgetCheckResult(
                    allowed=False,
                    reason=f"Escrow '{escrow_id}' not found",
                )
            if entry.status in (
                EscrowStatus.CONFIRMED,
                EscrowStatus.RELEASED,
                EscrowStatus.EXPIRED,
            ):
                return BudgetCheckResult(
                    allowed=False,
                    reason=f"Escrow '{escrow_id}' cannot be released (status: {entry.status.value})",
                )
            amount = self._release_escrow_locked(entry)

        logger.info("Released escrow %s (%.2f)", escrow_id, amount)
        return BudgetCheckResult(
            allowed=True,
            reason=f"Released: {escrow_id}",
            escrowed_amount=amount,
        )

    # -- reporting ------------------------------------------------------------

    def get_agent_usage(self, agent_id: str) -> dict[str, float]:
        """Return current spent and escrowed for an agent."""
        with self._lock:
            ab = self._agent_budgets.get(agent_id)
            if ab is None:
                return {"spent": 0.0, "escrowed": 0.0, "limit": self._agent_limit}
            return {
                "spent": ab.spent,
                "escrowed": ab.escrowed,
                "limit": self._agent_limit,
                "available": self._agent_limit - ab.spent - ab.escrowed,
            }

    def get_workflow_usage(self, workflow_id: str) -> dict[str, float]:
        with self._lock:
            wb = self._workflow_budgets.get(workflow_id)
            if wb is None:
                return {"spent": 0.0, "escrowed": 0.0, "limit": self._workflow_limit}
            return {
                "spent": wb.spent,
                "escrowed": wb.escrowed,
                "limit": self._workflow_limit,
                "available": self._workflow_limit - wb.spent - wb.escrowed,
            }

    def get_monthly_usage(self, month_key: str | None = None) -> dict[str, float]:
        mk = month_key or self._current_month()
        with self._lock:
            mb = self._monthly_budgets.get(mk)
            if mb is None:
                return {"spent": 0.0, "escrowed": 0.0, "cap": self._monthly_cap}
            return {
                "month": mk,
                "spent": mb.spent,
                "escrowed": mb.escrowed,
                "cap": self._monthly_cap,
                "available": self._monthly_cap - mb.spent - mb.escrowed,
            }

    def expire_stale_escrows(self) -> int:
        """Release all escrows that have exceeded their TTL.  Returns count."""
        now = time.monotonic()
        expired_ids: list[str] = []
        with self._lock:
            for eid, entry in self._escrows.items():
                if entry.status == EscrowStatus.RESERVED and now > entry.expires_at:
                    expired_ids.append(eid)
            for eid in expired_ids:
                entry = self._escrows[eid]
                entry.status = EscrowStatus.EXPIRED
                self._release_escrow_locked(entry)
        if expired_ids:
            logger.info("Expired %d stale escrows", len(expired_ids))
        return len(expired_ids)

    # -- internals -----------------------------------------------------------

    @staticmethod
    def _current_month() -> str:
        from datetime import datetime

        return datetime.utcnow().strftime("%Y-%m")

    def _get_or_create_agent(self, agent_id: str) -> _AgentBudget:
        # Caller must hold self._lock.
        if agent_id not in self._agent_budgets:
            self._agent_budgets[agent_id] = _AgentBudget()
        return self._agent_budgets[agent_id]

    def _get_or_create_workflow(self, workflow_id: str) -> _WorkflowBudget:
        if workflow_id not in self._workflow_budgets:
            self._workflow_budgets[workflow_id] = _WorkflowBudget()
        return self._workflow_budgets[workflow_id]

    def _get_or_create_monthly(self, month_key: str) -> _MonthlyBudget:
        if month_key not in self._monthly_budgets:
            self._monthly_budgets[month_key] = _MonthlyBudget(month_key=month_key)
        return self._monthly_budgets[month_key]

    def _resolve_escrow(self, escrow_id: str) -> _EscrowEntry | None:
        # Caller must hold self._lock.
        return self._escrows.get(escrow_id)

    def _release_escrow_locked(self, entry: _EscrowEntry) -> float:
        # Caller must hold self._lock.
        amount = entry.amount
        ab = self._agent_budgets.get(entry.agent_id)
        wb = self._workflow_budgets.get(entry.workflow_id)
        mb = self._monthly_budgets.get(self._current_month())

        if ab and ab.escrowed >= amount:
            ab.escrowed -= amount
        if wb and wb.escrowed >= amount:
            wb.escrowed -= amount
        if mb and mb.escrowed >= amount:
            mb.escrowed -= amount

        entry.status = EscrowStatus.RELEASED
        return amount

    def reset(self) -> None:
        """Clear all budgets and escrows.  Useful for tests."""
        with self._lock:
            self._agent_budgets.clear()
            self._workflow_budgets.clear()
            self._monthly_budgets.clear()
            self._escrows.clear()
            self._escrow_counter = 0

    def __repr__(self) -> str:
        return (
            f"BudgetEnforcer(agent_limit={self._agent_limit}, "
            f"workflow_limit={self._workflow_limit}, "
            f"monthly_cap={self._monthly_cap})"
        )

    # Backwards compatibility aliases
    def confirm_execution(
        self, agent_id: str, actual_cost: float, workflow_id: str = "default"
    ):
        """Backwards compatibility - records cost directly without escrow."""
        # Just update the spending totals without escrow mechanics
        with self._lock:
            ab = self._get_or_create_agent(agent_id)
            wb = self._get_or_create_workflow(workflow_id)
            mb = self._get_or_create_monthly(self._current_month())

            ab.spent += actual_cost
            wb.spent += actual_cost
            mb.spent += actual_cost
