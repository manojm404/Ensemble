"""
core/dag_engine.py
DAG-based Workflow Engine for Esemble V2.

Executes workflows defined as directed acyclic graphs (DAGs) where:
- Nodes = agents with roles, instructions, and capabilities
- Edges = execution order (topological sort)
- Artifacts = CAS-committed outputs passed between nodes

Follows AGENTS.md rules: CAS commits, audit logging, budget checks, handover protocol.
"""
import hashlib
import json
import os
import re
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
from core.workflows.messages import AgentMessage, AgentMessageLedger, AgentMessageValidationError
from core.langgraph_runtime import LangGraphWorkflowRunner, supports_langgraph_workflow


def _model_provider(model: Optional[str]) -> Optional[str]:
    """Infer provider family from a model id."""
    if not model:
        return None
    lower = model.lower()
    if lower.startswith("gemini"):
        return "gemini"
    if lower.startswith("gpt-") or lower.startswith("o") or lower.startswith("deepseek-v3"):
        return "openai"
    if lower.startswith("llama") or lower.startswith("openai/gpt-oss") or "groq" in lower or "distill-llama" in lower:
        return "groq"
    return None


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
        self.company_id = "user:anonymous"
        self._locks: Dict[str, bool] = {}  # workflow_id -> locked
        self._run_node_meta: Dict[str, Dict[str, Dict[str, str]]] = {}

    def _acquire_lock(self, workflow_id: str) -> bool:
        """Acquire mutex lock to prevent overlapping runs."""
        if self._locks.get(workflow_id, False):
            return False
        self._locks[workflow_id] = True
        return True

    def _release_lock(self, workflow_id: str):
        """Release mutex lock."""
        self._locks.pop(workflow_id, None)

    def _should_use_langgraph_runtime(self, nodes: List[Dict], edges: List[Dict], resume_from_node: Optional[str] = None) -> bool:
        """Use LangGraph for clean DAG workflows that do not require loop-back handling."""
        if resume_from_node:
            return False
        return supports_langgraph_workflow(nodes, edges, resume_from_node=resume_from_node)

    def _load_skill_instruction(self, role_id: str) -> str:
        """Load skill instruction from skill registry using role_id."""
        import os
        import re
        
        # First try to find matching skill in the registry
        try:
            all_skills = self.gov.skill_registry.list_skills() if hasattr(self.gov, 'skill_registry') else []
            for skill in all_skills:
                skill_id = skill.get("id", "")
                skill_name = skill.get("name", "").lower()
                role_lower = role_id.lower()
                
                # Match by ID or name
                if skill_id == role_id or skill_id in role_lower or role_lower in skill_id:
                    # Found matching skill, load its file
                    skills_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "skills")
                    # Find the file for this skill
                    for fname in os.listdir(skills_dir):
                        if fname.endswith(".md"):
                            file_path = os.path.join(skills_dir, fname)
                            with open(file_path, "r", encoding="utf-8") as f:
                                content = f.read()
                            # Check if this file's frontmatter name matches
                            fm_match = re.match(r'^---\s*\nname:\s*(.+)', content)
                            if fm_match and fm_match.group(1).strip().lower() in role_lower:
                                # Extract body after frontmatter
                                body_match = re.match(r'^---\s*\n.*?\n---\s*\n(.*)$', content, re.DOTALL)
                                if body_match:
                                    return body_match.group(1).strip()
                                return content
        except Exception as e:
            print(f"⚠️ [DAG Engine] Skill registry lookup failed: {e}", flush=True)
        
        # Fallback: try to load directly from skills/ directory by filename
        skills_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "skills")
        if not os.path.exists(skills_dir):
            return ""
        
        # Try exact filename match
        skill_file = os.path.join(skills_dir, f"{role_id}.md")
        if os.path.exists(skill_file):
            try:
                with open(skill_file, "r", encoding="utf-8") as f:
                    content = f.read()
                body_match = re.match(r'^---\s*\n.*?\n---\s*\n(.*)$', content, re.DOTALL)
                if body_match:
                    return body_match.group(1).strip()
                return content
            except Exception as e:
                print(f"⚠️ [DAG Engine] Failed to load {skill_file}: {e}", flush=True)
        
        # Try partial match
        import glob
        matches = glob.glob(os.path.join(skills_dir, f"*{role_id}*.md"))
        if matches:
            try:
                with open(matches[0], "r", encoding="utf-8") as f:
                    content = f.read()
                body_match = re.match(r'^---\s*\n.*?\n---\s*\n(.*)$', content, re.DOTALL)
                if body_match:
                    return body_match.group(1).strip()
                return content
            except Exception as e:
                print(f"⚠️ [DAG Engine] Failed to load {matches[0]}: {e}", flush=True)
        
        return ""

    @staticmethod
    def _extract_code_blocks(markdown: str) -> Dict[str, str]:
        """
        Extract code blocks from markdown and return as {filename: content} dict.
        Detects: html, css, js/javascript, python, json, xml, sql, bash, etc.
        Falls back to raw HTML extraction if no fenced blocks found.
        """
        import re

        files = {}

        # Pattern to match fenced code blocks with language
        pattern = r'```(\w+)\n(.*?)```'
        matches = re.findall(pattern, markdown, re.DOTALL)

        for lang, code in matches:
            lang_lower = lang.lower()
            code = code.strip()

            if not code:
                continue

            # Map language to filename
            if lang_lower in ('html', 'htm'):
                if 'index.html' not in files:
                    files['index.html'] = code
            elif lang_lower == 'css':
                if 'style.css' not in files:
                    files['style.css'] = code
                else:
                    idx = len([f for f in files if f.endswith('.css')]) + 1
                    files[f'style{idx}.css'] = code
            elif lang_lower in ('js', 'javascript', 'typescript', 'ts'):
                if 'script.js' not in files:
                    files['script.js'] = code
                else:
                    idx = len([f for f in files if f.endswith('.js')]) + 1
                    files[f'script{idx}.js'] = code
            elif lang_lower in ('py', 'python'):
                if 'main.py' not in files:
                    files['main.py'] = code
                else:
                    idx = len([f for f in files if f.endswith('.py')]) + 1
                    files[f'module{idx}.py'] = code
            elif lang_lower in ('json',):
                if 'data.json' not in files:
                    files['data.json'] = code

        # FALLBACK: If no fenced blocks found, try to extract raw HTML
        if not files and ('<html' in markdown.lower() or '<!doctype' in markdown.lower()):
            # Extract complete HTML document
            html_match = re.search(r'(<html[\s\S]*?</html>|<!DOCTYPE\s+html[\s\S]*?</html>)',
                                   markdown, re.IGNORECASE)
            if html_match:
                html_content = html_match.group(1)
                # Clean up markdown artifacts (backticks, language hints)
                html_content = re.sub(r'```[\w]*', '', html_content).strip()
                if html_content:
                    files['index.html'] = html_content

            # Extract CSS from <style> tags or standalone CSS blocks
            css_blocks = re.findall(r'<style[^>]*>([\s\S]*?)</style>', markdown, re.IGNORECASE)
            if css_blocks:
                combined_css = '\n\n'.join(css_blocks)
                files['style.css'] = combined_css.strip()

            # Extract JS from <script> tags
            js_blocks = re.findall(r'<script[^>]*>([\s\S]*?)</script>', markdown, re.IGNORECASE)
            if js_blocks:
                combined_js = '\n\n'.join(js_blocks)
                files['script.js'] = combined_js.strip()

        return files

    @staticmethod
    def _normalize_web_project_files(files: Dict[str, str]) -> Dict[str, str]:
        """Turn generated web output into a clean previewable project tree."""
        html = files.get("index.html")
        if not html:
            return files

        # Fix a common LLM mistake: linking a JS library as a stylesheet.
        html = re.sub(
            r'<link\s+rel=["\']stylesheet["\']\s+href=["\']([^"\']+\.js[^"\']*)["\'][^>]*>',
            r'<script src="\1"></script>',
            html,
            flags=re.IGNORECASE,
        )

        if "style.css" not in files:
            style_blocks = re.findall(r"<style[^>]*>([\s\S]*?)</style>", html, flags=re.IGNORECASE)
            if style_blocks:
                files["style.css"] = "\n\n".join(block.strip() for block in style_blocks if block.strip())
                html = re.sub(
                    r"<style[^>]*>[\s\S]*?</style>",
                    '<link rel="stylesheet" href="style.css">',
                    html,
                    count=1,
                    flags=re.IGNORECASE,
                )
                html = re.sub(r"<style[^>]*>[\s\S]*?</style>", "", html, flags=re.IGNORECASE)

        if "script.js" not in files:
            inline_scripts = []

            def _script_replacer(match):
                tag = match.group(0)
                body = match.group(1).strip()
                if re.search(r"\ssrc=", tag, flags=re.IGNORECASE):
                    return tag
                if body:
                    inline_scripts.append(body)
                    return '<script src="script.js"></script>'
                return ""

            html = re.sub(
                r"<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)</script>",
                _script_replacer,
                html,
                count=1,
                flags=re.IGNORECASE,
            )
            html = re.sub(r"<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?</script>", "", html, flags=re.IGNORECASE)
            if inline_scripts:
                files["script.js"] = "\n\n".join(inline_scripts)

        files["index.html"] = html
        return files

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
            # Phase I: Ignore edges explicitly marked as Loop Back for sorting purposes
            is_loop = edge.get("data", {}).get("isLoopBack", False)
            if is_loop:
                continue

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

        # In a loop-enabled DAG, we only care about cycles in the FORWARD path
        if len(order) != len(node_ids):
            # Try to identify which nodes are truly stuck vs which are loop targets
            raise ValueError("Cycle detected in forward workflow graph — topological sort impossible")

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
        company_id: str = "user:anonymous",
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

            use_langgraph = self._should_use_langgraph_runtime(nodes, edges, resume_from_node=resume_from_node)

            if use_langgraph:
                runner = LangGraphWorkflowRunner(self)
                result = await runner.run(
                    workflow_id=workflow_id,
                    run_id=run_id,
                    nodes=nodes,
                    edges=edges,
                    company_id=company_id,
                    initial_input=initial_input,
                    assistant_id=assistant_id,
                    topic_id=topic_id,
                )
                print(f"✅ [DAG Engine] LangGraph runtime completed workflow {workflow_id}", flush=True)
                self.audit.notify(
                    user_id=None,
                    company_id=self.company_id,
                    title="🏁 Workflow Completed",
                    preview=f"LangGraph workflow {workflow_id} finished.",
                    content=f"Your Sovereign workflow {workflow_id} (Run: {run_id}) has finished all required states.",
                    category="success"
                )
                return result

            # Always initialize the run record
            self._init_run(workflow_id, run_id, nodes)
            self._record_run_event(
                run_id,
                workflow_id,
                "run_started",
                status="running",
                payload={"node_count": len(nodes), "edge_count": len(edges), "task": initial_input or "", "runtime_engine": "custom_dag"},
            )

            # Build node lookup and edge adjacency
            node_map = {n["id"]: n for n in nodes}
            completed_nodes: Set[str] = set()
            pruned_nodes: Set[str] = set()
            
            # Loop Management (Phase I)
            loop_iterations: Dict[str, int] = {} # target_node_id -> current_iteration
            
            print(f"🔀 [DAG Engine] Starting Dynamic Execution (V3 Protocol) with Loop Support", flush=True)

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
                
                # 3. Process results and handle branching/looping
                for nid, (success, branch_info) in zip(ready_ids, results):
                    if success:
                        completed_nodes.add(nid)
                        
                        # --- PHASE III: SENTINEL CHECK ---
                        # Read the latest response to check for deadlock
                        artifact_name = f"{nid}_output"
                        if self.space.exists(artifact_name):
                            resp = self.space.read(artifact_name).decode("utf-8")
                            if self._check_stuck_loop(nid, resp):
                                print(f"🛑 [DAG Engine] Critical Deadlock at {nid}. Forcing early exit to help high-stakes decision.", flush=True)
                                # Force early exit by pruning all loop edges for this node
                                continue 
                        
                        # --- PHASE I: LOOP DETECTION ---
                        loop_edges = [e for e in edges if e["source"] == nid and e.get("data", {}).get("isLoopBack", False)]
                        
                        for le in loop_edges:
                            target_id = le["target"]
                            loop_config = le.get("data", {})
                            max_iters = int(loop_config.get("maxIterations", 1))
                            
                            current_iter = loop_iterations.get(target_id, 0)
                            
                            if current_iter < max_iters:
                                new_iter = current_iter + 1
                                loop_iterations[target_id] = new_iter
                                print(f"🔄 [DAG Engine] Loop detected: {nid} -> {target_id}. Iteration {new_iter}/{max_iters}", flush=True)
                                
                                # RELAX THE DAG
                                nodes_to_reset = self._get_descendants(target_id, edges) | {target_id}
                                for r_node in nodes_to_reset:
                                    if r_node in completed_nodes:
                                        completed_nodes.remove(r_node)
                                
                                self._update_loop_stats(run_id, target_id, new_iter, max_iters)
                    else:
                        # --- PHASE II: RESILIENCE (RETRY) ---
                        # We allow a simple retry before failing the branch
                        retry_count = 0 # In Phase III we'd track this in DB
                        print(f"⚠️ [DAG Engine] Node {nid} failed. Resilience check...", flush=True)
                        # For now, we still halt to avoid infinite cycles on error
                        print(f"❌ [DAG Engine] Branch stalled at {nid}.", flush=True)
                        if branch_info and branch_info.get("type") == "switch":
                            # Prune non-selected branches
                            self._prune_branches(branch_info["prune_targets"], edges, pruned_nodes)
                        print(f"❌ [DAG Engine] Node {nid} failed. Halting workflow.", flush=True)
                        failed_node_data = node_map.get(nid, {}).get("data", {})
                        failed_label = failed_node_data.get("label") or failed_node_data.get("role") or nid
                        self._update_run_status(run_id, WorkflowState.FAILED.value, nid, failed_label)
                        
                        # PERSISTENT NOTIFICATION for Failure
                        self.audit.notify(
                            user_id=None,
                            company_id=self.company_id,
                            title="❌ Workflow Failed",
                            preview=f"Workflow {workflow_id} failed at {failed_label}.",
                            content=f"An error occurred during {failed_label} in run {run_id}. The workflow has been halted.",
                            category="error"
                        )
                        return {"status": "failed", "run_id": run_id, "failed_node": nid, "runtime_engine": "custom_dag"}

            # All required nodes completed
            self._update_run_status(run_id, WorkflowState.COMPLETED.value)
            self._record_run_event(run_id, workflow_id, "run_completed", status=WorkflowState.COMPLETED.value)
            print(f"✅ [DAG Engine] Workflow {workflow_id} completed successfully", flush=True)
            
            # PERSISTENT NOTIFICATION for Completion
            self.audit.notify(
                user_id=None,
                company_id=self.company_id,
                title="🏁 Workflow Completed",
                preview=f"Custom DAG {workflow_id} finished.",
                content=f"Your Sovereign workflow {workflow_id} (Run: {run_id}) has finished all required states.",
                category="success"
            )
            return {"status": "completed", "run_id": run_id, "runtime_engine": "custom_dag"}

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

        # If instruction is empty, try to load from skill file
        if not instruction and role:
            instruction = self._load_skill_instruction(role)
            if instruction:
                print(f"📋 [DAG Engine] Loaded skill prompt for {role}", flush=True)
        else:
            print(f"🎯 [DAG Engine] Using node instruction for role='{role}', instruction length={len(instruction)}, is_custom={node_data.get('is_custom', False)}", flush=True)

        # GLOBAL PANIC CHECK
        if self.gov.is_panic:
            print(f"🛑 [DAG Engine] Node {node_id} ABORTED due to PANIC signal.", flush=True)
            self._update_node_status(run_id, node_id, "failed", "Execution aborted by panic signal.")
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
                self._update_node_status(run_id, node_id, "failed", "Human approval was denied.")
                return False, None

        # --- CASE 2: STANDARD STATE NODE ---
        # 1. Check budget before execution
        budget = self.gov.get_company_budget_status(self.company_id)
        if budget["spent"] >= budget["limit"]:
            print(f"❌ [DAG Engine] Budget exhausted for node {node_id}", flush=True)
            self._update_node_status(run_id, node_id, "failed", "Company budget was exhausted before this step could run.")
            return False, None

        # 2. Assemble input context
        context = self._assemble_node_context(run_id, node_id, node_map, edges, initial_input)

        # 3. Create and run agent
        agent_id = f"{role.lower().replace(' ', '_')}_{node_id}_{int(time.time())}"
        self._update_run_status(run_id, "running", node_id, agent_id)

        # Detect coding tasks (need longer timeout and special handling)
        coding_keywords = ['html', 'css', 'javascript', 'code', 'develop', 'frontend', 'coder', 'developer', 'implement', 'write code', 'create the', 'html formatter', 'format html', 'build the page', 'web developer', 'html dashboard', 'chart', 'dashboard']
        web_quality_keywords = [
            'website', 'web site', 'landing page', 'homepage', 'frontend', 'web developer',
            'html', 'css', 'javascript', 'dashboard', 'ui', 'responsive', 'modern'
        ]
        is_coding_task = any(kw in instruction.lower() for kw in coding_keywords)
        is_web_deliverable = any(kw in f"{instruction} {initial_input or ''}".lower() for kw in web_quality_keywords)

        enhanced_instruction = instruction

        # ROLE ISOLATION: Prevent agents from performing tasks assigned to other agents
        role_isolation = (
            f"\n\nIMPORTANT — ROLE ISOLATION: You are ONLY the {role}. "
            f"Do NOT perform tasks assigned to other agents in this workflow. "
            f"Output only what your specific role requires."
        )

        # STRICT OUTPUT FORMAT: Enforce clean, parseable output
        strict_format = (
            f"\n\nOUTPUT FORMAT RULES:\n"
            f"- If the task requires JSON, output ONLY valid JSON. No markdown, no explanations, no conversational text before or after.\n"
            f"- Do NOT wrap JSON in ```json code blocks unless explicitly asked.\n"
            f"- Do NOT add phrases like 'Here is the data' or 'I will act as...' before the output.\n"
            f"- Start your response directly with the requested format.\n"
            f"- If the task requires code (HTML/CSS/JS), output complete, working code in fenced code blocks."
        )

        if is_coding_task:
            enhanced_instruction = instruction + role_isolation + strict_format + (
                "\n\nIMPORTANT: You MUST output ALL code files inside fenced code blocks. "
                "For each file, use:\n"
                "```html\n...full HTML code...\n```\n"
                "```css\n...full CSS code...\n```\n"
                "```js\n...full JavaScript code...\n```\n"
                "Do NOT describe code in prose. Output complete, working files. "
                "Each file must be in its own fenced code block with the language specified."
            )
            if is_web_deliverable:
                enhanced_instruction += (
                    "\n\nPREMIUM WEBSITE QUALITY BAR — NON-NEGOTIABLE:\n"
                    "- Build a polished, product-grade web experience, not a tutorial/demo page.\n"
                    "- Use a clean project structure: exactly `index.html`, `style.css`, and `script.js` unless more files are truly needed.\n"
                    "- `index.html` should contain semantic sections and content only; put styling in `style.css` and behavior in `script.js`.\n"
                    "- Include a distinctive hero, strong visual hierarchy, navigation, rich section layout, cards, CTA areas, realistic mock content, and a finished footer.\n"
                    "- Use CSS variables, layered gradients, responsive grids, intentional typography, generous spacing, hover/focus states, and mobile breakpoints.\n"
                    "- Do NOT use default-looking Arial/Times pages, tiny centered boxes, placeholder lorem ipsum, unstyled buttons, inline styles, or generic black cards.\n"
                    "- If external libraries are used, load JavaScript with `<script src=...>`, never as a stylesheet.\n"
                    "- The preview must look credible to a customer at 1440px desktop and on mobile without horizontal overflow.\n"
                    "- Use the exact user task and upstream handoff data. Do not invent a different business, ticker, theme, or product."
                )
        else:
            # Non-coding agents: enforce strict output format
            enhanced_instruction = instruction + role_isolation + strict_format + (
                "\n\nIf your role requires structured data output, use JSON format with no surrounding text."
            )

        # Extract tools from node definition
        agent_tools = node_data.get("tools", [])
        if isinstance(agent_tools, str):
            agent_tools = [t.strip() for t in agent_tools.split(",")]

        # Build tool schemas for LLM function calling
        tool_schemas = self._build_tool_schemas(agent_tools)

        print(f"🔧 [DAG Engine] Node {node_id} using tools: {agent_tools}", flush=True)
        
        # M2: Shared Repo Workspace
        shared_repo_dir = os.path.join("data", "workspace", f"workflow_{workflow_id}", "repo")
        os.makedirs(shared_repo_dir, exist_ok=True)

        # M3: Per-Phase Model Routing
        node_model = node_data.get("model")
        model_selection_reason = "explicitly_set"
        if not node_model:
            # Smart routing based on role
            role_lower = role.lower()
            if any(k in role_lower for k in ["architect", "planner", "manager", "strategist"]):
                # Reasoning phase
                node_model = "claude-3-opus-20240229" if self.llm.provider == "anthropic" else "gpt-4o"
                model_selection_reason = "auto_reasoning"
            elif any(k in role_lower for k in ["engineer", "developer", "coder"]):
                # Execution phase
                node_model = "claude-3-5-sonnet-20240620" if self.llm.provider == "anthropic" else "gemini-2.5-flash"
                model_selection_reason = "auto_execution"
        
        if node_model and _model_provider(node_model) and _model_provider(node_model) != self.llm.provider:
            print(
                f"⚠️ [DAG Engine] Node model '{node_model}' is not compatible with active provider '{self.llm.provider}'. "
                f"Using active model '{self.llm.model}'.",
                flush=True,
            )
            node_model = self.llm.model
            model_selection_reason = "provider_compatible_fallback"
        
        self.audit.log(
            self.company_id,
            agent_id,
            "MODEL_ROUTING",
            {"node_id": node_id, "role": role, "model": node_model, "reason": model_selection_reason}
        )
        
        model_override = None
        if node_model or node_data.get("temperature") is not None:
            model_override = {
                "provider": self.llm.provider,
                "model": node_model,
                "temperature": node_data.get("temperature", 0.7),
                "base_url": self.llm.base_url,
                "api_key": self.llm.api_key,
            }

        agent = ManagedAgent(
            agent_id=agent_id,
            company_id=self.company_id,
            system_prompt=enhanced_instruction,
            gov=self.gov,
            audit=self.audit,
            llm=self.llm,
            tools=agent_tools,
            tool_schemas=tool_schemas,
            is_coding_task=is_coding_task,
            workspace_dir=shared_repo_dir,
            model_override=model_override
        )
        self.gov.register_agent(agent.agent_id, self.company_id, role)

        try:
            # Check panic again right before LLM call
            if self.gov.is_panic: return False, None
            
            # --- M2: Pre-task Git Snapshot ---
            has_code_tools = any(t in agent_tools for t in ["write_file", "shell_cmd", "write_artifact"])
            git_snapshot_sha = None
            if has_code_tools or is_coding_task:
                git_snapshot_sha = self._git_snapshot(shared_repo_dir, f"pre_task_{node_id}_{run_id}")

            # 📝 CRITICAL FIX: Ensure user's project goal is the PRIMARY instruction
            user_task = ""
            if self.space.exists("user_initial_input"):
                user_task = self.space.read("user_initial_input").decode("utf-8", errors="ignore")
            
            final_prompt = f"### YOUR ACCURATE TASK:\n{user_task}\n\n### ROLE INSTRUCTIONS:\n{enhanced_instruction}\n\n### FULL CONTEXT:\n{context}"
            
            response = await agent.run_async(final_prompt)

            if response.strip().startswith(("Error:", "Error calling ")):
                raise RuntimeError(response)

            if "Execution aborted" in response or "Budget exhausted" in response:
                print(f"⏸️ [DAG Engine] Node {node_id} paused/aborted", flush=True)
                self._update_node_status(run_id, node_id, "failed", response[:240])
                return False, None

            # 4. Commit output artifact to CAS
            artifact_hash = self.space.write(response.encode(), f"{node_id}_output", node_id, self.company_id)
            print(f"📦 [DAG Engine] Artifact committed: {artifact_hash[:16]}...", flush=True)

            # 5. Auto-detect and extract code blocks into proper files
            extracted_files = self._extract_code_blocks(response)
            if extracted_files and is_web_deliverable:
                extracted_files = self._normalize_web_project_files(extracted_files)
            if extracted_files:
                print(f"📁 [DAG Engine] Extracted {len(extracted_files)} files from node {node_id}", flush=True)
                for filename, content in extracted_files.items():
                    self.space.write(content.encode(), f"{node_id}_{filename}", node_id, self.company_id)
                    print(f"  📄 Saved to CAS: {filename}", flush=True)

            # Also save to physical workspace for preview (shared_repo)
            if extracted_files:
                for filename, content in extracted_files.items():
                    file_path = os.path.join(shared_repo_dir, filename)
                    with open(file_path, "w", encoding="utf-8") as f:
                        f.write(content)
                    print(f"  💾 Physical file saved to shared repo: {file_path}", flush=True)
                    
            # --- M2: Post-task Git Verification ---
            verification_status = "pending"
            if (has_code_tools or is_coding_task) and git_snapshot_sha:
                # Commit agent changes
                self._git_commit(shared_repo_dir, f"Agent {node_id} changes")
                
                # Check for verification commands
                verify_cmds = node_data.get("verification_commands", [])
                if verify_cmds:
                    verify_passed = await self._run_sandboxed_verification(shared_repo_dir, verify_cmds)
                    if verify_passed:
                        verification_status = "passed"
                        print(f"✅ [DAG Engine] Verification PASSED for node {node_id}", flush=True)
                    else:
                        verification_status = "failed"
                        print(f"❌ [DAG Engine] Verification FAILED for node {node_id}. Rolling back.", flush=True)
                        self._git_rollback(shared_repo_dir, git_snapshot_sha)
                        self._update_node_status(run_id, node_id, "failed", "Verification failed during step validation.")
                        return False, None # Triggers resilience retry / halt

            # 6. Generate handover summary (ADR-1 Compliance)
            handover = self._generate_handover_summary(node_id, role, response, extracted_files)
            
            # M2: Inject verification status into handover if applicable
            if verification_status != "pending":
                import json
                try:
                    h_obj = json.loads(handover)
                    h_obj["verification"] = verification_status
                    if git_snapshot_sha:
                        h_obj["git_ref"] = self._git_current_sha(shared_repo_dir)
                    handover = json.dumps(h_obj, indent=2)
                except:
                    pass
                    
            self.space.write(handover.encode(), f"{node_id}_handover", node_id, self.company_id)
            self._record_handoff_message(run_id, workflow_id, node_id, role, response, edges)

            # 7. Create snapshot for Time Machine
            self._create_snapshot(run_id, node_id, artifact_hash, "completed")

            # 8. Broadcast RESULT event
            self.audit.log(
                self.company_id,
                agent_id,
                "RESULT",
                {
                    "result": response,
                    "agent_id": agent_id,
                    "node_id": node_id,
                    "artifact_hash": artifact_hash,
                    "workflow_id": workflow_id,
                    "run_id": run_id,
                    "role": role,
                },
                broadcast=True,
            )

            # 9. Mirror to physical deliverables folder (if Architect/Planner)
            self._mirror_to_deliverables(run_id, node_id, role, response)

            # 10. Legacy HTML detection (for backward compatibility)
            if not extracted_files and ("<!DOCTYPE html>" in response or "<html>" in response.lower()):
                print(f"🌐 [DAG Engine] Web deliverable detected for node {node_id}. Auto-saving index.html", flush=True)
                # Extract HTML content if it's wrapped in markdown blocks
                html_content = response
                if "```html" in response:
                    html_content = response.split("```html")[1].split("```")[0].strip()
                elif "```" in response:
                    html_content = response.split("```")[1].split("```")[0].strip()

                # Save to workflow-specific directory for the UI to pick up
                wf_workspace = os.path.join("data", "workspace", f"workflow_{workflow_id}")
                os.makedirs(wf_workspace, exist_ok=True)
                preview_path = os.path.join(wf_workspace, "preview.html")
                with open(preview_path, "w", encoding="utf-8") as f:
                    f.write(html_content)
                print(f"🌐 [DAG Engine] Web deliverable saved to {preview_path}", flush=True)

            # Update node status
            self._update_node_status(run_id, node_id, "completed", response)

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
            self._update_node_status(run_id, node_id, "failed", str(e))
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
        
        # Determine if we should wipe implicit context (ADR-1)
        node_data = node_map.get(node_id, {}).get("data", {})
        # Default to True for Engineering roles, otherwise False. (Assuming roles containing 'engineer', 'developer', etc.)
        role = node_data.get("role", "").lower()
        is_engineering = any(k in role for k in ["engineer", "developer", "coder", "architect", "programmer"])
        reset_context = node_data.get("reset_context", is_engineering)
        timing_policy = node_data.get("timing_policy") or {}
        dependency_mode = str(timing_policy.get("type") or "").lower() == "dependency"

        # 1. Include initial user task/goal (Universal context)
        if self.space.exists("user_initial_input"):
            input_val = self.space.read("user_initial_input").decode("utf-8", errors="ignore")
            context_parts.append(f"### PROJECT GOAL / TASK:\n{input_val}")

        self.audit.log(
            self.company_id,
            node_id,
            "CONTEXT_RESET",
            {"node_id": node_id, "reset_active": reset_context, "reason": "routine"}
        )

        # Get predecessor artifacts using the passed edges list
        predecessors = self._get_predecessors(node_id, edges)
        include_raw_predecessors = bool(predecessors) and (dependency_mode or not reset_context)
        for pred_id in predecessors:
            # Include handover summary (This is the primary context if reset_context is True)
            handover_name = f"{pred_id}_handover"
            if self.space.exists(handover_name):
                handover = self.space.read(handover_name).decode("utf-8", errors="ignore")
                context_parts.append(f"### Handover Summary ({pred_id}):\n{handover}")

            # Include raw outputs for dependency-linked nodes so downstream agents
            # can actually consume the upstream artifact, not just a summary.
            if include_raw_predecessors:
                # Phase I: Loop-Aware Context Assembly
                all_versions = self.space.read_all_versions(f"{pred_id}_output")
                if all_versions:
                    if len(all_versions) > 1:
                        print(f"📚 [DAG Engine] Gathering full history for looping predecessor {pred_id} ({len(all_versions)} rounds)", flush=True)
                        history_blocks = []
                        for i, content in enumerate(all_versions):
                            round_text = content.decode("utf-8", errors="ignore")
                            history_blocks.append(f"### MISSION ROUND {i+1} OUTPUT ({pred_id}):\n{round_text}")
                        context_parts.append("\n\n---\n\n".join(history_blocks))
                    else:
                        response = all_versions[-1].decode("utf-8", errors="ignore")
                        context_parts.append(f"### Outcome of {pred_id}:\n{response}")

        context_str = "\n\n".join(context_parts) if context_parts else "No previous context."
        print(f"📝 [DAG Engine] Context for {node_id}: {len(context_str)} chars, predecessors: {predecessors}, reset_context: {reset_context}", flush=True)
        
        # DATA INJECTOR: Resolve {{agent_id.field.path}} placeholders (Bypasses reset_context to pull raw CAS data)
        context_str = self._resolve_data_bindings(context_str, run_id, predecessors)
        
        return context_str

    def _extract_json_path(self, data: Any, path: str) -> str:
        """
        Safely extract a value from nested JSON using dot-notation path.
        
        Examples:
            _extract_json_path({"price": 100}, "price") → "100"
            _extract_json_path({"rsi": {"value": 68.5}}, "rsi.value") → "68.5"
            _extract_json_path({"items": [1,2,3]}, "items.0") → "1"
            _extract_json_path({"a": 1}, "b.c") → "N/A (path not found: b.c)"
        """
        if not path:
            return str(data) if data is not None else "N/A"
        
        keys = path.split(".")
        current = data
        
        for key in keys:
            if current is None:
                return f"N/A (null at: {key})"
            
            # Try dict key first
            if isinstance(current, dict):
                if key in current:
                    current = current[key]
                else:
                    # Case-insensitive fallback
                    lower_key = key.lower()
                    found = None
                    for k in current:
                        if k.lower() == lower_key:
                            found = current[k]
                            break
                    if found is not None:
                        current = found
                    else:
                        return f"N/A (key not found: {key} in {list(current.keys())[:5]}...)"
            # Try list index
            elif isinstance(current, (list, tuple)):
                try:
                    idx = int(key)
                    current = current[idx]
                except (ValueError, IndexError):
                    return f"N/A (invalid index: {key})"
            else:
                return f"N/A (cannot traverse: {type(current).__name__}.{key})"
        
        # Format the final value
        if isinstance(current, (dict, list)):
            # For complex structures, return compact JSON
            import json as _json
            return _json.dumps(current, ensure_ascii=False)
        elif isinstance(current, bool):
            return str(current).lower()
        elif current is None:
            return "null"
        else:
            return str(current)

    def _resolve_data_bindings(self, text: str, run_id: str, predecessors: List[str]) -> str:
        """
        Resolve {{agent_id.field.path}} placeholders with actual values from previous agents' outputs.
        
        Supports two binding styles:
        1. Position-based: {{Agent1.price}}, {{Agent2.rsi}} — matches 1st, 2nd predecessor by order
        2. Name-based: {{data_fetcher.price}}, {{technical_analyst.rsi}} — matches by substring in node ID
        """
        import re
        
        # Pattern: {{agent_id.field.path}} or {{agent_id}} (entire output)
        pattern = r'\{\{([^}]+)\}\}'
        
        def replace_binding(match):
            binding = match.group(1).strip()
            parts = binding.split(".")
            agent_key = parts[0]
            field_path = ".".join(parts[1:]) if len(parts) > 1 else ""
            
            # POSITION-BASED: Agent1 → 1st predecessor, Agent2 → 2nd, etc.
            pos_match = re.match(r'[Aa]gent(\d+)', agent_key)
            if pos_match:
                position = int(pos_match.group(1)) - 1  # 0-indexed
                if 0 <= position < len(predecessors):
                    pred_id = predecessors[position]
                else:
                    return f"[N/A: Agent{position+1} not found (only {len(predecessors)} predecessors)]"
            else:
                # NAME-BASED: match by substring
                pred_id = None
                for pid in predecessors:
                    if agent_key in pid or pid in agent_key:
                        pred_id = pid
                        break
                if pred_id is None:
                    return f"[N/A: agent '{agent_key}' not found]"
            
            # Fetch output from CAS
            artifact_name = f"{pred_id}_output"
            if not self.space.exists(artifact_name):
                return f"[N/A: no output for {pred_id}]"
            
            raw = self.space.read(artifact_name).decode("utf-8", errors="ignore")
            
            # Try to parse as JSON
            try:
                import json as _json_mod
                pred_output = _json_mod.loads(raw)
            except (_json_mod.JSONDecodeError, ValueError):
                pred_output = raw
            
            # If no field path, return entire output (truncated if too long)
            if not field_path:
                if isinstance(pred_output, str):
                    return pred_output[:500] if len(pred_output) > 500 else pred_output
                return str(pred_output)
            
            # Extract the specific field
            return self._extract_json_path(pred_output, field_path)
        
        # Count bindings for logging
        bindings = re.findall(pattern, text)
        if bindings:
            print(f"💉 [Data Injector] Resolving {len(bindings)} bindings: {bindings}", flush=True)
        
        # Replace all bindings
        resolved = re.sub(pattern, replace_binding, text)
        
        return resolved

    def _get_predecessors(self, node_id: str, edges: List[Dict]) -> List[str]:
        """Get list of predecessor node IDs for a given node using the edges list."""
        predecessors = []
        for edge in edges:
            if edge["target"] == node_id:
                predecessors.append(edge["source"])
        return predecessors

    def _build_tool_schemas(self, tool_names: List[str]) -> List[Dict[str, Any]]:
        """Build tool schemas for LLM function calling based on requested tools."""
        if not tool_names:
            return []

        TOOL_SCHEMAS = {
            "get_stock_data": {
                "name": "get_stock_data",
                "description": "Get real-time stock price, volume, market cap, 52-week range, and historical price data for a ticker symbol.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "ticker": {"type": "string", "description": "Stock ticker symbol (e.g., AAPL, NVDA, TSLA)"},
                        "period": {"type": "string", "description": "Time period: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max"}
                    },
                    "required": ["ticker"]
                }
            },
            "get_technical_indicators": {
                "name": "get_technical_indicators",
                "description": "Calculate technical indicators: RSI, MACD, Bollinger Bands, KDJ, CCI, ATR.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "ticker": {"type": "string", "description": "Stock ticker symbol"},
                        "period": {"type": "string", "description": "Time period for analysis"}
                    },
                    "required": ["ticker"]
                }
            },
            "get_company_fundamentals": {
                "name": "get_company_fundamentals",
                "description": "Get company fundamental data: P/E ratio, revenue, profit margins, ROE, debt-to-equity, dividends.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "ticker": {"type": "string", "description": "Stock ticker symbol"}
                    },
                    "required": ["ticker"]
                }
            },
            "get_market_news": {
                "name": "get_market_news",
                "description": "Get latest market news articles with sentiment hints for a ticker.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "ticker": {"type": "string", "description": "Stock ticker symbol (optional, leave empty for general market news)"},
                        "limit": {"type": "integer", "description": "Number of articles to fetch"}
                    },
                    "required": []
                }
            },
            "search_web": {
                "name": "search_web",
                "description": "Search the web for real-time information, market data, or research.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "The search query."}
                    },
                    "required": ["query"]
                }
            },
            "read_artifact": {
                "name": "read_artifact",
                "description": "Read the contents of a file from the workspace.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "Name or path of the file to read."}
                    },
                    "required": ["path"]
                }
            },
            "write_artifact": {
                "name": "write_artifact",
                "description": "Create or update a file in the workspace.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "Name or path of the file to create."},
                        "content": {"type": "string", "description": "Content to write to the file."}
                    },
                    "required": ["path", "content"]
                }
            },
            "list_artifacts": {
                "name": "list_artifacts",
                "description": "List all files available in the current workspace.",
                "parameters": {"type": "object", "properties": {}}
            },
        }

        return [TOOL_SCHEMAS[t] for t in tool_names if t in TOOL_SCHEMAS]

    def _generate_handover_summary(self, node_id: str, role: str, response: str, extracted_files: Dict[str, str] = None) -> str:
        """
        Generate a structured JSON handover summary (max 500 tokens) for the node's output.
        Per ADR-1: This serves as the clean context for the next node.
        """
        files = list(extracted_files.keys()) if extracted_files else []
        summary_text = response[:500] + ("..." if len(response) > 500 else "")
        
        summary_obj = {
            "node_id": node_id,
            "role": role,
            "outcome": "completed",
            "summary": summary_text,
            "files_changed": files,
            "raw_artifact_cas_id": f"{node_id}_output",
            "verification": "pending"
        }
        return json.dumps(summary_obj, indent=2)

    def _init_run(self, workflow_id: str, run_id: str, nodes: List[Dict]):
        """Initialize a new workflow run in the database."""
        self._run_node_meta[run_id] = {}
        for index, node in enumerate(nodes):
            if node.get("id"):
                self._run_node_meta[run_id][node["id"]] = {
                    **self._node_metadata(node),
                    "execution_order": str(index + 1),
                }
        with sqlite3.connect(self.gov.db_path) as conn:
            conn.execute(
                """INSERT OR REPLACE INTO executions 
                   (run_id, workflow_id, company_id, status, current_node, started_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (run_id, workflow_id, self.company_id, "running", nodes[0]["id"], time.strftime("%Y-%m-%dT%H:%M:%SZ")),
            )
            for index, node in enumerate(nodes):
                node_id = node.get("id")
                if not node_id:
                    continue
                conn.execute(
                    """INSERT OR REPLACE INTO node_executions
                       (run_id, node_id, status, output, updated_at)
                       VALUES (?, ?, ?, COALESCE((SELECT output FROM node_executions WHERE run_id = ? AND node_id = ?), NULL), ?)""",
                    (run_id, node_id, "idle" if index else "queued", run_id, node_id, time.strftime("%Y-%m-%dT%H:%M:%SZ")),
                )

    @staticmethod
    def _node_metadata(node: Dict[str, Any]) -> Dict[str, str]:
        data = node.get("data") or {}
        node_id = node.get("id", "")
        return {
            "label": str(data.get("label") or data.get("name") or data.get("role") or node_id),
            "role": str(data.get("role") or data.get("label") or node_id),
            "subtitle": str(data.get("subtitle") or ""),
            "selection_reason": str(data.get("selection_reason") or ""),
        }

    def _node_meta(self, run_id: str, node_id: Optional[str]) -> Dict[str, str]:
        if not node_id:
            return {}
        return self._run_node_meta.get(run_id, {}).get(node_id, {})

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
            if status in {WorkflowState.COMPLETED.value, WorkflowState.FAILED.value}:
                conn.execute("UPDATE executions SET completed_at = ? WHERE run_id = ?", (time.strftime("%Y-%m-%dT%H:%M:%SZ"), run_id))

    def _update_node_status(self, run_id: str, node_id: str, status: str, output: Optional[str] = None):
        """Update individual node execution status."""
        timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ")
        with sqlite3.connect(self.gov.db_path) as conn:
            existing_output = None
            if output is None:
                cursor = conn.execute(
                    "SELECT output FROM node_executions WHERE run_id = ? AND node_id = ?",
                    (run_id, node_id),
                )
                row = cursor.fetchone()
                existing_output = row[0] if row else None
            conn.execute(
                """INSERT OR REPLACE INTO node_executions 
                   (run_id, node_id, status, output, updated_at)
                   VALUES (?, ?, ?, ?, ?)""",
                (run_id, node_id, status, output if output is not None else existing_output, timestamp),
            )
        self._record_run_event(
            run_id,
            None,
            "node_status",
            node_id=node_id,
            status=status,
            payload={"output_summary": (output or "")[:280] if output else ""},
            created_at=timestamp,
        )

    def _record_run_event(
        self,
        run_id: str,
        workflow_id: Optional[str],
        event_type: str,
        node_id: Optional[str] = None,
        status: Optional[str] = None,
        payload: Optional[Dict[str, Any]] = None,
        created_at: Optional[str] = None,
    ) -> Optional[int]:
        """Persist an immutable event for live run replay."""
        timestamp = created_at or time.strftime("%Y-%m-%dT%H:%M:%SZ")
        meta = self._node_meta(run_id, node_id)
        try:
            with sqlite3.connect(self.gov.db_path) as conn:
                if not workflow_id:
                    row = conn.execute("SELECT workflow_id FROM executions WHERE run_id = ?", (run_id,)).fetchone()
                    workflow_id = row[0] if row else None
                cursor = conn.execute(
                    """INSERT INTO workflow_run_events
                       (run_id, workflow_id, company_id, node_id, event_type, status, label, role, payload_json, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        run_id,
                        workflow_id,
                        self.company_id,
                        node_id,
                        event_type,
                        status,
                        meta.get("label"),
                        meta.get("role"),
                        json.dumps(payload or {}),
                        timestamp,
                    ),
                )
                return int(cursor.lastrowid)
        except Exception as exc:
            print(f"⚠️ [DAG Engine] Failed to record run event: {exc}", flush=True)
            return None

    def _record_agent_message(
        self,
        message: AgentMessage,
        workflow_id: str,
    ) -> None:
        """Persist a validated immutable agent-to-agent message."""
        try:
            with sqlite3.connect(self.gov.db_path) as conn:
                cursor = conn.execute(
                    """SELECT message_id, run_id, cycle, sender_node_id, recipient_node_ids_json, visibility,
                              message_type, subject, body, related_state_keys_json, source_event_ids_json,
                              created_at, thread_id, in_reply_to
                       FROM agent_messages
                       WHERE run_id = ?
                       ORDER BY cycle ASC, created_at ASC""",
                    (message.run_id,),
                )
                existing = []
                for row in cursor.fetchall():
                    existing.append(AgentMessage(
                        message_id=row[0],
                        run_id=row[1],
                        cycle=row[2] or 0,
                        sender_node_id=row[3],
                        recipient_node_ids=json.loads(row[4] or "[]"),
                        visibility=row[5] or "public",
                        message_type=row[6] or "note",
                        subject=row[7] or "",
                        body=row[8] or "",
                        related_state_keys=json.loads(row[9] or "[]"),
                        source_event_ids=json.loads(row[10] or "[]"),
                        created_at=row[11] or time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                        thread_id=row[12],
                        in_reply_to=row[13],
                    ))
                AgentMessageLedger(existing).add_message(message)
                conn.execute(
                    """INSERT INTO agent_messages
                       (message_id, run_id, workflow_id, company_id, cycle, sender_node_id, recipient_node_ids_json,
                        visibility, message_type, subject, body, related_state_keys_json, source_event_ids_json,
                        created_at, thread_id, in_reply_to)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        message.message_id,
                        message.run_id,
                        workflow_id,
                        self.company_id,
                        message.cycle,
                        message.sender_node_id,
                        json.dumps(list(message.recipient_node_ids)),
                        message.visibility,
                        message.message_type,
                        message.subject,
                        message.body,
                        json.dumps(list(message.related_state_keys)),
                        json.dumps(list(message.source_event_ids)),
                        message.created_at,
                        message.thread_id,
                        message.in_reply_to,
                    ),
                )
        except AgentMessageValidationError as exc:
            print(f"⚠️ [DAG Engine] Rejected invalid agent message: {exc}", flush=True)
        except sqlite3.IntegrityError:
            # Messages are immutable; duplicate writes are ignored.
            pass
        except Exception as exc:
            print(f"⚠️ [DAG Engine] Failed to record agent message: {exc}", flush=True)

    def _downstream_recipients(self, node_id: str, edges: List[Dict]) -> List[str]:
        recipients = [edge.get("target") for edge in edges if edge.get("source") == node_id and edge.get("target")]
        return [str(item) for item in recipients] or ["workflow_result"]

    def _record_handoff_message(
        self,
        run_id: str,
        workflow_id: str,
        node_id: str,
        role: str,
        response: str,
        edges: List[Dict],
    ) -> None:
        recipients = self._downstream_recipients(node_id, edges)
        meta = self._node_meta(run_id, node_id)
        message = AgentMessage(
            message_id=f"msg_{run_id}_{node_id}_handoff",
            run_id=run_id,
            cycle=int(meta.get("execution_order") or 0),
            sender_node_id=node_id,
            recipient_node_ids=recipients,
            visibility="public",
            message_type="handoff",
            subject=f"{meta.get('label') or role} handoff",
            body=(response or "")[:1200],
            related_state_keys=[f"{node_id}_output", f"{node_id}_handover"],
            created_at=time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            thread_id=f"thread_{run_id}_handoff",
        )
        self._record_agent_message(message, workflow_id)

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

    def _get_descendants(self, node_id: str, edges: List[Dict]) -> Set[str]:
        """Recursively find all downstream nodes in the graph."""
        descendants = set()
        to_process = [node_id]
        while to_process:
            nid = to_process.pop(0)
            children = [e["target"] for e in edges if e["source"] == nid and not e.get("data", {}).get("isLoopBack", False)]
            for child in children:
                if child not in descendants:
                    descendants.add(child)
                    to_process.append(child)
        return descendants

    def _update_loop_stats(self, run_id: str, target_node_id: str, current_iter: int, max_iters: int):
        """Update DB with iteration count and loop metadata."""
        try:
            with sqlite3.connect(self.gov.db_path) as conn:
                metadata = json.dumps({
                    "target_node": target_node_id,
                    "last_loop_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")
                })
                conn.execute(
                    "UPDATE executions SET current_iteration = ?, max_iterations = ?, loop_metadata = ? WHERE run_id = ?",
                    (current_iter, max_iters, metadata, run_id)
                )
        except Exception as e:
            print(f"⚠️ [DAG Engine] Failed to update loop stats: {e}", flush=True)

    def _check_stuck_loop(self, node_id: str, current_response: str) -> bool:
        """
        Phase III: Semantic Stuck Detection.
        Checks if the current output is too similar to previous iterations.
        """
        all_versions = self.space.read_all_versions(f"{node_id}_output")
        if len(all_versions) < 2:
            return False
            
        # Compare to the last 2 versions (Round N-1 and N-2)
        prev_versions = [v.decode("utf-8", errors="ignore") for v in all_versions[-3:-1]]
        
        def get_words(text: str) -> Set[str]:
            return set(re.findall(r'\w+', text.lower()))
            
        current_words = get_words(current_response)
        if not current_words:
            return False
            
        for prev in prev_versions:
            prev_words = get_words(prev)
            if not prev_words: continue
            
            intersection = current_words.intersection(prev_words)
            union = current_words.union(prev_words)
            jaccard = len(intersection) / len(union)
            
            if jaccard > 0.92:
                print(f"🚩 [Sentinel] DEADLOCK DETECTED at node {node_id} (Similarity: {jaccard:.2f}). Agents are repeating themselves.", flush=True)
                return True
                
        return False

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

    # =========================================================================
    # Phase 2: Git-Aware Execution (Worktree Safety & Verification)
    # =========================================================================
    
    def _git_snapshot(self, repo_dir: str, branch_name: str) -> Optional[str]:
        """Creates a safety snapshot branch before the agent mutates files."""
        import subprocess
        try:
            # Ensure it's a git repo
            if not os.path.exists(os.path.join(repo_dir, ".git")):
                subprocess.run(["git", "init"], cwd=repo_dir, check=True, capture_output=True)
                subprocess.run(["git", "config", "user.name", "Esemble Engine"], cwd=repo_dir, check=True)
                subprocess.run(["git", "config", "user.email", "engine@esemble.local"], cwd=repo_dir, check=True)
                
                # Initial empty commit needed to branch
                with open(os.path.join(repo_dir, ".ensemble_init"), "w") as f:
                    f.write("Repository initialized by Esemble Engine.")
                subprocess.run(["git", "add", "."], cwd=repo_dir, check=True)
                subprocess.run(["git", "commit", "-m", "Initial commit"], cwd=repo_dir, check=True)

            # Stash any uncommitted changes first just in case
            subprocess.run(["git", "add", "."], cwd=repo_dir, check=True)
            subprocess.run(["git", "commit", "-m", "Auto-commit before snapshot"], cwd=repo_dir, capture_output=True)

            # Create snapshot branch
            subprocess.run(["git", "checkout", "-b", branch_name], cwd=repo_dir, check=True, capture_output=True)
            
            # Get current SHA
            result = subprocess.run(["git", "rev-parse", "HEAD"], cwd=repo_dir, check=True, capture_output=True, text=True)
            sha = result.stdout.strip()
            print(f"🌿 [DAG Engine] Git Snapshot created at {sha[:8]} on branch {branch_name}", flush=True)
            self.audit.log(
                self.company_id,
                "git_safety_module",
                "GIT_SAFETY",
                {"action": "auto_commit", "branch": branch_name, "commit_sha": sha}
            )
            return sha
        except subprocess.CalledProcessError as e:
            print(f"⚠️ [DAG Engine] Git snapshot failed: {e.stderr}", flush=True)
            return None

    def _git_commit(self, repo_dir: str, message: str) -> None:
        """Commits all changes made by the agent."""
        import subprocess
        try:
            subprocess.run(["git", "add", "."], cwd=repo_dir, check=True, capture_output=True)
            subprocess.run(["git", "commit", "-m", message], cwd=repo_dir, capture_output=True)
            print(f"💾 [DAG Engine] Agent changes committed to Git.", flush=True)
        except subprocess.CalledProcessError:
            # Normal if no changes were made
            pass

    def _git_rollback(self, repo_dir: str, sha: str) -> None:
        """Hard resets the repository to the pre-task snapshot SHA."""
        import subprocess
        try:
            subprocess.run(["git", "reset", "--hard", sha], cwd=repo_dir, check=True, capture_output=True)
            subprocess.run(["git", "clean", "-fd"], cwd=repo_dir, check=True, capture_output=True)
            print(f"⏪ [DAG Engine] Git Worktree rolled back to {sha[:8]}.", flush=True)
            self.audit.log(
                self.company_id,
                "git_safety_module",
                "GIT_SAFETY",
                {"action": "rollback", "target_sha": sha}
            )
        except subprocess.CalledProcessError as e:
            print(f"⚠️ [DAG Engine] Git rollback failed: {e.stderr}", flush=True)

    def _git_current_sha(self, repo_dir: str) -> str:
        """Returns the current HEAD SHA."""
        import subprocess
        try:
            result = subprocess.run(["git", "rev-parse", "HEAD"], cwd=repo_dir, check=True, capture_output=True, text=True)
            return result.stdout.strip()
        except subprocess.CalledProcessError:
            return "unknown"

    async def _run_sandboxed_verification(self, repo_dir: str, commands: List[str]) -> bool:
        """
        Executes verification commands inside a secure, ephemeral Docker sandbox (ADR-3).
        Returns True if all commands pass (exit code 0).
        """
        from core.docker_sandbox import SecureDockerContainer
        try:
            print(f"🧪 [DAG Engine] Starting Verification Suite in Sandbox...", flush=True)

            for cmd_str in commands:
                print(f"   Running in sandbox: {cmd_str}", flush=True)

                sandbox = SecureDockerContainer(
                    image="mcr.microsoft.com/devcontainers/base:ubuntu",
                    timeout_seconds=300, # 5 minutes, as verification can be slow
                    workspace_dir=repo_dir,
                )

                # Manually construct the docker command to add workspace mount
                final_cmd = sandbox.build_run_command(
                    command=cmd_str
                )
                
                process = await asyncio.create_subprocess_exec(
                    *final_cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )

                try:
                    stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=sandbox.timeout_seconds)
                    if process.returncode != 0:
                        print(f"   ❌ Failed: Exit code {process.returncode}", flush=True)
                        # Log stdout and stderr for debugging
                        if stdout:
                            print(f"   Stdout:\n{stdout.decode()}", flush=True)
                        if stderr:
                            print(f"   Stderr:\n{stderr.decode()}", flush=True)
                        self.audit.log(
                            self.company_id,
                            "verification_sandbox",
                            "VERIFICATION",
                            {"command": cmd_str, "exit_code": process.returncode, "status": "failed"}
                        )
                        return False
                except asyncio.TimeoutError:
                    process.kill()
                    print(f"   ⏱️ Timeout executing verification command.", flush=True)
                    self.audit.log(
                        self.company_id,
                        "verification_sandbox",
                        "VERIFICATION",
                        {"command": cmd_str, "status": "timeout"}
                    )
                    return False

            self.audit.log(
                self.company_id,
                "verification_sandbox",
                "VERIFICATION",
                {"commands": commands, "status": "passed"}
            )
            return True
        except Exception as e:
            print(f"⚠️ [DAG Engine] Verification execution error: {e}", flush=True)
            return False
