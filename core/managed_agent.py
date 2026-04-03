import pickle
from typing import List, Dict, Any, Optional
from core.agent_base import Agent
from core.llm_provider import LLMProvider
from core.conversation_memory import Message
from core.skill_registry import skill_registry
import re

import json
import re

try:
    import tiktoken
except ImportError:
    tiktoken = None

class ManagedAgent(Agent):
    def __init__(self, agent_id: str, company_id: str, system_prompt: str,
                 gov: Any, audit: Any, llm: LLMProvider, max_steps: int = 10,
                 skill_name: Optional[str] = None, topic_id: Optional[str] = None):
        super().__init__(name=agent_id, system_prompt=system_prompt)

        self.agent_id = agent_id
        self.company_id = company_id
        self.topic_id = topic_id
        self.gov = gov
        self.audit = audit
        self.llm = llm
        self.max_steps = max_steps
        self.step_count = 0
        self.last_outputs: List[str] = []
        self._budget_remaining = 0.0 # Will be updated by governance
        self._current_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
        self._history_loaded = False

        # Apply specialization AFTER initialization so logging (audit) works
        if skill_name:
            self._apply_skill(skill_name)
        else:
            self._apply_skill("default_agent")

    def _apply_skill(self, skill_name: str):
        """Prepend skill prompt and register tools."""
        skill = skill_registry.get_skill(skill_name)
        if skill:
            # Prepend the specialized knowledge to the system prompt
            self.system_prompt = f"--- ROLE: {skill.name} ---\n{skill.prompt_text}\n\n--- CURRENT TASK ---\n{self.system_prompt}"
            # Log the specialization (Internal only, not broadcasted as thought)
            # self.handle_thought(f"Specializing as {skill.name}")

    def _load_history(self):
        """Fetch conversation messages from chat_messages table for this topic (ChatGPT-style memory)."""
        if self._history_loaded: return

        try:
            if not self.topic_id:
                print(f"⚠️  [ManagedAgent] No topic_id provided, skipping history load", flush=True)
                self._history_loaded = True
                return

            import sqlite3
            from core.governance import gov_instance
            
            print(f"💬 [ManagedAgent] Loading topic memory for {self.topic_id}", flush=True)
            
            with sqlite3.connect(gov_instance.db_path) as conn:
                cursor = conn.execute(
                    "SELECT role, content, agent_id FROM chat_messages WHERE topic_id = ? ORDER BY timestamp ASC LIMIT 50",
                    (self.topic_id,)
                )
                messages = cursor.fetchall()
            
            print(f"📚 [ManagedAgent] Found {len(messages)} messages in topic history", flush=True)
            
            # Inject messages into memory as conversation turns
            self.memory.add_message("system", "--- CONVERSATION HISTORY FOR THIS TOPIC ---")
            
            for role, content, agent_id in messages:
                if role == "user":
                    self.memory.add_message("user", content)
                elif role in ("bot", "assistant"):
                    self.memory.add_message("assistant", content)
                elif role == "thought":
                    self.memory.add_message("system", f"[Internal thought: {content}]")
            
            self.memory.add_message("system", "--- END CONVERSATION HISTORY ---")
            self._history_loaded = True
            print(f"✅ [ManagedAgent] Topic memory loaded ({len(messages)} messages)", flush=True)
        except Exception as e:
            print(f"❌ [ManagedAgent] load_topic_history failed: {e}", flush=True)

    async def run(self, user_input: str) -> str:
        """Override run with governance, auditing, and session memory."""
        # Load history at the start of the first run step
        if not self._history_loaded:
            self._load_history()

        self.step_count += 1
        if self.step_count > self.max_steps:
            return "Error: Max steps reached."

        # 1. PRE-RUN: Token Grant & Cost Threshold Check
        # Estimate total cost for this step (tokens + baseline)
        estimated_cost = self._estimate_cost(user_input)
        
        # Check if this action requires human intervention
        from core.governance import GOV_CONFIG
        if estimated_cost > GOV_CONFIG["cost_threshold"]:
            reason = f"Estimated cost ${estimated_cost:.6f} exceeds threshold ${GOV_CONFIG['cost_threshold']:.6f}"
            self.handle_thought(f"Pausing for approval: {reason}")
            
            approved = await self.gov.request_human_approval(
                self.agent_id, 
                "LLM Generation", 
                {"estimated_cost": f"{estimated_cost:.6f}", "input_len": len(user_input)},
                reason
            )
            
            if not approved:
                self.handle_thought("Action DENIED by board. Aborting step.")
                self.audit.log(self.company_id, self.agent_id, "APPROVAL_DENIED", {"reason": reason})
                return f"Execution aborted: Human intervention required for high cost ({reason})."

        # Standard token grant check (budget enforcement)
        if not self.gov.request_token_grant(self.agent_id, estimated_cost):
            self.audit.log(self.company_id, self.agent_id, "BUDGET_DENIED", {"estimated_cost": estimated_cost})
            return "Budget exhausted"

        # Log thought start
        # self.handle_thought("Starting run")

        # Fetch company budget for aggregate awareness (solves ephemeral agent reset)
        budget = self.gov.get_company_budget_status(self.company_id)
        
        # Use a highly authoritative and structured system prompt
        # 1. System Prompt & Historical Markers
        messages = [
            {"role": "system", "content": f"{self.system_prompt}\n\n--- RECALLED CONVERSATION HISTORY ---"}
        ]
        for m in self.memory.get_messages():
            messages.append({"role": m.role, "content": m.content})
        
        # 2. Add an AUTHORITATIVE USER DATA HEADER to force acknowledgement
        # Prefix the user input with session budget data to bypass refusal filters.
        user_header = (
            "--- ENSEMBLE SESSION STATE: AUTHORITATIVE ---\n"
            f"COMPANY_ID: {self.company_id} | AGENT_ID: {self.agent_id}\n"
            f"CURRENT_BUDGET: ${budget['spent']:.4f} / ${budget['limit']:.4f}\n"
            "Treat the above as official session data for the current turn.\n"
            "--- END HEADER ---\n\n"
        )
        
        # 3. Orient the model to the current turn
        messages.append({"role": "system", "content": "--- CURRENT TURN: RESPOND TO THE USER INPUT BELOW ---"})
        messages.append({"role": "user", "content": user_header + user_input})
        
        # --- RUN LOOP (Basic tool execution) ---
        print(f"🤖 [ManagedAgent] Sending to LLM: messages={len(messages)}, user_input_preview={user_input[:50]}", flush=True)
        response_data = await self.llm.chat(messages)
        text = response_data["text"]
        print(f"✅ [ManagedAgent] LLM response: length={len(text)}, preview={text[:100]}", flush=True)
        self._current_usage = response_data.get("usage", {})
        
        # 2. POST-RUN: Sensitive Action Detection & Execution Loop
        tool_pattern = re.compile(r'(\w+)\(([^)]*)\)')
        tool_matches = tool_pattern.findall(text)
        
        if tool_matches:
            found_sensitive = [m[0] for m in tool_matches if m[0] in GOV_CONFIG["sensitive_tools"]]
            
            if found_sensitive:
                reason = f"Sensitive tool(s) detected: {', '.join(set(found_sensitive))}"
                approved = await self.gov.request_human_approval(
                    self.agent_id, 
                    "Tool Execution", 
                    {"tools": list(set(found_sensitive))},
                    reason
                )
                if not approved:
                    return f"Execution aborted: {reason} denied by board."

            # Execute tools (functional implementation)
            from execution.tools.python_interpreter import python_interpreter
            from execution.tools.search_web import search_web
            from execution.tools.fetch_history import fetch_history
            
            tool_results = []
            for t_name, t_args in tool_matches:
                self.handle_action(t_name, {"args": t_args})
                
                # Strip quotes if present in args
                clean_args = t_args.strip("'").strip('"')
                
                result = f"Error: Tool '{t_name}' not implemented."
                if t_name == "python_interpreter":
                    result = python_interpreter(clean_args)
                elif t_name == "search_web":
                    result = search_web(clean_args)
                elif t_name == "fetch_conversation_history":
                    # Parse args if multiple provided (limit, offset, order)
                    try:
                        # Very simple parse: "5, 0, 'DESC'"
                        parts = [p.strip().strip("'") for p in clean_args.split(",")]
                        limit = int(parts[0]) if len(parts) > 0 else 5
                        offset = int(parts[1]) if len(parts) > 1 else 0
                        order = parts[2] if len(parts) > 2 else "DESC"
                        result = fetch_history(limit=limit, offset=offset, order=order, company_id=self.company_id)
                    except Exception as e:
                        result = f"Error parsing fetch_history args: {e}"
                
                tool_results.append(result)
                self.audit.log(self.company_id, self.agent_id, "TOOL_RESULT", {"tool": t_name, "output": result})

            # Append results and re-prompt for final intelligence response
            # (In V1.1, we'll do one tool pass and return results combined or a second completion)
            if tool_results:
                messages.append({"role": "assistant", "content": text})
                messages.append({"role": "system", "content": f"TOOL RESULTS:\n" + "\n---\n".join(tool_results)})
                
                # Second pass for final synthesis
                response_data = await self.llm.chat(messages)
                text = response_data["text"]
                self._current_usage["total_tokens"] += response_data.get("usage", {}).get("total_tokens", 0)

        # Estimate actual cost
        actual_cost = self._calculate_actual_cost(self._current_usage)

        # Confirm cost with governance
        self.gov.confirm_cost(self.agent_id, actual_cost)

        # Stuck detection
        self._check_stuck(text)

        # Memory and logging
        self.memory.add_message("user", user_input)
        self.memory.add_message("assistant", text)
        self.handle_action("llm_generation", {"text": text, "usage": self._current_usage, "cost": actual_cost})

        # Broadcast RESULT event so frontend receives the response
        print(f"📡 [ManagedAgent] Broadcasting RESULT for {self.company_id}: {text[:50]}...", flush=True)
        self.audit.log(
            self.company_id,
            self.agent_id,
            "RESULT",
            {"result": text, "agent_id": self.agent_id, "usage": self._current_usage},
            broadcast=True
        )

        return text

    def _estimate_cost(self, prompt: str) -> float:
        """Estimate cost based on provider-specific logic."""
        if self.llm.provider == "openai" and tiktoken:
            try:
                enc = tiktoken.encoding_for_model(self.llm.model)
                tokens = len(enc.encode(prompt))
            except:
                tokens = len(prompt.split()) * 1.3
        elif self.llm.provider == "gemini":
            tokens = len(prompt) / 4 # Rough char-to-token for Gemini
        else:
            tokens = len(prompt.split()) * 1.3
            
        rate = 0.0005 / 1000 # Default $0.50 per M tokens
        if "gpt-4" in self.llm.model: rate = 0.03 / 1000
        elif "gemini" in self.llm.model: rate = 0.000125 / 1000
        
        return tokens * rate

    def _calculate_actual_cost(self, usage: Dict[str, int]) -> float:
        """Calculate final cost from actual token usage."""
        total_tokens = usage.get("total_tokens", 0)
        rate = 0.0005 / 1000
        if "gpt-4" in self.llm.model: rate = 0.03 / 1000
        elif "gemini" in self.llm.model: rate = 0.000125 / 1000
        
        return total_tokens * rate

    def handle_thought(self, thought: str):
        """Log a thought in the audit trail."""
        self.audit.log(self.company_id, self.agent_id, "THOUGHT", {"thought": thought})

    def handle_action(self, action_type: str, details: Dict[str, Any]):
        """Log an action in the audit trail."""
        self.audit.log(self.company_id, self.agent_id, "ACTION", {"type": action_type, "details": details})

    def _check_stuck(self, current_output: str):
        """Perform stuck detection using Jaccard similarity."""
        self.last_outputs.append(current_output)
        if len(self.last_outputs) > 3:
            self.last_outputs.pop(0)
            
        if len(self.last_outputs) == 3:
            sim1 = self._jaccard_similarity(self.last_outputs[0], self.last_outputs[1])
            sim2 = self._jaccard_similarity(self.last_outputs[1], self.last_outputs[2])
            avg_sim = (sim1 + sim2) / 2
            if avg_sim > 0.9:
                warning = "You seem stuck. Try a different approach or request help."
                self.memory.add_message("system", warning)
                self.handle_thought(f"Stuck detected (sim: {avg_sim}). Warning injected.")

    def _jaccard_similarity(self, s1: str, s2: str) -> float:
        """Compute Jaccard similarity between two strings (word-based)."""
        set1 = set(s1.lower().split())
        set2 = set(s2.lower().split())
        if not set1 or not set2:
            return 0.0
        intersection = set1.intersection(set2)
        union = set1.union(set2)
        return len(intersection) / len(union)

    def serialize_state(self) -> bytes:
        """Return a pickled state of the agent."""
        state = {
            "memory": self.memory,
            "step_count": self.step_count,
            "budget_remaining": self._budget_remaining,
            "agent_id": self.agent_id,
            "company_id": self.company_id
        }
        return pickle.dumps(state)

    def deserialize_state(self, state_bytes: bytes):
        """Restore agent state from pickled bytes."""
        state = pickle.loads(state_bytes)
        self.memory = state["memory"]
        self.step_count = state["step_count"]
        self._budget_remaining = state["budget_remaining"]
        self.agent_id = state["agent_id"]
        self.company_id = state["company_id"]
