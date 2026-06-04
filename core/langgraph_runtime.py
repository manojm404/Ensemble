"""
LangGraph-backed execution runtime for Esemble workflows.

This module keeps the public workflow contracts stable while moving the
execution scheduler, checkpointing, and resumability onto LangGraph for the
common DAG path.
"""

from __future__ import annotations

import operator
import time
from typing import Any, Dict, List, Optional, TypedDict, Annotated

LANGGRAPH_AVAILABLE = False
StateGraph = None
START = None
END = None
MemorySaver = None

try:  # pragma: no cover - import guard
    from langgraph.checkpoint.memory import MemorySaver as _MemorySaver
    from langgraph.graph import END as _END, START as _START, StateGraph as _StateGraph

    MemorySaver = _MemorySaver
    StateGraph = _StateGraph
    START = _START
    END = _END
    LANGGRAPH_AVAILABLE = True
except Exception:  # pragma: no cover - keep the app running without the optional runtime
    LANGGRAPH_AVAILABLE = False


class WorkflowRuntimeState(TypedDict, total=False):
    workflow_id: str
    run_id: str
    company_id: str
    initial_input: str
    runtime_engine: str
    current_node: str
    current_node_label: str
    failed_node: str
    failed_reason: str
    completed_nodes: Annotated[List[str], operator.add]


def supports_langgraph_workflow(nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]], resume_from_node: Optional[str] = None) -> bool:
    """Return True when the current graph is a clean DAG path that LangGraph can safely execute."""
    if not LANGGRAPH_AVAILABLE:
        return False
    if resume_from_node:
        return False
    if not nodes:
        return False
    if any((node.get("type") or "").lower() == "switchnode" for node in nodes):
        return False
    if any(bool(edge.get("data", {}).get("isLoopBack")) for edge in edges):
        return False
    return True


class LangGraphWorkflowRunner:
    """
    Execute a workflow graph with LangGraph while delegating node execution to
    the existing DAG engine implementation.
    """

    def __init__(self, engine: Any):
        self.engine = engine

    def _build_terminal_nodes(self, nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]]) -> List[str]:
        node_ids = {str(node.get("id")) for node in nodes if node.get("id")}
        sources = {
            str(edge.get("source"))
            for edge in edges
            if edge.get("source") and not bool(edge.get("data", {}).get("isLoopBack"))
        }
        return [node_id for node_id in node_ids if node_id and node_id not in sources]

    def _build_root_nodes(self, nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]]) -> List[str]:
        node_ids = {str(node.get("id")) for node in nodes if node.get("id")}
        targets = {
            str(edge.get("target"))
            for edge in edges
            if edge.get("target") and not bool(edge.get("data", {}).get("isLoopBack"))
        }
        return [node_id for node_id in node_ids if node_id and node_id not in targets]

    def _build_langgraph_app(
        self,
        workflow_id: str,
        run_id: str,
        nodes: List[Dict[str, Any]],
        edges: List[Dict[str, Any]],
        initial_input: Optional[str],
        assistant_id: Optional[str],
        topic_id: Optional[str],
    ):
        if not LANGGRAPH_AVAILABLE:
            raise RuntimeError("LangGraph runtime is unavailable")

        node_map = {str(node.get("id")): node for node in nodes if node.get("id")}
        builder = StateGraph(WorkflowRuntimeState)

        for node_id, node in node_map.items():
            async def _run_node(state: WorkflowRuntimeState, _node_id: str = node_id, _node: Dict[str, Any] = node):
                success, branch_info = await self.engine._execute_node(
                    run_id=run_id,
                    workflow_id=workflow_id,
                    node=_node,
                    node_map=node_map,
                    edges=edges,
                    assistant_id=assistant_id,
                    topic_id=topic_id,
                    initial_input=initial_input,
                )
                if not success:
                    raise RuntimeError(f"Workflow node {_node_id} failed")
                node_label = str((_node.get("data") or {}).get("label") or (_node.get("data") or {}).get("role") or _node_id)
                update: WorkflowRuntimeState = {
                    "current_node": _node_id,
                    "current_node_label": node_label,
                    "completed_nodes": [_node_id],
                    "runtime_engine": "langgraph",
                }
                if branch_info and branch_info.get("type") == "switch":
                    update["failed_reason"] = ""
                return update

            builder.add_node(node_id, _run_node)

        for root_id in self._build_root_nodes(nodes, edges):
            builder.add_edge(START, root_id)

        for edge in edges:
            if bool(edge.get("data", {}).get("isLoopBack")):
                continue
            source = edge.get("source")
            target = edge.get("target")
            if source in node_map and target in node_map:
                builder.add_edge(source, target)

        for terminal_id in self._build_terminal_nodes(nodes, edges):
            builder.add_edge(terminal_id, END)

        return builder.compile(checkpointer=MemorySaver())

    async def run(
        self,
        workflow_id: str,
        run_id: str,
        nodes: List[Dict[str, Any]],
        edges: List[Dict[str, Any]],
        company_id: str,
        initial_input: Optional[str] = None,
        assistant_id: Optional[str] = None,
        topic_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        self.engine.company_id = company_id

        if initial_input:
            self.engine.space.write(initial_input.encode(), "user_initial_input", "start", self.engine.company_id)
            self.engine.audit.log(self.engine.company_id, "human_user", "USER_INPUT", {"text": initial_input})

        self.engine._init_run(workflow_id, run_id, nodes)
        self.engine._record_run_event(
            run_id,
            workflow_id,
            "run_started",
            status="running",
            payload={
                "node_count": len(nodes),
                "edge_count": len(edges),
                "task": initial_input or "",
                "runtime_engine": "langgraph",
            },
        )

        app = self._build_langgraph_app(
            workflow_id=workflow_id,
            run_id=run_id,
            nodes=nodes,
            edges=edges,
            initial_input=initial_input,
            assistant_id=assistant_id,
            topic_id=topic_id,
        )

        try:
            await app.ainvoke(
                {
                    "workflow_id": workflow_id,
                    "run_id": run_id,
                    "company_id": company_id,
                    "initial_input": initial_input or "",
                    "runtime_engine": "langgraph",
                    "completed_nodes": [],
                },
                config={"configurable": {"thread_id": run_id}},
            )
        except Exception as exc:
            self.engine._update_run_status(run_id, "failed")
            self.engine._record_run_event(
                run_id,
                workflow_id,
                "run_failed",
                status="failed",
                payload={"runtime_engine": "langgraph", "error": str(exc)},
            )
            raise

        self.engine._update_run_status(run_id, "completed")
        self.engine._record_run_event(run_id, workflow_id, "run_completed", status="completed", payload={"runtime_engine": "langgraph"})
        return {"status": "completed", "run_id": run_id, "runtime_engine": "langgraph"}
