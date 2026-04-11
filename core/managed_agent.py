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

from core.tools import read_artifact, search_web, write_artifact, list_artifacts

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
        self.tools = []

        # Apply specialization AFTER initialization so logging (audit) works
        if skill_name:
            self._apply_skill(skill_name)
        else:
            self._apply_skill("default_agent")

        # Initialize Functional Tools (The Toolbelt)
        self.functional_tools = {
            "read_artifact": read_artifact,
            "search_web": search_web,
            "write_artifact": write_artifact,
            "list_artifacts": list_artifacts
        }
        
        # Build the tool schemas for the LLM
        self.tool_schemas = [
            {
                "name": "read_artifact",
                "description": "Read the contents of a file (Excel, CSV, TXT, MD) from the workspace.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "Name or path of the file to read."}
                    },
                    "required": ["path"]
                }
            },
            {
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
            {
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
            {
                "name": "list_artifacts",
                "description": "List all files available in the current workspace.",
                "parameters": {"type": "object", "properties": {}}
            }
        ]

    def _apply_skill(self, skill_name: str):
        """Prepend skill prompt and register tools."""
        skill = skill_registry.get_skill(skill_name)
        if skill:
            # Store tools for LLM calls
            self.tools = skill.tools or []
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
        estimated_cost = self._estimate_cost(user_input)

        # Check budget
        if not self.gov.request_token_grant(self.agent_id, estimated_cost):
            self.audit.log(self.company_id, self.agent_id, "BUDGET_DENIED", {"estimated_cost": estimated_cost})
            return "Budget exhausted"

        # Prepare messages
        budget = self.gov.get_company_budget_status(self.company_id)
        messages = [{"role": "system", "content": self.system_prompt}]
        for m in self.memory.get_messages():
            messages.append({"role": m.role, "content": m.content})

        user_header = f"--- SESSION STATE ---\nCOMPANY: {self.company_id}\nBUDGET: ${budget['spent']:.4f}\n\n"
        # Only add the user input to memory once
        if not any(m.role == "user" and user_input in m.content for m in self.memory.get_messages()):
            self.memory.add_message("user", user_input)

        messages.append({"role": "user", "content": user_header + user_input})

        # 🆕 Get model override for this agent
        model_override = skill_registry.get_model_override(self.agent_id)
        use_override = model_override is not None

        # --- EXECUTION LOOP (Multi-turn Tool Calling) ---
        max_tool_turns = 10
        current_turn = 0
        final_text = ""

        while current_turn < max_tool_turns:
            current_turn += 1

            # Call LLM with functional tools (use model override if available)
            if use_override:
                response_data = await self.llm.chat_with_model(
                    messages, 
                    model_override=model_override, 
                    tools=self.tool_schemas
                )
            else:
                response_data = await self.llm.chat(messages, tools=self.tool_schemas)
            
            # Track cost
            actual_cost = self._calculate_actual_cost(response_data.get("usage", {}))
            self.gov.confirm_cost(self.agent_id, actual_cost)
            
            # Extract content and function call
            text = response_data.get("text", "")
            func_call = response_data.get("functionCall")

            if not func_call:
                # No more tools to call, we are done
                final_text = text
                break
            
            # Handle tool call
            tool_name = func_call["name"]
            tool_args = func_call["args"]

            # Log action
            self.handle_thought(f"Executing tool: {tool_name} with args: {tool_args}")
            self.audit.log(self.company_id, self.agent_id, "ACTION", {"tool": tool_name, "args": tool_args}, broadcast=True)

            try:
                # Execute the tool
                if tool_name in self.functional_tools:
                    tool_func = self.functional_tools[tool_name]
                    # Note: These tools are synchronous in core.tools, so we call them normally
                    result = tool_func(**tool_args)
                else:
                    result = f"Error: Tool {tool_name} not found."
                
                # Append tool result to messages for the next LLM turn
                messages.append({"role": "assistant", "content": text, "functionCall": func_call})
                messages.append({"role": "function", "name": tool_name, "content": str(result)})
                
                # Log the result
                self.audit.log(self.company_id, self.agent_id, "TOOL_RESULT", {"tool": tool_name, "result": str(result)[:500]}, broadcast=True)
                
            except Exception as e:
                error_msg = f"Error executing {tool_name}: {e}"
                messages.append({"role": "assistant", "content": text, "functionCall": func_call})
                messages.append({"role": "function", "name": tool_name, "content": error_msg})
                self.handle_thought(f"Tool execution failed: {error_msg}")

        # Final memory update
        self.memory.add_message("assistant", final_text)
        self.audit.log(self.company_id, self.agent_id, "RESULT", {"result": final_text}, broadcast=True)
        return final_text

    async def run_stream(self, user_input: str):
        """Asynchronous generator that yields response chunks and broadcasts them."""
        if not self._history_loaded:
            self._load_history()

        self.step_count += 1
        estimated_cost = self._estimate_cost(user_input)
        if not self.gov.request_token_grant(self.agent_id, estimated_cost):
            yield "Error: Budget exhausted"
            return

        messages = [{"role": "system", "content": self.system_prompt}]
        for m in self.memory.get_messages():
            messages.append({"role": m.role, "content": m.content})
        messages.append({"role": "user", "content": user_input})

        full_text = ""
        async for chunk in self.llm.chat_stream(messages, tools=self.tools):
            full_text += chunk
            # Broadcast each thought chunk for the Neural Mirror
            self.audit.log(self.company_id, self.agent_id, "THOUGHT_CHUNK", {"chunk": chunk, "node_id": self.agent_id}, broadcast=True)
            yield chunk

        # Finalize
        self.memory.add_message("user", user_input)
        self.memory.add_message("assistant", full_text)
        
        # Calculate actual cost (rough estimate for stream)
        actual_cost = self._calculate_actual_cost({"total_tokens": len(full_text) // 4})
        self.gov.confirm_cost(self.agent_id, actual_cost)
        
        self.audit.log(self.company_id, self.agent_id, "RESULT", {"result": full_text}, broadcast=True)

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
