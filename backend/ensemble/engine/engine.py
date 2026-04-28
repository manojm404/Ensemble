"""
core/engine.py
SOP Engine: FSM executor for Ensemble workflows.
"""

import os
import sqlite3
import time
from typing import Any, Dict, List, Optional

import yaml

from backend.ensemble.security.audit import AuditLogger
from backend.ensemble.storage.ensemble_space import EnsembleSpace
from backend.ensemble.integrations.llm_provider import LLMProvider
from backend.ensemble.engine.managed_agent import ManagedAgent


class SOPEngine:
    def __init__(
        self,
        space: EnsembleSpace,
        audit: AuditLogger,
        llm: LLMProvider,
        gov: Any,
        user_id: str = None,
    ):
        self.space = space
        self.audit = audit
        self.llm = llm
        self.gov = gov
        self.user_id = user_id  # Phase 3: Multi-tenant user scoping
        self.current_state = None
        self.company_id = "company_alpha"
        self.last_response = ""

        # Ensure run-tracking table exists for in-memory or new DBs used in tests
        try:
            db_path = getattr(self.gov, "db_path", None)
            if db_path:
                import sqlite3

                with sqlite3.connect(db_path) as conn:
                    conn.execute("""
                        CREATE TABLE IF NOT EXISTS sop_runs (
                            run_id TEXT PRIMARY KEY,
                            status TEXT,
                            current_state TEXT,
                            last_agent_id TEXT
                        )
                        """)
        except Exception:
            # Non-fatal: tests may use mocked gov without db access
            pass

    def load_sop(self, yaml_path: str) -> Dict[str, Any]:
        """Load SOP YAML from file."""
        with open(yaml_path, "r") as f:
            return yaml.safe_load(f)

    async def run_workflow(
        self,
        sop_path: str,
        company_id: str = "company_alpha",
        run_id: str = None,
        initial_input: str = None,
        assistant_id: str = None,
        topic_id: str = None,
    ):
        """Execute the workflow defined in the SOP YAML."""
        sop = self.load_sop(sop_path)
        self.company_id = company_id
        self.current_topic_id = topic_id

        # ALWAYS reset state for chat workflow runs
        if initial_input:
            self.current_state = None
            self.last_response = ""

        # 0. Initial context (from UI chat)
        if initial_input and not run_id:
            self.space.write(
                initial_input.encode(), "user_initial_input", "start", company_id
            )

        # 0. Support Resume
        if run_id:
            with sqlite3.connect(self.gov.db_path) as conn:
                cursor = conn.execute(
                    "SELECT current_state, last_agent_id FROM sop_runs WHERE run_id = ?",
                    (run_id,),
                )
                row = cursor.fetchone()
                if row:
                    self.current_state, last_agent_id = row
                    print(f"🔄 Engine: Resuming {run_id} at {self.current_state}")
                    # In a real resume, we might load the last_agent_id state here

        workflow_cfg = sop.get("workflow", sop)
        states = workflow_cfg["states"]

        if not self.current_state:
            self.current_state = workflow_cfg.get(
                "initial_state", list(states.keys())[0]
            )
            print(f"⚙️ Engine: Initializing state to {self.current_state}", flush=True)
            if initial_input:
                # Log to the Audit trail first so agents can recall it
                self.audit.log(
                    self.company_id, "human_user", "USER_INPUT", {"text": initial_input}
                )
                self.space.write(
                    initial_input.encode(),
                    "user_initial_input",
                    "start",
                    self.company_id,
                )
                print(
                    f"📥 Engine: Recorded user input: {initial_input[:50]}...",
                    flush=True,
                )

        print(
            f"🚀 Engine: Starting workflow {run_id} at state {self.current_state}",
            flush=True,
        )

        while self.current_state:
            print(f"⚙️ Engine: Processing state {self.current_state}", flush=True)
            state_config = states[self.current_state]
            if state_config.get("type") == "end" or self.current_state == "end":
                # (Unified result log moved to the very end for dedup)
                break

            # 1. Instantiate or Resume ManagedAgent
            role_name = (
                assistant_id
                if assistant_id and self.current_state == list(states.keys())[0]
                else state_config["role"]
            )
            instruction = state_config["instruction"]

            agent = ManagedAgent(
                agent_id=f"{role_name.lower().replace(' ', '_')}_{int(time.time())}",
                company_id=self.company_id,
                system_prompt=instruction,
                gov=self.gov,
                audit=self.audit,
                llm=self.llm,
                skill_name=role_name,
                topic_id=self.current_topic_id,
                user_id=self.user_id,  # Phase 3: Pass user_id
            )
            self.gov.register_agent(agent.agent_id, self.company_id, role_name)

            # Update run with active agent
            self._update_run_status(
                run_id, "RUNNING", self.current_state, agent.agent_id
            )

            # 2. Assemble prompt from input artifacts
            context = self._assemble_context(state_config.get("input_artifacts", {}))
            prompt = f"Instruction: {instruction}\nContext: {context}"

            # 3. Run Agent (Now Async)
            print(f"🧠 Engine: Running LLM for role {role_name}...", flush=True)
            response = await agent.run(prompt)
            print(f"✅ Engine: LLM Result (Length: {len(response)} chars)", flush=True)
            self.last_response = response

            # If response is an abortion message from governance, we hibernate the run
            if "Execution aborted" in response or "Budget exhausted" in response:
                print(f"❄️ Engine: Run {run_id} is HIBERNATING at {self.current_state}")
                self._save_state(agent, sop_path)
                self._update_run_status(
                    run_id, "HIBERNATING", self.current_state, agent.agent_id
                )
                break

            # 4. Handle output artifacts
            self._handle_outputs(state_config.get("output_artifacts", []), response)

            next_state = self._check_transitions(state_config.get("transitions", []))

            # De-register the agent so we don't leak concurrent counts
            self.gov.deregister_agent(agent.agent_id)

            # 6. Handle manual breakpoints
            if state_config.get("breakpoint_after"):
                self._save_state(agent, sop_path)
                self._update_run_status(
                    run_id, "PAUSED", self.current_state, agent.agent_id
                )
                print(f"Breakpoint reached after {self.current_state}. Pause workflow.")
                break

            self.current_state = next_state
            if not self.current_state:
                break

        # Update run status and log completion (without broadcasting to avoid duplicate RESULT)
        self._update_run_status(run_id, "COMPLETED")
        result_text = self.last_response or ""
        self.audit.log(
            self.company_id,
            "system",
            "ACTION",
            {"type": "workflow_complete", "result": result_text, "run_id": run_id},
            broadcast=False,
        )

        # PERSISTENT NOTIFICATION for Inbox
        self.audit.notify(
            user_id=self.user_id or "dev_user",
            company_id=self.company_id,
            title="✅ Workflow Completed",
            preview=f"SOP execution finished successfully.",
            content=f"Workflow run {run_id} has completed. Result: {result_text[:200]}...",
            category="success",
        )

    def _update_run_status(
        self, run_id: str, status: str, state: str = None, agent_id: str = None
    ):
        """Update SOP run status in the DB. Be resilient for in-memory or uninitialized DBs used in tests."""
        import sqlite3

        try:
            with sqlite3.connect(self.gov.db_path) as conn:
                if state and agent_id:
                    conn.execute(
                        "UPDATE sop_runs SET status = ?, current_state = ?, last_agent_id = ? WHERE run_id = ?",
                        (status, state, agent_id, run_id),
                    )
                else:
                    conn.execute(
                        "UPDATE sop_runs SET status = ? WHERE run_id = ?",
                        (status, run_id),
                    )
        except sqlite3.OperationalError:
            # Attempt to create the table and retry the update/insert. This handles the common
            # case where tests use :memory: or a fresh DB without schema.
            try:
                with sqlite3.connect(self.gov.db_path) as conn:
                    conn.execute("""
                        CREATE TABLE IF NOT EXISTS sop_runs (
                            run_id TEXT PRIMARY KEY,
                            status TEXT,
                            current_state TEXT,
                            last_agent_id TEXT
                        )
                        """)
                    # If run_id is provided, insert or update it; otherwise create a new run row
                    if run_id:
                        conn.execute(
                            "INSERT OR REPLACE INTO sop_runs (run_id, status, current_state, last_agent_id) VALUES (?, ?, ?, ?)",
                            (run_id, status, state, agent_id),
                        )
                    else:
                        generated = f"run_{int(time.time()*1000)}"
                        conn.execute(
                            "INSERT OR REPLACE INTO sop_runs (run_id, status, current_state, last_agent_id) VALUES (?, ?, ?, ?)",
                            (generated, status, state, agent_id),
                        )
            except Exception:
                # If DB operations fail in test environments, degrade gracefully
                pass

    def _assemble_context(self, input_artifacts_config: Dict[str, Any]) -> str:
        """Read and summarize input artifacts for prompt context."""
        context_parts = []
        include = input_artifacts_config.get("include", [])

        # Automatically include user initial input if this is the start
        if self.space.exists("user_initial_input"):
            raw = self.space.read("user_initial_input")
            if raw:
                try:
                    input_val = raw.decode("utf-8", errors="ignore")
                except Exception:
                    input_val = str(raw)
                context_parts.append(f"### User Message (Initial Input):\n{input_val}")

        for name in include:
            content = self.space.read(name)
            if content:
                text = content.decode("utf-8", errors="ignore")
                # Simple context pruning:
                if len(text) > 8000:
                    text = f"{text[:4000]}... [truncated] ...{text[-4000:]}"
                context_parts.append(f"--- Artifact: {name} ---\n{text}")

        return "\n\n".join(context_parts)

    def _handle_outputs(self, outputs_config: List[Dict[str, Any]], response: str):
        """Write output artifacts to EnsembleSpace."""
        for artifact_cfg in outputs_config:
            name = artifact_cfg["name"]
            self.space.write(
                response.encode(), name, self.current_state, self.company_id
            )

    def _check_transitions(self, transitions: List[Dict[str, Any]]) -> Optional[str]:
        """Check artifact-based transitions for the next state."""
        for trans in transitions:
            if_exists = trans.get("if_exists")
            if not if_exists or self.space.exists(if_exists):
                return trans.get("to") or trans.get("next_state")
        return None

    def _save_state(self, agent: ManagedAgent, sop_path: str):
        """Serialize and save state to disk for resume later."""
        state_data = agent.serialize_state()
        save_path = f"data/saved_states/{agent.agent_id}.state"
        os.makedirs("data/saved_states", exist_ok=True)
        with open(save_path, "wb") as f:
            f.write(state_data)
        self.audit.log(
            self.company_id,
            agent.agent_id,
            "PAUSE",
            {"sop_path": sop_path, "state": self.current_state},
        )
