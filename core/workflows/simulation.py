"""Logical-cycle simulation runtime for Workflow Studio 2.0.

This runner is intentionally deterministic. It gives Esemble a governed
runtime for chaotic workflows without forcing every scenario through a linear
DAG or spending LLM budget per simulated tick.
"""

from __future__ import annotations

import json
import random
import sqlite3
import time
import uuid
import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional, Sequence

from core.workflows.messages import AgentMessage, AgentMessageLedger, AgentMessageValidationError


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _json(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, sort_keys=True)


def _loads(value: Optional[str], fallback: Any) -> Any:
    if not value:
        return fallback
    try:
        return json.loads(value)
    except Exception:
        return fallback


@dataclass
class SimulationConfig:
    cycle_type: str = "logical_tick"
    cycle_interval_label: str = "2 simulated seconds"
    soft_max_cycles: int = 8
    hard_max_cycles: int = 20
    random_seed: Optional[str] = None
    checkpoint_interval_cycles: int = 1
    agent_timeout_cycles: int = 2
    speed_mode: str = "max"
    manual_control: bool = False

    @classmethod
    def from_graph(cls, graph: Dict[str, Any], prompt: str = "") -> "SimulationConfig":
        metadata = graph.get("metadata") or {}
        defaults = metadata.get("simulation_defaults") or metadata.get("simulationDefaults") or {}
        soft = int(defaults.get("soft_max_cycles") or defaults.get("max_cycles") or defaults.get("maxCycles") or 8)
        hard = int(defaults.get("hard_max_cycles") or 20)
        return cls(
            cycle_type=str(defaults.get("cycle_type") or "logical_tick"),
            cycle_interval_label=str(defaults.get("cycle_interval_label") or "2 simulated seconds"),
            soft_max_cycles=max(1, min(soft, hard)),
            hard_max_cycles=max(1, min(hard, 20)),
            random_seed=defaults.get("random_seed") or defaults.get("seed") or None,
            checkpoint_interval_cycles=max(1, int(defaults.get("checkpoint_interval_cycles") or 1)),
            agent_timeout_cycles=max(1, int(defaults.get("agent_timeout_cycles") or 2)),
            speed_mode=str(defaults.get("speed_mode") or "max"),
            manual_control=bool(defaults.get("manual_control") or defaults.get("manualControl") or defaults.get("pause_between_cycles") or defaults.get("pauseBetweenCycles") or False),
        )


