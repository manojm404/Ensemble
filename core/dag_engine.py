"""
core/dag_engine.py
DAG-based Workflow Engine for Ensemble V2.

Executes workflows defined as directed acyclic graphs (DAGs) where:
- Nodes = agents with roles, instructions, and capabilities
- Edges = execution order (topological sort)
- Artifacts = CAS-committed outputs passed between nodes

Follows AGENTS.md rules: CAS commits, audit logging, budget checks, handover protocol.
"""
import hashlib
import json
import sqlite3
import time
import asyncio
import uuid
import zlib
from enum import Enum
from typing import Dict, Any, List, Optional, Set, Tuple
from core.managed_agent import ManagedAgent
from core.ensemble_space import EnsembleSpace
from core.audit import AuditLogger
from core.llm_provider import LLMProvider


class WorkflowState(Enum):
    IDLE = "idle"
    RUNNING = "running"
    PAUSED_FOR_APPROVAL = "paused_approval"
    COMPLETED = "completed"
    FAILED = "failed"


class DAGWorkflowEngine:
    """
    DAG-based workflow executor that:
    1. Parses canvas graph_json (nodes + edges)
    2. Performs topological sort for execution order
    3. Executes agents sequentially with CAS artifact passing
    4. Creates snapshots at each step for Time Machine
    5. Supports resume from failure
    """

    def __init__(self, space: EnsembleSpace, audit: AuditLogger, llm: LLMProvider, gov: Any):
        self.space = space
        self.audit = audit
        self.llm = llm
        self.gov = gov
        self.company_id = "company_alpha"
        self._locks: Dict[str, bool] = {}  # workflow_id -> locked

    def _acquire_lock(self, workflow_id: str) -> bool:
        """Acquire mutex lock to prevent overlapping runs."""
        if self._locks.get(workflow_id, False):
            return False
        self._locks[workflow_id] = True
        return True

    def _release_lock(self, workflow_id: str):
        """Release mutex lock."""
        self._locks.pop(workflow_id, None)

    @staticmethod
    def topological_sort(nodes: List[Dict], edges: List[Dict]) -> List[str]:
        """
        Topological sort of DAG nodes.
        Returns execution order as list of node IDs.
        Raises ValueError if cycle detected.
        """
        node_ids = {n["id"] for n in nodes}
        adjacency: Dict[str, List[str]] = {nid: [] for nid in node_ids}
        in_degree: Dict[str, int] = {nid: 0 for nid in node_ids}

        for edge in edges:
            src, tgt = edge["source"], edge["target"]
            if src in node_ids and tgt in node_ids:
                adjacency[src].append(tgt)
                in_degree[tgt] += 1

        # Kahn's algorithm
        queue = [nid for nid in node_ids if in_degree[nid] == 0]
        order = []

        while queue:
            node = queue.pop(0)
            order.append(node)
            for neighbor in adjacency[node]:
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)

        if len(order) != len(node_ids):
            raise ValueError("Cycle detected in workflow graph — topological sort impossible")

        return order

    @staticmethod
    def detect_cycles(nodes: List[Dict], edges: List[Dict]) -> bool:
        """Detect if the graph has cycles (invalid for DAG execution)."""
        try:
            DAGWorkflowEngine.topological_sort(nodes, edges)
            return False
        except ValueError:
            return True

    async def _expand_macros(self, nodes: List[Dict], edges: List[Dict], visited_macros: Set[str] = None) -> Tuple[List[Dict], List[Dict]]:
        """
        Recursively flattens macroNode types into their sub-graphs.
        
        Args:
            nodes: List of nodes in the current graph level
            edges: List of edges in the current graph level
            visited_macros: Set of macro_ids encountered to detect cycles (Chaos Test)
        """
        visited_macros = visited_macros or set()
        new_nodes = []
        new_edges = []
        
        has_macros = any(n.get("type") == "macroNode" for n in nodes)
        if not has_macros:
            return nodes, edges

        for node in nodes:
            if node.get("type") != "macroNode":
                new_nodes.append(node)
                continue
            
            # --- MACRO EXPANSION ---
            macro_id = node.get("data", {}).get("macro_id")
            version = node.get("data", {}).get("version", "latest")
            instance_uuid = f"m_{uuid.uuid4().hex[:6]}" # Recursive ID Collision Guard
            
            if not macro_id:
                print(f"⚠️ [DAG Engine] Macro node {node['id']} missing macro_id. Skipping expansion.", flush=True)
                new_nodes.append(node)
                continue
                
            # Circular Dependency Protection (Chaos Test)
            if macro_id in visited_macros:
                raise ValueError(f"Circular macro dependency detected: {macro_id} is nested within itself.")
            
            # Fetch sub-graph from governance
            sub_graph = self.gov.get_macro(macro_id) # Should return {nodes, edges}
            if not sub_graph:
                print(f"⚠️ [DAG Engine] Macro {macro_id} not found in registry. Skipping expansion.", flush=True)
                new_nodes.append(node)
                continue
            
            print(f"📦 [DAG Engine] Expanding macro '{macro_id}' (Instance: {instance_uuid})", flush=True)
            
            # Recursive expansion for nested macros
            sub_nodes, sub_edges = await self._expand_macros(
                sub_graph.get("nodes", []), 
                sub_graph.get("edges", []), 
                visited_macros | {macro_id}
            )
            
            # 1. Prefix sub-nodes with instance UUID to prevent collisions
            prefixed_sub_nodes = []
            for sn in sub_nodes:
                new_sn = json.loads(json.dumps(sn)) # Deep copy
                new_sn["id"] = f"{instance_uuid}_{sn['id']}"
                # Preserve data lineage in metadata for UI clustering
                new_sn["data"] = {
                    **new_sn.get("data", {}), 
                    "macro_instance_id": instance_uuid, 
                    "parent_macro_id": macro_id
                }
                prefixed_sub_nodes.append(new_sn)
            
            # 2. Map entrance and exit nodes of the sub-graph
            # Entrance = no incoming edges within sub-graph
            sub_node_ids = {sn["id"] for sn in prefixed_sub_nodes}
            sub_targets = {f"{instance_uuid}_{e['target']}" for e in sub_edges}
            entrance_nodes = [sn["id"] for sn in prefixed_sub_nodes if sn["id"] not in sub_targets]
            
            # Exit = no outgoing edges within sub-graph
            sub_sources = {f"{instance_uuid}_{e['source']}" for e in sub_edges}
            exit_nodes = [sn["id"] for sn in prefixed_sub_nodes if sn["id"] not in sub_sources]
            
            # 3. Add prefixed sub-nodes to current batch
            new_nodes.extend(prefixed_sub_nodes)
            
            # 4. Add prefixed sub-edges
            for se in sub_edges:
                new_se = json.loads(json.dumps(se))
                new_se["id"] = f"{instance_uuid}_{se.get('id', uuid.uuid4().hex[:6])}"
                new_se["source"] = f"{instance_uuid}_{se['source']}"
                new_se["target"] = f"{instance_uuid}_{se['target']}"
                new_edges.append(new_se)
            
            # 5. Rewire host edges that were connected to the macroNode
            # Incoming to MacroNode -> Entrance Nodes of Sub-Graph
            for h_edge in edges:
                if h_edge["target"] == node["id"]:
                    for ent_id in entrance_nodes:
                        new_edges.append({
                            **h_edge,
                            "id": f"edge_{h_edge['id']}_{ent_id}",
                            "target": ent_id
                        })
                
                # Outgoing from MacroNode -> Children of the Host Graph
                if h_edge["source"] == node["id"]:
                    for ext_id in exit_nodes:
                        new_edges.append({
                            **h_edge,
                            "id": f"edge_{ext_id}_{h_edge['id']}",
                            "source": ext_id
                        })

        # Add remaining host edges that are not connected to macroNodes
        macro_ids = {n["id"] for n in nodes if n.get("type") == "macroNode"}
        for h_edge in edges:
            if h_edge["source"] not in macro_ids and h_edge["target"] not in macro_ids:
                new_edges.append(h_edge)
                
        return new_nodes, new_edges

    async def execute_workflow(
        self,
        workflow_id: str,
        graph_json: Dict[str, Any],
        company_id: str = "company_alpha",
        run_id: str = None,
        initial_input: str = None,
        assistant_id: str = None,
        topic_id: str = None,
        resume_from_node: str = None,
    ) -> Dict[str, Any]:
        """
        Execute a DAG workflow.
        """
        self.company_id = company_id
        nodes = graph_json.get("nodes", [])
        edges = graph_json.get("edges", [])

        if not nodes:
            raise ValueError("Workflow graph has no nodes")

        # --- V3 MACRO EXPANSION ---
        try:
            nodes, edges = await self._expand_macros(nodes, edges)
            print(f"📉 [DAG Engine] Flattened DAG: {len(nodes)} nodes, {len(edges)} edges", flush=True)
        except ValueError as e:
            raise ValueError(f"Macro Expansion Failed: {str(e)}")

        # Cycle detection
        if self.detect_cycles(nodes, edges):
            raise ValueError("Workflow graph contains cycles — cannot execute DAG")

        # Acquire lock
        if not self._acquire_lock(workflow_id):
            raise RuntimeError(f"Workflow {workflow_id} is already running (mutex lock)")

        run_id = run_id or f"run_{int(time.time())}"

        try:
            # 📝 HOTFIX: Ensure initial_input is recorded in CAS for all nodes to see
            if initial_input:
                self.space.write(initial_input.encode(), "user_initial_input", "start", self.company_id)
                self.audit.log(self.company_id, "human_user", "USER_INPUT", {"text": initial_input})
                print(f"📥 [DAG Engine] Recorded user task: {initial_input[:50]}...", flush=True)

            # Always initialize the run record
            self._init_run(workflow_id, run_id, nodes)

            # Build node lookup and edge adjacency
            node_map = {n["id"]: n for n in nodes}
            completed_nodes: Set[str] = set()
            pruned_nodes: Set[str] = set()
            
            print(f"🔀 [DAG Engine] Starting Dynamic Execution (V3 Protocol)", flush=True)

            while len(completed_nodes | pruned_nodes) < len(nodes):
                # 1. Identify nodes that are "Ready" (all parents are completed or pruned)
                ready_ids = self._get_ready_nodes(nodes, edges, completed_nodes, pruned_nodes)
                
                if not ready_ids:
                    print(f"🏁 [DAG Engine] Execution halted. Total: {len(nodes)}, Done: {len(completed_nodes)}, Pruned: {len(pruned_nodes)}", flush=True)
                    break
                
                print(f"🚀 [DAG Engine] Batch: Executing {len(ready_ids)} nodes in parallel", flush=True)
                
                # 2. Execute all ready nodes concurrently
                tasks = [
                    self._execute_node(
                        run_id=run_id,
                        workflow_id=workflow_id,
                        node=node_map[nid],
                        node_map=node_map,
                        edges=edges,
                        assistant_id=assistant_id,
                        topic_id=topic_id,
                        initial_input=initial_input,
                    )
                    for nid in ready_ids
                ]
                
                results = await asyncio.gather(*tasks)
                
                # 3. Process results and handle branching
                for nid, (success, branch_info) in zip(ready_ids, results):
                    if success:
                        completed_nodes.add(nid)
                        if branch_info and branch_info.get("type") == "switch":
                            # Prune non-selected branches
                            self._prune_branches(branch_info["prune_targets"], edges, pruned_nodes)
                    else:
                        print(f"❌ [DAG Engine] Node {nid} failed. Halting workflow.", flush=True)
                        self._update_run_status(run_id, WorkflowState.FAILED.value)
                        return {"status": "failed", "run_id": run_id, "failed_node": nid}

            # All required nodes completed
            self._update_run_status(run_id, WorkflowState.COMPLETED.value)
            print(f"✅ [DAG Engine] Workflow {workflow_id} completed successfully", flush=True)
            return {"status": "completed", "run_id": run_id}

        finally:
            self._release_lock(workflow_id)

    def _get_ready_nodes(self, nodes: List[Dict], edges: List[Dict], completed_nodes: Set[str], pruned_nodes: Set[str]) -> List[str]:
        """Nodes where all predecessors are in (completed | pruned) and node itself is not in either."""
        ready = []
        for node in nodes:
            nid = node["id"]
            if nid in completed_nodes or nid in pruned_nodes:
                continue
            
            predecessors = [e["source"] for e in edges if e["target"] == nid]
            if not predecessors:
                ready.append(nid)
            elif all(p in (completed_nodes | pruned_nodes) for p in predecessors):
                # If all parents are pruned, this node also becomes pruned
                if all(p in pruned_nodes for p in predecessors) and predecessors:
                    pruned_nodes.add(nid)
                    continue
                ready.append(nid)
        return ready

    def _prune_branches(self, targets: List[str], edges: List[Dict], pruned_nodes: Set[str]):
        """Recursively mark branches as pruned."""
        to_prune = list(targets)
        while to_prune:
            nid = to_prune.pop(0)
            if nid not in pruned_nodes:
                pruned_nodes.add(nid)
                # Find children
                children = [e["target"] for e in edges if e["source"] == nid]
                to_prune.extend(children)

    async def _execute_node(
        self,
        run_id: str,
        workflow_id: str,
        node: Dict[str, Any],
        node_map: Dict[str, Dict],
        edges: List[Dict],
        assistant_id: str = None,
        topic_id: str = None,
        initial_input: str = None,
    ) -> Tuple[bool, Optional[Dict]]:
        """
        Execute a single node in the DAG.
        Returns (success, branch_info)
        """
        node_id = node["id"]
        node_type = node.get("type", "stateNode")
        node_data = node.get("data", {})
        role = node_data.get("role", "Assistant")
        instruction = node_data.get("instruction", "")

        # GLOBAL PANIC CHECK
        if self.gov.is_panic:
            print(f"🛑 [DAG Engine] Node {node_id} ABORTED due to PANIC signal.", flush=True)
            self._update_node_status(run_id, node_id, "failed")
            return False, None

        print(f"⚙️ [DAG Engine] Executing node '{node_id}' (type: {node_type}, role: {role})", flush=True)

        # Update node status to RUNNING
        self._update_node_status(run_id, node_id, "running")

        # --- CASE 1: APPROVAL NODE ---
        if node_type == "approvalNode":
            print(f"⚖️ [DAG Engine] Node {node_id} is an APPROVAL GATE. Pausing...", flush=True)
            self._update_node_status(run_id, node_id, "paused_approval")
            
            # Request human approval via governance
            details = {"workflow_id": workflow_id, "run_id": run_id, "node_id": node_id}
            approved = await self.gov.request_human_approval(
                agent_id=f"approval_{node_id}",
                action="DAG_EXECUTION_STEP",
                details=details,
                reason=node_data.get("label", "Manual checkpoint required")
            )
            
            if approved:
                print(f"✅ [DAG Engine] Node {node_id} APPROVED. Continuing.", flush=True)
                self._update_node_status(run_id, node_id, "completed")
                return True, None
            else:
                print(f"❌ [DAG Engine] Node {node_id} DENIED or PANIC. Halting.", flush=True)
                self._update_node_status(run_id, node_id, "failed")
                return False, None

        # --- CASE 2: STANDARD STATE NODE ---
        # 1. Check budget before execution
        budget = self.gov.get_company_budget_status(self.company_id)
        if budget["spent"] >= budget["limit"]:
            print(f"❌ [DAG Engine] Budget exhausted for node {node_id}", flush=True)
            self._update_node_status(run_id, node_id, "failed")
            return False, None

        # 2. Assemble input context
        context = self._assemble_node_context(run_id, node_id, node_map, edges, initial_input)

        # 3. Create and run agent
        agent_id = f"{role.lower().replace(' ', '_')}_{node_id}_{int(time.time())}"
        agent = ManagedAgent(
            agent_id=agent_id,
            company_id=self.company_id,
            system_prompt=instruction,
            gov=self.gov,
            audit=self.audit,
            llm=self.llm,
        )
        self.gov.register_agent(agent.agent_id, self.company_id, role)

        try:
            # Check panic again right before LLM call
            if self.gov.is_panic: return False, None

            response = await agent.run(f"Instruction: {instruction}\nContext: {context}")

            if "Execution aborted" in response or "Budget exhausted" in response:
                print(f"⏸️ [DAG Engine] Node {node_id} paused/aborted", flush=True)
                self._update_node_status(run_id, node_id, "failed")
                return False, None

            # 4. Commit output artifact to CAS
            artifact_hash = self.space.write(response.encode(), f"{node_id}_output", node_id, self.company_id)
            print(f"📦 [DAG Engine] Artifact committed: {artifact_hash[:16]}...", flush=True)

            # 5. Generate handover summary (AGENTS.md compliance)
            handover = self._generate_handover_summary(node_id, role, response)
            self.space.write(handover.encode(), f"{node_id}_handover", node_id, self.company_id)

            # 6. Create snapshot for Time Machine
            self._create_snapshot(run_id, node_id, artifact_hash, "completed")

            # 7. Broadcast RESULT event
            self.audit.log(
                self.company_id,
                agent_id,
                "RESULT",
                {"result": response, "agent_id": agent_id, "node_id": node_id, "artifact_hash": artifact_hash},
                broadcast=True,
            )

            # 8. Mirror to physical deliverables folder (if Architect/Planner)
            self._mirror_to_deliverables(run_id, node_id, role, response)

            # 9. Auto-detect Web Deliverables (for Workspace Preview)
            if "<!DOCTYPE html>" in response or "<html>" in response.lower():
                print(f"🌐 [DAG Engine] Web deliverable detected for node {node_id}. Auto-saving index.html", flush=True)
                # Extract HTML content if it's wrapped in markdown blocks
                html_content = response
                if "```html" in response:
                    html_content = response.split("```html")[1].split("```")[0].strip()
                elif "```" in response:
                    html_content = response.split("```")[1].split("```")[0].strip()
                # Save to data/workspace/preview.html for the UI to pick up
                preview_path = os.path.join("data", "workspace", "preview.html")
                os.makedirs(os.path.dirname(preview_path), exist_ok=True)
                with open(preview_path, "w") as f:
                    f.write(html_content)
                print(f"🌐 [DAG Engine] Web deliverable saved to preview.html", flush=True)

            # Update node status
            self._update_node_status(run_id, node_id, "completed")
            self._update_run_status(run_id, "running", node_id, agent_id)

            # --- V3 SWITCH LOGIC ---
            if node_type == "switchNode":
                import re
                condition = node_data.get("condition", "")
                print(f"🔀 [DAG Engine] Switch Node '{node_id}' logic check: '{condition}'", flush=True)
                
                # Simple regex branching: "If output contains 'X' -> case1"
                match = re.search(r"contains ['\"](.+)['\"]\s*->\s*([\w.-]+)", condition)
                prune_targets = []
                if match:
                    pattern, selected_handle = match.groups()
                    if pattern.lower() in response.lower():
                        # Pick matching handle's targets, prune others
                        all_edges = [e for e in edges if e["source"] == node_id]
                        for e in all_edges:
                            if e.get("sourceHandle") != selected_handle:
                                prune_targets.append(e["target"])
                    else:
                        # Fallback: prune case handles, keep default (unlabeled)
                        all_edges = [e for e in edges if e["source"] == node_id]
                        for e in all_edges:
                            if e.get("sourceHandle"): # If it has a case label, prune it
                                prune_targets.append(e["target"])
                
                return True, {"type": "switch", "prune_targets": prune_targets}

            return True, None

        except Exception as e:
            print(f"❌ [DAG Engine] Node {node_id} failed: {e}", flush=True)
            self._update_node_status(run_id, node_id, "failed")
            self.audit.log(self.company_id, node_id, "NODE_FAILURE", {"error": str(e)})
            return False, None

        finally:
            self.gov.deregister_agent(agent_id)

    def _assemble_node_context(
        self, run_id: str, node_id: str, node_map: Dict, edges: List[Dict], initial_input: str = None
    ) -> str:
        """
        Assemble input context for a node from:
        1. Initial user input (if first node)
        2. Predecessor artifacts from CAS
        3. Handover summaries from previous nodes
        """
        context_parts = []

        # 1. Include initial user task/goal (Universal context)
        if self.space.exists("user_initial_input"):
            input_val = self.space.read("user_initial_input").decode("utf-8", errors="ignore")
            context_parts.append(f"### PROJECT GOAL / TASK:\n{input_val}")

        # Get predecessor artifacts using the passed edges list
        predecessors = self._get_predecessors(node_id, edges)
        for pred_id in predecessors:
            artifact_name = f"{pred_id}_output"
            if self.space.exists(artifact_name):
                content = self.space.read(artifact_name).decode("utf-8", errors="ignore")
                # Context pruning: limit to 8000 chars
                if len(content) > 8000:
                    content = f"{content[:4000]}\n... [truncated] ...\n{content[-4000:]}"
                context_parts.append(f"### Previous Node ({pred_id}) Output:\n{content}")

            # Include handover summary
            handover_name = f"{pred_id}_handover"
            if self.space.exists(handover_name):
                handover = self.space.read(handover_name).decode("utf-8", errors="ignore")
                context_parts.append(f"### Handover Summary ({pred_id}):\n{handover}")

        context_str = "\n\n".join(context_parts) if context_parts else "No previous context."
        print(f"📝 [DAG Engine] Context for {node_id}: {len(context_str)} chars, predecessors: {predecessors}", flush=True)
        return context_str

    def _get_predecessors(self, node_id: str, edges: List[Dict]) -> List[str]:
        """Get list of predecessor node IDs for a given node using the edges list."""
        predecessors = []
        for edge in edges:
            if edge["target"] == node_id:
                predecessors.append(edge["source"])
        return predecessors

    def _generate_handover_summary(self, node_id: str, role: str, response: str) -> str:
        """
        Generate a handover summary (max 500 tokens) for the node's output.
        Per AGENTS.md: distill key decisions, trade-offs, and open questions.
        """
        # Simple summarization: extract key points (truncate to ~500 chars)
        summary_lines = [
            f"Node: {node_id} | Role: {role}",
            f"Key Output: {response[:300]}...",
            f"Status: Completed",
        ]
        return "\n".join(summary_lines)

    def _init_run(self, workflow_id: str, run_id: str, nodes: List[Dict]):
        """Initialize a new workflow run in the database."""
        with sqlite3.connect(self.gov.db_path) as conn:
            conn.execute(
                """INSERT OR REPLACE INTO executions 
                   (run_id, workflow_id, status, current_node, started_at)
                   VALUES (?, ?, ?, ?, ?)""",
                (run_id, workflow_id, "running", nodes[0]["id"], time.strftime("%Y-%m-%dT%H:%M:%SZ")),
            )

    def _update_run_status(self, run_id: str, status: str, current_node: str = None, agent_id: str = None):
        """Update the execution run status."""
        with sqlite3.connect(self.gov.db_path) as conn:
            if current_node and agent_id:
                conn.execute(
                    "UPDATE executions SET status = ?, current_node = ?, last_agent_id = ? WHERE run_id = ?",
                    (status, current_node, agent_id, run_id),
                )
            else:
                conn.execute("UPDATE executions SET status = ? WHERE run_id = ?", (status, run_id))

    def _update_node_status(self, run_id: str, node_id: str, status: str):
        """Update individual node execution status."""
        with sqlite3.connect(self.gov.db_path) as conn:
            conn.execute(
                """INSERT OR REPLACE INTO node_executions 
                   (run_id, node_id, status, updated_at)
                   VALUES (?, ?, ?, ?)""",
                (run_id, node_id, status, time.strftime("%Y-%m-%dT%H:%M:%SZ")),
            )

    def _create_snapshot(self, run_id: str, node_id: str, artifact_hash: str, status: str, graph_state: Dict = None):
        """Create a compressed execution snapshot for Time Machine."""
        compressed_state = None
        if graph_state:
            compressed_state = zlib.compress(json.dumps(graph_state).encode())

        with sqlite3.connect(self.gov.db_path) as conn:
            conn.execute(
                """INSERT INTO snapshots 
                   (run_id, node_id, artifact_hash, graph_state_compressed, status, created_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (run_id, node_id, artifact_hash, compressed_state, status, time.strftime("%Y-%m-%dT%H:%M:%SZ")),
            )

    def _get_completed_nodes(self, run_id: str) -> List[str]:
        """Get list of successfully completed node IDs for a run."""
        with sqlite3.connect(self.gov.db_path) as conn:
            cursor = conn.execute(
                "SELECT node_id FROM node_executions WHERE run_id = ? AND status = 'completed'",
                (run_id,),
            )
            return [row[0] for row in cursor.fetchall()]

    def _mirror_to_deliverables(self, run_id: str, node_id: str, role: str, content: str):
        """
        Mirror node output to a physical file in 'deliverables/' for easy access.
        Supports specific filename detection via 'FILE: filename.ext' marker.
        """
        import os
        from pathlib import Path
        import re

        # Role filter for physical mirroring
        target_roles = ["architect", "planner", "designer", "product_manager", "writer", "developer", "coder"]
        if not any(r in role.lower() for r in target_roles):
            return

        try:
            # Create directory: deliverables/run_123/
            base_dir = Path("deliverables") / run_id
            base_dir.mkdir(parents=True, exist_ok=True)

            # Detect specific filename override
            filename_match = re.search(r"FILE:\s*([\w.-]+)", content)
            if filename_match:
                filename = filename_match.group(1)
            else:
                # Sanitize default filename
                filename = f"{node_id}_{role.lower().replace(' ', '_')}.md"
            
            file_path = base_dir / filename

            # Write content
            with open(file_path, "w") as f:
                f.write(content)

            print(f"📁 [DAG Engine] Mirrored deliverable to: {file_path}", flush=True)
            self.audit.log(self.company_id, node_id, "DELIVERABLE_EXPORTED", {"path": str(file_path)})

        except Exception as e:
            print(f"⚠️ [DAG Engine] Failed to mirror deliverable: {e}", flush=True)