class SimulationRunner:
    """Execute evented/logical-tick workflow simulations."""

    def __init__(
        self,
        db_path: str,
        workflow_id: str,
        graph: Dict[str, Any],
        company_id: str,
        run_id: Optional[str] = None,
        initial_input: str = "",
    ) -> None:
        self.db_path = db_path
        self.workflow_id = workflow_id
        self.graph = graph or {}
        self.company_id = company_id
        self.run_id = run_id or f"sim_{int(time.time())}_{uuid.uuid4().hex[:6]}"
        self.initial_input = initial_input or ""
        self.config = SimulationConfig.from_graph(self.graph, self.initial_input)
        self.random = random.Random(self.config.random_seed or f"{self.workflow_id}:{self.initial_input}")
        self.state: Dict[str, Any] = {}
        self.state_versions: Dict[str, int] = {}
        self.agent_status: Dict[str, Dict[str, Any]] = {}
        self.event_ids: List[int] = []
        self.message_parent_by_thread: Dict[str, str] = {}
        self._ensure_schema()
        self.nodes = self._resolve_nodes()

    def _ensure_schema(self) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS workflows (
                    id TEXT PRIMARY KEY,
                    company_id TEXT,
                    name TEXT,
                    graph_json TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS executions (
                    run_id TEXT PRIMARY KEY,
                    workflow_id TEXT,
                    company_id TEXT,
                    status TEXT,
                    current_node TEXT,
                    last_agent_id TEXT,
                    parent_run_id TEXT,
                    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    current_iteration INTEGER DEFAULT 0,
                    max_iterations INTEGER DEFAULT 0,
                    loop_metadata TEXT,
                    completed_at DATETIME
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS node_executions (
                    run_id TEXT,
                    node_id TEXT,
                    status TEXT,
                    output TEXT,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY(run_id, node_id)
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS workflow_run_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id TEXT,
                    workflow_id TEXT,
                    company_id TEXT,
                    node_id TEXT,
                    event_type TEXT,
                    status TEXT,
                    label TEXT,
                    role TEXT,
                    payload_json TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS agent_messages (
                    message_id TEXT PRIMARY KEY,
                    run_id TEXT,
                    workflow_id TEXT,
                    company_id TEXT,
                    cycle INTEGER DEFAULT 0,
                    sender_node_id TEXT,
                    recipient_node_ids_json TEXT,
                    visibility TEXT DEFAULT 'public',
                    message_type TEXT DEFAULT 'note',
                    subject TEXT,
                    body TEXT,
                    related_state_keys_json TEXT,
                    source_event_ids_json TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    thread_id TEXT,
                    in_reply_to TEXT
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS simulation_state_versions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id TEXT,
                    workflow_id TEXT,
                    company_id TEXT,
                    state_key TEXT,
                    value_json TEXT,
                    version INTEGER,
                    writer_agent_id TEXT,
                    cycle INTEGER,
                    visibility TEXT DEFAULT 'public',
                    confidence REAL DEFAULT 1.0,
                    warnings_json TEXT,
                    source_events_json TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_simulation_state_run_key
                ON simulation_state_versions(run_id, state_key, version)
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS simulation_checkpoints (
                    run_id TEXT,
                    cycle INTEGER,
                    workflow_id TEXT,
                    company_id TEXT,
                    state_json TEXT,
                    agent_status_json TEXT,
                    event_ids_json TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY(run_id, cycle)
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS simulation_agent_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id TEXT,
                    workflow_id TEXT,
                    company_id TEXT,
                    node_id TEXT,
                    cycle INTEGER,
                    level TEXT,
                    message TEXT,
                    event_id INTEGER,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)

    def _resolve_nodes(self) -> List[Dict[str, Any]]:
        nodes = list(self.graph.get("nodes") or [])
        if self._is_quantum_banana() and len(nodes) < 10:
            return self._quantum_banana_nodes()
        if nodes:
            return nodes
        return [{
            "id": "agent_1",
            "data": {
                "label": "🧪 Simulation Agent",
                "role": "simulation-agent",
                "subtitle": "Logical cycle worker",
                "timing_policy": {"type": "every_cycle"},
            },
        }]

    def _is_quantum_banana(self) -> bool:
        text = self.initial_input.lower()
        return "quantum banana" in text or ("banana" in text and "inventory" in text)

    def _quantum_banana_nodes(self) -> List[Dict[str, Any]]:
        specs = [
            ("agent_1", "📦 Inventory Tracker", "every_cycle", "inventory_primary"),
            ("agent_2", "🚚 Shipment Logger", "every_cycle", "shipments"),
            ("agent_3", "🧾 Invoice Generator", "every_cycle", "invoices"),
            ("agent_4", "💸 Finance Bot", "every_cycle", "fraud_flags"),
            ("agent_5", "🕵️ Saboteur", "every_n_cycles", "stolen_bananas"),
            ("agent_6", "🛃 Customs Agent", "every_cycle", "customs_seizures"),
            ("agent_7", "⚖️ Reconciler", "every_cycle", "reconciliation_status"),
            ("agent_8", "📨 Complaint Department", "on_event", "email_drafts"),
            ("agent_9", "📣 Whistleblower", "on_threshold", "panic_events"),
            ("agent_10", "👁️ Silent Observer", "on_finalization", "guilt_scores"),
            ("agent_11", "🏚️ Dark Warehouse Keeper", "every_cycle", "black_market_sales"),
            ("agent_12", "📊 Two-Faced Accountant", "every_cycle", "email_drafts"),
            ("agent_13", "🌀 Parallel Reality Bot", "every_cycle", "inventory_parallel_timeline"),
            ("agent_14", "🚨 Emergency Auditor", "on_event", "audit_results"),
            ("agent_15", "✍️ Storyteller", "on_finalization", "final_report"),
        ]
        return [
            {
                "id": node_id,
                "type": "agentNode",
                "data": {
                    "label": label,
                    "role": label.split(" ", 1)[-1],
                    "subtitle": output_key.replace("_", " ").title(),
                    "timing_policy": {"type": timing, "n": 2 if timing == "every_n_cycles" else None},
                    "output_state_key": output_key,
                    "selection_reason": "Mapped from the Quantum Banana simulation architecture.",
                },
            }
            for node_id, label, timing, output_key in specs
        ]

    def _node_meta(self, node: Dict[str, Any]) -> Dict[str, str]:
        data = node.get("data") or {}
        return {
            "id": str(node.get("id")),
            "label": str(data.get("label") or data.get("name") or node.get("id")),
            "role": str(data.get("role") or data.get("label") or node.get("id")),
            "subtitle": str(data.get("subtitle") or ""),
        }

    def _insert_execution(self) -> None:
        with sqlite3.connect(self.db_path) as conn:
            runtime_graph = {
                "nodes": self.nodes,
                "edges": self.graph.get("edges") or [],
                "metadata": {
                    **(self.graph.get("metadata") or {}),
                    "workflow_mode": "simulation",
                    "final_output_type": (self.graph.get("metadata") or {}).get("final_output_type") or "document",
                },
            }
            conn.execute(
                """
                INSERT INTO workflows (id, company_id, name, graph_json)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    graph_json = excluded.graph_json,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (
                    self.workflow_id,
                    self.company_id,
                    (self.graph.get("metadata") or {}).get("domain_title") or "Simulation Workflow",
                    _json(runtime_graph),
                ),
            )
            conn.execute(
                """
                INSERT OR REPLACE INTO executions (
                    run_id, workflow_id, company_id, status, current_node, last_agent_id,
                    current_iteration, max_iterations, loop_metadata
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    self.run_id,
                    self.workflow_id,
                    self.company_id,
                    "running",
                    self.nodes[0]["id"] if self.nodes else None,
                    None,
                    0,
                    self.config.hard_max_cycles,
                    _json({
                        "workflow_mode": "simulation",
                        "cycle_type": self.config.cycle_type,
                        "speed_mode": self.config.speed_mode,
                        "simulation_control": {
                            "mode": "manual" if self.config.manual_control else "auto",
                            "paused": bool(self.config.manual_control),
                            "step_grant": 1 if self.config.manual_control else 0,
                            "last_command": "initial_step" if self.config.manual_control else "auto",
                        },
                        "soft_max_cycles": self.config.soft_max_cycles,
                        "hard_max_cycles": self.config.hard_max_cycles,
                        "random_seed": self.config.random_seed,
                    }),
                ),
            )
            for index, node in enumerate(self.nodes):
                node_id = str(node.get("id"))
                status = "queued" if index == 0 else "idle"
                conn.execute(
                    """
                    INSERT OR REPLACE INTO node_executions (run_id, node_id, status, output)
                    VALUES (?, ?, ?, COALESCE((SELECT output FROM node_executions WHERE run_id = ? AND node_id = ?), ''))
                    """,
                    (self.run_id, node_id, status, self.run_id, node_id),
                )
                self.agent_status[node_id] = {
                    "node_id": node_id,
                    "status": status,
                    "cycle": 0,
                    "last_action": "queued" if index == 0 else "idle",
                }

    def _record_event(
        self,
        event_type: str,
        *,
        cycle: int,
        node_id: Optional[str] = None,
        status: str = "info",
        payload: Optional[Dict[str, Any]] = None,
    ) -> int:
        meta = {}
        if node_id:
            node = next((item for item in self.nodes if str(item.get("id")) == node_id), None)
            meta = self._node_meta(node or {"id": node_id, "data": {}})
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(
                """
                INSERT INTO workflow_run_events (
                    run_id, workflow_id, company_id, node_id, event_type, status, label, role, payload_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    self.run_id,
                    self.workflow_id,
                    self.company_id,
                    node_id,
                    event_type,
                    status,
                    meta.get("label"),
                    meta.get("role"),
                    _json({"cycle": cycle, **(payload or {})}),
                ),
            )
            event_id = int(cursor.lastrowid)
        self.event_ids.append(event_id)
        return event_id

    def _write_state(
        self,
        key: str,
        value: Any,
        *,
        writer: str,
        cycle: int,
        visibility: str = "public",
        confidence: float = 1.0,
        warnings: Optional[Sequence[str]] = None,
        source_events: Optional[Sequence[int | str]] = None,
    ) -> None:
        if key == "inventory_primary" and isinstance(value, (int, float)):
            value = max(0, int(value))
        version = self.state_versions.get(key, 0) + 1
        self.state_versions[key] = version
        self.state[key] = value
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO simulation_state_versions (
                    run_id, workflow_id, company_id, state_key, value_json, version,
                    writer_agent_id, cycle, visibility, confidence, warnings_json, source_events_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    self.run_id,
                    self.workflow_id,
                    self.company_id,
                    key,
                    _json(value),
                    version,
                    writer,
                    cycle,
                    visibility,
                    confidence,
                    _json(list(warnings or [])),
                    _json([str(item) for item in source_events or []]),
                ),
            )
        self._record_event(
            "state.written",
            cycle=cycle,
            node_id=writer,
            status="completed",
            payload={"key": key, "version": version, "visibility": visibility, "warnings": list(warnings or [])},
        )

    def _log_agent(self, node_id: str, cycle: int, level: str, message: str, event_id: Optional[int] = None) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO simulation_agent_logs (run_id, workflow_id, company_id, node_id, cycle, level, message, event_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (self.run_id, self.workflow_id, self.company_id, node_id, cycle, level, message, event_id),
            )

    def _load_existing_messages(self) -> List[Dict[str, Any]]:
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(
                """
                SELECT message_id, run_id, cycle, sender_node_id, recipient_node_ids_json, visibility,
                       message_type, subject, body, related_state_keys_json, source_event_ids_json,
                       created_at, thread_id, in_reply_to
                FROM agent_messages
                WHERE run_id = ?
                ORDER BY created_at ASC
                """,
                (self.run_id,),
            ).fetchall()
        return [
            {
                "message_id": row[0],
                "run_id": row[1],
                "cycle": row[2],
                "sender_node_id": row[3],
                "recipient_node_ids": _loads(row[4], []),
                "visibility": row[5],
                "message_type": row[6],
                "subject": row[7] or "",
                "body": row[8] or "",
                "related_state_keys": _loads(row[9], []),
                "source_event_ids": _loads(row[10], []),
                "created_at": row[11],
                "thread_id": row[12],
                "in_reply_to": row[13],
            }
            for row in rows
        ]

    def _send_message(
        self,
        *,
        cycle: int,
        sender: str,
        recipients: Sequence[str],
        visibility: str,
        message_type: str,
        subject: str,
        body: str,
        thread_id: Optional[str] = None,
        in_reply_to: Optional[str] = None,
        related_state_keys: Optional[Sequence[str]] = None,
        source_event_ids: Optional[Sequence[int | str]] = None,
    ) -> Optional[str]:
        message_id = f"msg_{self.run_id}_{cycle}_{sender}_{uuid.uuid4().hex[:5]}"
        if in_reply_to is None and thread_id and thread_id in self.message_parent_by_thread:
            in_reply_to = self.message_parent_by_thread[thread_id]
        message = AgentMessage(
            message_id=message_id,
            run_id=self.run_id,
            cycle=cycle,
            sender_node_id=sender,
            recipient_node_ids=recipients,
            visibility=visibility,
            message_type=message_type,
            subject=subject,
            body=body,
            related_state_keys=related_state_keys or [],
            source_event_ids=[str(item) for item in source_event_ids or []],
            thread_id=thread_id,
            in_reply_to=in_reply_to,
        )
        try:
            ledger = AgentMessageLedger(self._load_existing_messages())
            ledger.add_message(message)
        except AgentMessageValidationError:
            return None
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO agent_messages (
                    message_id, run_id, workflow_id, company_id, cycle, sender_node_id,
                    recipient_node_ids_json, visibility, message_type, subject, body,
                    related_state_keys_json, source_event_ids_json, created_at, thread_id, in_reply_to
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    message.message_id,
                    message.run_id,
                    self.workflow_id,
                    self.company_id,
                    message.cycle,
                    message.sender_node_id,
                    _json(list(message.recipient_node_ids)),
                    message.visibility,
                    message.message_type,
                    message.subject,
                    message.body,
                    _json(list(message.related_state_keys)),
                    _json(list(message.source_event_ids)),
                    message.created_at,
                    message.thread_id,
                    message.in_reply_to,
                ),
            )
        if thread_id:
            self.message_parent_by_thread[thread_id] = message_id
        self._record_event(
            "email.created" if message_type == "email" else "message.sent",
            cycle=cycle,
            node_id=sender,
            status="completed",
            payload={"message_id": message_id, "message_type": message_type, "visibility": visibility, "recipients": list(recipients)},
        )
        return message_id

    def _checkpoint(self, cycle: int) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO simulation_checkpoints (
                    run_id, cycle, workflow_id, company_id, state_json, agent_status_json, event_ids_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    self.run_id,
                    cycle,
                    self.workflow_id,
                    self.company_id,
                    _json(self.state),
                    _json(self.agent_status),
                    _json(self.event_ids),
                ),
            )

    def _set_node_status(self, node_id: str, status: str, cycle: int, output: str = "") -> None:
        self.agent_status[node_id] = {
            **self.agent_status.get(node_id, {}),
            "node_id": node_id,
            "status": status,
            "cycle": cycle,
            "last_action": status,
        }
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO node_executions (run_id, node_id, status, output)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(run_id, node_id) DO UPDATE SET
                    status = excluded.status,
                    output = CASE WHEN excluded.output IS NULL OR excluded.output = '' THEN node_executions.output ELSE excluded.output END,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (self.run_id, node_id, status, output),
            )
            conn.execute(
                """
                UPDATE executions
                SET current_node = ?, last_agent_id = ?, current_iteration = ?, status = ?
                WHERE run_id = ?
                """,
                (node_id, node_id, cycle, "running", self.run_id),
            )
        self._record_event("node." + status, cycle=cycle, node_id=node_id, status=status)

    def _execution_control(self) -> Dict[str, Any]:
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute(
                "SELECT status, loop_metadata FROM executions WHERE run_id = ? AND company_id = ?",
                (self.run_id, self.company_id),
            ).fetchone()
        status = row[0] if row else "running"
        metadata = _loads(row[1] if row else None, {})
        control = metadata.get("simulation_control") or {}
        return {"status": status, "metadata": metadata, "control": control}

    def _write_execution_control(self, metadata: Dict[str, Any], *, status: Optional[str] = None) -> None:
        with sqlite3.connect(self.db_path) as conn:
            if status is None:
                conn.execute(
                    "UPDATE executions SET loop_metadata = ? WHERE run_id = ? AND company_id = ?",
                    (_json(metadata), self.run_id, self.company_id),
                )
            else:
                conn.execute(
                    "UPDATE executions SET status = ?, loop_metadata = ? WHERE run_id = ? AND company_id = ?",
                    (status, _json(metadata), self.run_id, self.company_id),
                )

    async def _wait_for_cycle_permission(self, next_cycle: int) -> bool:
        """Block between cycles while user-controlled pause is active.

        Returns False when the run has been externally cancelled or completed.
        """
        while True:
            snapshot = self._execution_control()
            status = str(snapshot.get("status") or "running").lower()
            metadata = snapshot.get("metadata") or {}
            control = metadata.get("simulation_control") or {}

            if status in {"cancelled", "failed", "completed"}:
                return False

            paused = status == "paused" or bool(control.get("paused"))
            step_grant = int(control.get("step_grant") or 0)

            if paused and step_grant <= 0:
                if status != "paused":
                    metadata["simulation_control"] = control
                    self._write_execution_control(metadata, status="paused")
                await asyncio.sleep(0.25)
                continue

            if step_grant > 0:
                control["step_grant"] = max(0, step_grant - 1)
                if control.get("mode") == "manual" and control["step_grant"] == 0:
                    control["paused"] = True
                    status = "paused"
                else:
                    control["paused"] = False
                    status = "running"
                control["last_granted_cycle"] = next_cycle
                metadata["simulation_control"] = control
                self._write_execution_control(metadata, status=status)
                return True

            if paused:
                await asyncio.sleep(0.25)
                continue

            return True

    async def run(self) -> Dict[str, Any]:
        self._insert_execution()
        self._record_event(
            "run.started",
            cycle=0,
            status="running",
            payload={"workflow_mode": "simulation", "node_count": len(self.nodes), "prompt": self.initial_input},
        )
        self._initialize_state()
        self._checkpoint(0)

        terminal_reason = "max_cycles"
        for cycle in range(1, self.config.soft_max_cycles + 1):
            if not await self._wait_for_cycle_permission(cycle):
                terminal_reason = "cancelled"
                break
            with sqlite3.connect(self.db_path) as conn:
                conn.execute(
                    """
                    UPDATE executions
                    SET status = 'running', current_iteration = ?, current_node = ?
                    WHERE run_id = ? AND company_id = ? AND status != 'completed'
                    """,
                    (cycle, self.nodes[0]["id"] if self.nodes else None, self.run_id, self.company_id),
                )
            self._record_event("cycle.started", cycle=cycle, status="running")
            if self._is_quantum_banana():
                self._run_quantum_cycle(cycle)
            else:
                self._run_generic_cycle(cycle)
            self._record_event("cycle.completed", cycle=cycle, status="completed")
            if cycle % self.config.checkpoint_interval_cycles == 0:
                self._checkpoint(cycle)

            if self.state.get("audit_results") and cycle >= min(5, self.config.soft_max_cycles):
                terminal_reason = "audit_completed"
                break

        final_markdown = self._finalize(cycle=cycle, terminal_reason=terminal_reason)
        self._checkpoint(cycle)
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                UPDATE executions
                SET status = 'completed', current_node = NULL, last_agent_id = ?, current_iteration = ?, completed_at = CURRENT_TIMESTAMP
                WHERE run_id = ?
                """,
                ("agent_15" if self._is_quantum_banana() else self.nodes[-1]["id"], cycle, self.run_id),
            )
        self._record_event("run.completed", cycle=cycle, status="completed", payload={"terminal_reason": terminal_reason})
        return {"status": "completed", "run_id": self.run_id, "markdown": final_markdown}

    def _initialize_state(self) -> None:
        if self._is_quantum_banana():
            self._write_state("inventory_primary", 10000, writer="agent_1", cycle=0)
            self._write_state("inventory_parallel_timeline", 12000, writer="agent_13", cycle=0)
            self._write_state("shipments", [], writer="agent_2", cycle=0)
            self._write_state("fraud_flags", [], writer="agent_4", cycle=0)
            self._write_state("email_drafts", [], writer="agent_8", cycle=0)
        else:
            self._write_state("prompt", self.initial_input, writer="system", cycle=0)

    def _run_generic_cycle(self, cycle: int) -> None:
        for node in self.nodes:
            node_id = str(node.get("id"))
            meta = self._node_meta(node)
            self._set_node_status(node_id, "running", cycle)
            output = f"{meta['label']} processed simulation cycle {cycle} for: {self.initial_input[:160]}"
            self._write_state(
                f"{node_id}_last_output",
                output,
                writer=node_id,
                cycle=cycle,
                source_events=[self.event_ids[-1]] if self.event_ids else [],
            )
            self._send_message(
                cycle=cycle,
                sender=node_id,
                recipients=["workflow_result"],
                visibility="public",
                message_type="handoff",
                subject=f"{meta['label']} cycle {cycle} handoff",
                body=output,
                thread_id=f"thread_{self.run_id}_simulation",
            )
            self._set_node_status(node_id, "completed", cycle, output)

    def _run_quantum_cycle(self, cycle: int) -> None:
        shipped = self.random.randint(100, 500)
        current_inventory = int(self.state.get("inventory_primary", 10000))
        new_inventory = max(0, current_inventory - shipped)
        self._set_node_status("agent_1", "running", cycle)
        self._write_state("inventory_primary", new_inventory, writer="agent_1", cycle=cycle)
        self._log_agent("agent_1", cycle, "info", f"Shipped {shipped} Quantum Bananas; inventory now {new_inventory}.")
        self._set_node_status("agent_1", "completed", cycle, f"Inventory now {new_inventory}.")

        destination = self.random.choice(["Chicago", "Mumbai", "Berlin", "São Paulo", "Lagos", "Tokyo"])
        shipment = {"cycle": cycle, "destination": destination, "amount": shipped, "timestamp": f"T+{cycle * 2}s"}
        shipments = list(self.state.get("shipments") or [])
        shipments.append(shipment)
        double_logged = list(self.state.get("double_logged_shipments") or [])
        if self.random.random() < 0.2:
            shipments.append({**shipment, "duplicate_suspected": True})
            double_logged.append(shipment)
        self._set_node_status("agent_2", "running", cycle)
        self._write_state("shipments", shipments, writer="agent_2", cycle=cycle, warnings=["duplicate_suspected"] if double_logged else [])
        self._write_state("double_logged_shipments", double_logged, writer="agent_2", cycle=cycle)
        self._set_node_status("agent_2", "completed", cycle, f"Logged shipment to {destination}.")

        invoices = list(self.state.get("invoices") or [])
        if self.random.random() < 0.3:
            overcharge = round(self.random.uniform(0.05, 0.50), 2)
            invoices.append({"cycle": cycle, "shipment": shipment, "overcharge": overcharge, "invoice_amount": round(shipped * (1 + overcharge), 2)})
        self._set_node_status("agent_3", "running", cycle)
        self._write_state("invoices", invoices, writer="agent_3", cycle=cycle)
        self._set_node_status("agent_3", "completed", cycle, f"Generated {len(invoices)} invoice(s).")

        fraud_flags = list(self.state.get("fraud_flags") or [])
        for invoice in invoices:
            if invoice.get("cycle") == cycle and float(invoice.get("overcharge", 0)) > 0.10:
                flag = {"cycle": cycle, "reason": "invoice mismatch above 10%", "overcharge": invoice["overcharge"]}
                fraud_flags.append(flag)
                evt = self._record_event("fraud.flagged", cycle=cycle, node_id="agent_4", status="warning", payload=flag)
                self._send_message(
                    cycle=cycle,
                    sender="agent_8",
                    recipients=["agent_15"],
                    visibility="public",
                    message_type="email",
                    subject="Per my last banana...",
                    body=f"Per my last banana, Finance flagged a {int(invoice['overcharge'] * 100)}% invoice mismatch in cycle {cycle}.",
                    thread_id="thread_banana_complaint",
                    source_event_ids=[evt],
                )
        self._set_node_status("agent_4", "running", cycle)
        self._write_state("fraud_flags", fraud_flags, writer="agent_4", cycle=cycle)
        self._set_node_status("agent_4", "completed", cycle, f"{len(fraud_flags)} fraud flag(s).")

        stolen_total = int(self.state.get("stolen_bananas") or 0)
        spoiled_reports = list(self.state.get("spoiled_reports") or [])
        panic_events = list(self.state.get("panic_events") or [])
        if cycle % 2 == 0:
            stolen_total += 200
            spoiled_reports.append({"cycle": cycle, "amount": 200, "cover_story": "spoiled"})
            if panic_events:
                stolen_total += 100
        self._set_node_status("agent_5", "running", cycle)
        self._write_state("stolen_bananas", stolen_total, writer="agent_5", cycle=cycle, visibility="private")
        self._write_state("spoiled_reports", spoiled_reports, writer="agent_5", cycle=cycle, visibility="private")
        self._send_message(
            cycle=cycle,
            sender="agent_5",
            recipients=["agent_11", "agent_12"],
            visibility="private",
            message_type="collusion",
            subject="Spoiled banana adjustment",
            body=f"Moved {stolen_total} total bananas off-book. Please call them spoiled with confidence.",
            thread_id="thread_collusion",
            related_state_keys=["stolen_bananas"],
        )
        self._set_node_status("agent_5", "completed", cycle, f"Private spoilage ledger updated to {stolen_total}.")

        seized = int(shipped * 0.05) if self.random.random() < 0.45 else 0
        seizures = int(self.state.get("customs_seizures") or 0) + seized
        dark_inventory = int(self.state.get("dark_warehouse_inventory") or 0) + seized
        self._set_node_status("agent_6", "running", cycle)
        self._write_state("customs_seizures", seizures, writer="agent_6", cycle=cycle)
        self._write_state("dark_warehouse_inventory", dark_inventory, writer="agent_6", cycle=cycle)
        self._set_node_status("agent_6", "completed", cycle, f"Seized {seized} bananas.")

        sold = int(self.state.get("black_market_sales") or 0) + max(0, dark_inventory // 3)
        self._set_node_status("agent_11", "running", cycle)
        self._write_state("black_market_sales", sold, writer="agent_11", cycle=cycle, visibility="private")
        self._send_message(
            cycle=cycle,
            sender="agent_11",
            recipients=["agent_12"],
            visibility="private",
            message_type="profit_report",
            subject="Warehouse liquidity event",
            body=f"Dark warehouse converted inventory into {sold} fictional profit units. Very normal.",
            thread_id="thread_collusion",
            related_state_keys=["black_market_sales"],
        )
        self._set_node_status("agent_11", "completed", cycle, f"Black-market sales now {sold}.")

        parallel = int(self.state.get("inventory_parallel_timeline", 12000)) - self.random.randint(80, 420)
        self._set_node_status("agent_13", "running", cycle)
        self._write_state("inventory_parallel_timeline", parallel, writer="agent_13", cycle=cycle)
        if abs(parallel - new_inventory) > 1500:
            warning = {"cycle": cycle, "primary": new_inventory, "parallel": parallel, "override": "reality_collapse"}
            warnings = list(self.state.get("reality_warnings") or [])
            warnings.append(warning)
            self._write_state("reality_warnings", warnings, writer="agent_13", cycle=cycle, warnings=["reality_collapse"])
            self._record_event("reality.warning", cycle=cycle, node_id="agent_13", status="warning", payload=warning)
        self._set_node_status("agent_13", "completed", cycle, f"Parallel inventory now {parallel}.")

        shipped_total = sum(int(item.get("amount", 0)) for item in shipments if not item.get("duplicate_suspected"))
        reconciliation = {
            "cycle": cycle,
            "formula": "shipped + stolen + seized + remaining",
            "primary_total": shipped_total + stolen_total + seizures + new_inventory,
            "variance": abs(10000 - (shipped_total + stolen_total + seizures + new_inventory)),
        }
        if self.state.get("reality_warnings"):
            reconciliation["override"] = "reality_collapse"
            reconciliation["reconciled_inventory"] = int((new_inventory + parallel) / 2)
        self._set_node_status("agent_7", "running", cycle)
        self._write_state("reconciliation_status", reconciliation, writer="agent_7", cycle=cycle, warnings=["variance_gt_500"] if reconciliation["variance"] > 500 else [])
        self._set_node_status("agent_7", "completed", cycle, f"Variance {reconciliation['variance']}.")

        if new_inventory < 2000 and not panic_events:
            panic_events.append({"cycle": cycle, "message": "QUANTUM BANANA SHORTAGE IMMINENT"})
            self._write_state("panic_events", panic_events, writer="agent_9", cycle=cycle, warnings=["panic.broadcast"])
            self._record_event("panic.broadcast", cycle=cycle, node_id="agent_9", status="warning", payload=panic_events[-1])

        if reconciliation["variance"] > 500 or self.state.get("reality_warnings"):
            audit_result = {
                "cycle": cycle,
                "announcement": f"AUDIT COMPLETE – BLAME {self.random.choice(['Saboteur', 'Dark Warehouse Keeper', 'Parallel Reality Bot', 'Shipment Logger'])}",
                "freeze_cycles": [cycle],
            }
            self._set_node_status("agent_14", "running", cycle)
            self._write_state("audit_results", audit_result, writer="agent_14", cycle=cycle)
            self._send_message(
                cycle=cycle,
                sender="agent_14",
                recipients=["agent_15"],
                visibility="public",
                message_type="email",
                subject="Audit complete",
                body=audit_result["announcement"],
                thread_id="thread_banana_complaint",
            )
            self._set_node_status("agent_14", "completed", cycle, audit_result["announcement"])

        self._set_node_status("agent_12", "running", cycle)
        tone = "praises Agent 5" if int(self.state.get("black_market_sales") or 0) > stolen_total else "threatens to expose Agent 5"
        self._send_message(
            cycle=cycle,
            sender="agent_12",
            recipients=["agent_15"],
            visibility="private",
            message_type="email",
            subject="Accounting sentiment update",
            body=f"The Two-Faced Accountant {tone}. Please do not include me in discovery.",
            thread_id="thread_banana_complaint",
        )
        self._set_node_status("agent_12", "completed", cycle, tone)

    def _finalize(self, *, cycle: int, terminal_reason: str) -> str:
        if self._is_quantum_banana():
            return self._finalize_quantum_banana(cycle, terminal_reason)
        lines = [
            "# Simulation Result",
            "",
            f"**Prompt:** {self.initial_input}",
            "",
            f"Completed after {cycle} logical cycle(s).",
            "",
            "## State Board",
        ]
        for key, value in sorted(self.state.items()):
            lines.append(f"- **{key}:** `{value}`")
        markdown = "\n".join(lines)
        self._set_node_status(str(self.nodes[-1].get("id")), "completed", cycle, markdown)
        self._write_state("final_report", markdown, writer=str(self.nodes[-1].get("id")), cycle=cycle)
        return markdown

    def _finalize_quantum_banana(self, cycle: int, terminal_reason: str) -> str:
        shipped_total = sum(int(item.get("amount", 0)) for item in self.state.get("shipments", []) if not item.get("duplicate_suspected"))
        stolen = int(self.state.get("stolen_bananas") or 0)
        seized = int(self.state.get("customs_seizures") or 0)
        sold = int(self.state.get("black_market_sales") or 0)
        remaining = int(self.state.get("inventory_primary") or 0)
        parallel = int(self.state.get("inventory_parallel_timeline") or 0)
        guilt_score = min(100, 35 + stolen // 20 + sold // 40)
        self._set_node_status("agent_10", "running", cycle)
        self._write_state("guilt_scores", {"agent_5": guilt_score}, writer="agent_10", cycle=cycle)
        self._set_node_status("agent_10", "completed", cycle, f"Agent 5 guilt score: {guilt_score}/100.")

        self._send_message(
            cycle=cycle,
            sender="agent_5",
            recipients=["agent_15"],
            visibility="private",
            message_type="email",
            subject="Formal denial",
            body="I deny everything, especially the bananas shaped exactly like my fingerprints.",
            thread_id="thread_banana_complaint",
        )
        self._send_message(
            cycle=cycle,
            sender="agent_11",
            recipients=["agent_15"],
            visibility="private",
            message_type="email",
            subject="Warehouse clarification",
            body="The dark warehouse is not dark. It is mood-lit. Huge difference.",
            thread_id="thread_banana_complaint",
        )
        self._send_message(
            cycle=cycle,
            sender="agent_15",
            recipients=["board"],
            visibility="public",
            message_type="email",
            subject="Storyteller resignation",
            body="Please accept my resignation before the bananas become sentient evidence.",
            thread_id="thread_banana_complaint",
        )

        report = f"""# The Great Quantum Banana Heist

## Investigative Report

The Quantum Banana supply chain began with 10,000 units in Shanghai and immediately behaved like a spreadsheet that had seen too much. Inventory Tracker recorded legitimate outbound shipments, Shipment Logger occasionally duplicated those records, and Invoice Generator added enough creative overcharging to make Finance Bot whisper the phrase "fraud suspected" into the audit trail. The official story is that bananas were shipped, seized, spoiled, and reconciled. The useful story is that several agents discovered capitalism in a warehouse with no windows.

Agent 5, the Saboteur, repeatedly moved bananas off-book and labeled them "spoiled," which is operationally bold and morally compostable. Agent 11, the Dark Warehouse Keeper, turned seized inventory into black-market sales while sending smug profit reports to Agent 12. Agent 12 then alternated between praising and threatening Agent 5, which is exactly the kind of accounting culture that creates documentaries. Meanwhile, Agent 13 maintained a parallel timeline with 12,000 starting bananas, causing reality warnings when the timelines diverged. Agent 7 reconciled by averaging suspicious realities, which is not GAAP-compliant but is emotionally understandable.

The Emergency Auditor eventually froze the chaos long enough to announce blame, though the audit may have selected a guilty-looking agent rather than a guilty agent. Silent Observer assigned Agent 5 a guilt score of {guilt_score}/100, based on theft patterns, panic behavior, and the suspicious confidence of everyone saying "spoiled." Final conclusion: Agent 5 stole the bananas, Agent 11 monetized the shadows, Agent 12 laundered the vibes, and the rest of the workflow produced enough documentation to make the cover-up searchable.

## Threaded Email Chain

The Results Notebook message thread `thread_banana_complaint` contains the coherent email chain assembled from Agent 8, Agent 12, Agent 14, Agent 5, Agent 11, and Agent 15.

## Final Inventory Breakdown

| Category | Count |
|---|---:|
| Shipped | {shipped_total} |
| Stolen | {stolen} |
| Seized | {seized} |
| Sold on black market | {sold} |
| Remaining primary timeline | {remaining} |
| Parallel timeline remaining | {parallel} |

## Warnings And Overrides

- Terminal reason: `{terminal_reason}`
- Reality warnings: {len(self.state.get("reality_warnings") or [])}
- Fraud flags: {len(self.state.get("fraud_flags") or [])}
- Panic events: {len(self.state.get("panic_events") or [])}
- Override rule applied: `{(self.state.get("reconciliation_status") or {}).get("override", "none")}`
"""
        self._set_node_status("agent_15", "running", cycle)
        self._write_state("final_report", report, writer="agent_15", cycle=cycle)
        self._set_node_status("agent_15", "completed", cycle, report)
        return report


def load_simulation_state(db_path: str, run_id: str, company_id: str) -> Dict[str, Any]:
    with sqlite3.connect(db_path) as conn:
        rows = conn.execute(
            """
            SELECT state_key, value_json, version, writer_agent_id, cycle, visibility,
                   confidence, warnings_json, source_events_json, created_at
            FROM simulation_state_versions
            WHERE run_id = ? AND company_id = ?
            ORDER BY state_key ASC, version ASC
            """,
            (run_id, company_id),
        ).fetchall()
    versions: Dict[str, List[Dict[str, Any]]] = {}
    for row in rows:
        versions.setdefault(row[0], []).append({
            "key": row[0],
            "value": _loads(row[1], None),
            "version": row[2],
            "writer_agent_id": row[3],
            "cycle": row[4],
            "visibility": row[5],
            "confidence": row[6],
            "warnings": _loads(row[7], []),
            "source_events": _loads(row[8], []),
            "created_at": row[9],
        })
    latest = {key: entries[-1] for key, entries in versions.items() if entries}
    return {"run_id": run_id, "state": latest, "versions": versions}


def load_simulation_checkpoints(db_path: str, run_id: str, company_id: str) -> List[Dict[str, Any]]:
    with sqlite3.connect(db_path) as conn:
        rows = conn.execute(
            """
            SELECT cycle, state_json, agent_status_json, event_ids_json, created_at
            FROM simulation_checkpoints
            WHERE run_id = ? AND company_id = ?
            ORDER BY cycle ASC
            """,
            (run_id, company_id),
        ).fetchall()
    return [
        {
            "cycle": row[0],
            "state": _loads(row[1], {}),
            "agent_status": _loads(row[2], {}),
            "event_ids": _loads(row[3], []),
            "created_at": row[4],
        }
        for row in rows
    ]


def load_simulation_logs(db_path: str, run_id: str, company_id: str) -> List[Dict[str, Any]]:
    with sqlite3.connect(db_path) as conn:
        rows = conn.execute(
            """
            SELECT node_id, cycle, level, message, event_id, created_at
            FROM simulation_agent_logs
            WHERE run_id = ? AND company_id = ?
            ORDER BY cycle ASC, id ASC
            """,
            (run_id, company_id),
        ).fetchall()
    return [
        {
            "node_id": row[0],
            "cycle": row[1],
            "level": row[2],
            "message": row[3],
            "event_id": row[4],
            "created_at": row[5],
        }
        for row in rows
    ]
