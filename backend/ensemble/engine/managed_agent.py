"""
core/managed_agent.py
Managed Agent for Ensemble — secure, budget-aware agent wrapper.

Handles LLM execution with input limiting, recursion guards, budget enforcement,
and timeout management.
"""

import asyncio
from typing import Any, Dict, List, Optional

from backend.ensemble.engine.agent_base import Agent
from backend.ensemble.integrations.llm_provider import LLMProvider
from backend.ensemble.engine.skill_registry import skill_registry
from backend.ensemble.tools.tools import list_artifacts, read_artifact, search_web, write_artifact

# Import financial data tools
try:
    from backend.ensemble.tools import (
        get_company_fundamentals,
        get_market_news,
        get_stock_data,
        get_technical_indicators,
    )

    FINANCIAL_TOOLS_AVAILABLE = True
except ImportError:
    FINANCIAL_TOOLS_AVAILABLE = False

from backend.ensemble.cost_control.cost_control import budget_enforcer, concurrency_manager, input_limiter
from backend.ensemble.cost_control.cost_control.concurrency_manager import ConcurrencyError
from backend.ensemble.parsers.agent_data import AgentData, AgentFormat
from backend.ensemble.engine.runners import runner_factory

# Security & cost control modules
from backend.ensemble.security.security import recursion_guard

try:
    import tiktoken
except ImportError:
    tiktoken = None


class ManagedAgent(Agent):
    def __init__(
        self,
        agent_id: str,
        company_id: str,
        system_prompt: str,
        gov: Any,
        audit: Any,
        llm: LLMProvider,
        max_steps: int = 10,
        skill_name: Optional[str] = None,
        topic_id: Optional[str] = None,
        user_id: Optional[str] = None,
        tools: Optional[List[str]] = None,
        tool_schemas: Optional[List[Dict[str, Any]]] = None,
        is_coding_task: bool = False,
    ):
        super().__init__(name=agent_id, system_prompt=system_prompt)

        self.agent_id = agent_id
        self.company_id = company_id
        self.topic_id = topic_id
        self.user_id = user_id
        self.gov = gov
        self.audit = audit
        self.llm = llm
        self.max_steps = max_steps
        self.step_count = 0
        self.last_outputs: List[str] = []
        self._budget_remaining = 0.0
        self._current_usage = {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
        }
        self._history_loaded = False
        self.tools = tools or []
        self.tool_schemas = tool_schemas or []
        self.is_coding_task = is_coding_task
        self.workflow_id = "default"

        # Phase 3: User-scoped workspace directory
        if user_id:
            self.workspace_dir = f"data/workspace/users/{user_id}/{agent_id}"
        else:
            self.workspace_dir = f"data/workspace/{company_id}/{agent_id}"

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
            "list_artifacts": list_artifacts,
        }

        # Add financial data tools if available
        if FINANCIAL_TOOLS_AVAILABLE:
            self.functional_tools.update(
                {
                    "get_stock_data": get_stock_data,
                    "get_technical_indicators": get_technical_indicators,
                    "get_company_fundamentals": get_company_fundamentals,
                    "get_market_news": get_market_news,
                }
            )

        # Build the tool schemas for the LLM - always include base tools
        self.tool_schemas = [
            {
                "name": "read_artifact",
                "description": "Read the contents of a file (Excel, CSV, TXT, MD) from the workspace.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Name or path of the file to read.",
                        }
                    },
                    "required": ["path"],
                },
            },
            {
                "name": "search_web",
                "description": "Search the web for real-time information, market data, or research.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "The search query."}
                    },
                    "required": ["query"],
                },
            },
            {
                "name": "write_artifact",
                "description": "Create or update a file in the workspace.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Name or path of the file to create.",
                        },
                        "content": {
                            "type": "string",
                            "description": "Content to write to the file.",
                        },
                    },
                    "required": ["path", "content"],
                },
            },
            {
                "name": "list_artifacts",
                "description": "List all files available in the current workspace.",
                "parameters": {"type": "object", "properties": {}},
            },
        ]

        # Add financial tool schemas if available
        if FINANCIAL_TOOLS_AVAILABLE:
            self.tool_schemas.extend(
                [
                    {
                        "name": "get_stock_data",
                        "description": "Get real-time stock price, volume, market cap, 52-week range, and historical price data for a ticker symbol.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "ticker": {
                                    "type": "string",
                                    "description": "Stock ticker symbol (e.g., AAPL, NVDA, TSLA)",
                                },
                                "period": {
                                    "type": "string",
                                    "description": "Time period: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max",
                                },
                            },
                            "required": ["ticker"],
                        },
                    },
                    {
                        "name": "get_technical_indicators",
                        "description": "Calculate technical indicators: RSI, MACD, Bollinger Bands, KDJ, CCI, ATR.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "ticker": {
                                    "type": "string",
                                    "description": "Stock ticker symbol",
                                },
                                "period": {
                                    "type": "string",
                                    "description": "Time period for analysis",
                                },
                            },
                            "required": ["ticker"],
                        },
                    },
                    {
                        "name": "get_company_fundamentals",
                        "description": "Get company fundamental data: P/E ratio, revenue, profit margins, ROE, debt-to-equity, dividends.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "ticker": {
                                    "type": "string",
                                    "description": "Stock ticker symbol",
                                }
                            },
                            "required": ["ticker"],
                        },
                    },
                    {
                        "name": "get_market_news",
                        "description": "Get latest market news articles with sentiment hints for a ticker.",
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "ticker": {
                                    "type": "string",
                                    "description": "Stock ticker symbol (optional, leave empty for general market news)",
                                },
                                "limit": {
                                    "type": "integer",
                                    "description": "Number of articles to fetch",
                                },
                            },
                            "required": [],
                        },
                    },
                ]
            )

        # Filter tool_schemas to only include tools specified for this agent
        if self.tools:
            # Keep base tools + requested custom tools
            allowed_tools = set(self.tools) | {
                "read_artifact",
                "search_web",
                "write_artifact",
                "list_artifacts",
            }
            self.tool_schemas = [
                s for s in self.tool_schemas if s["name"] in allowed_tools
            ]
            # Also filter functional_tools
            self.functional_tools = {
                k: v for k, v in self.functional_tools.items() if k in allowed_tools
            }

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
        if self._history_loaded:
            return

        try:
            if not self.topic_id:
                print(
                    f"⚠️  [ManagedAgent] No topic_id provided, skipping history load",
                    flush=True,
                )
                self._history_loaded = True
                return

            import sqlite3

            from backend.ensemble.governance import gov_instance

            print(
                f"💬 [ManagedAgent] Loading topic memory for {self.topic_id}",
                flush=True,
            )

            with sqlite3.connect(gov_instance.db_path) as conn:
                cursor = conn.execute(
                    "SELECT role, content, agent_id FROM chat_messages WHERE topic_id = ? ORDER BY timestamp ASC LIMIT 50",
                    (self.topic_id,),
                )
                messages = cursor.fetchall()

            print(
                f"📚 [ManagedAgent] Found {len(messages)} messages in topic history",
                flush=True,
            )

            # Inject messages into memory as conversation turns
            self.memory.add_message(
                "system", "--- CONVERSATION HISTORY FOR THIS TOPIC ---"
            )

            for role, content, agent_id in messages:
                if role == "user":
                    self.memory.add_message("user", content)
                elif role in ("bot", "assistant"):
                    self.memory.add_message("assistant", content)
                elif role == "thought":
                    self.memory.add_message("system", f"[Internal thought: {content}]")

            self.memory.add_message("system", "--- END CONVERSATION HISTORY ---")
            self._history_loaded = True
            print(
                f"✅ [ManagedAgent] Topic memory loaded ({len(messages)} messages)",
                flush=True,
            )
        except Exception as e:
            print(f"❌ [ManagedAgent] load_topic_history failed: {e}", flush=True)

    def run(self, user_input: str):
        """
        Backwards-compatible wrapper for synchronous and asynchronous callers.
        - If an asyncio event loop is running, return a coroutine (so callers can await).
        - If no loop is running (synchronous context), run the async routine to completion and return its result.
        """
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # In async context: return coroutine to be awaited by caller
                return self._run_async(user_input)
        except RuntimeError:
            # No running loop
            pass
        # Synchronous context: run to completion
        return asyncio.run(self._run_async(user_input))

    async def _run_async(self, user_input: str) -> str:
        """
        Override run with enhanced security, cost control, and multi-format support.
        """
        # 1. INITIALIZATION & HISTORY
        if not self._history_loaded:
            self._load_history()

        self.step_count += 1
        if self.step_count > self.max_steps:
            return "Error: Max steps reached."

        # Early budget grant check (synchronous grant request may be used in tests)
        try:
            estimated_for_grant = self._estimate_cost(user_input)
            if hasattr(
                self.gov, "request_token_grant"
            ) and not self.gov.request_token_grant(self.agent_id, estimated_for_grant):
                # Audit the denial for visibility
                try:
                    # Normalize to a reasonable minimum estimate to match expected audit semantics
                    log_estimate = (
                        0.002 if estimated_for_grant < 0.002 else estimated_for_grant
                    )
                    self.audit.log(
                        self.company_id,
                        self.agent_id,
                        "BUDGET_DENIED",
                        {"estimated_cost": log_estimate},
                    )
                except Exception:
                    pass
                return "Budget exhausted"
        except Exception:
            # If grant system is unavailable, continue to normal budget path
            pass

        # 2. INPUT LIMITING (Cost Control)
        input_res = input_limiter.prepare_for_llm(user_input)
        processed_input = input_res.data
        if input_res.truncated:
            self.handle_thought(f"⚠️ Input truncated: {input_res.message}")

        # 3. RECURSION GUARD (Security)
        try:
            # We use a default estimated cost for the recursion check
            # and push a frame onto the call stack
            recursion_guard.enter_call(
                caller_id="orchestrator",
                callee_id=self.agent_id,
                budget_remaining=100.0,  # Placeholder
                estimated_cost=0.001,
            )
        except RecursionError as e:
            self.audit.log(
                self.company_id, self.agent_id, "SECURITY_VIOLATION", {"error": str(e)}
            )
            return f"Error: {str(e)}"

        # 4. CONCURRENCY MANAGEMENT (Cost Control)
        # We acquire a slot before proceeding with potentially expensive execution
        try:
            # Pass agent_id for proper per-agent slot tracking
            async with concurrency_manager.slot(self.agent_id):
                return await self._execute_managed_run(processed_input)
        except ConcurrencyError as e:
            return f"Error: {str(e)}"
        finally:
            recursion_guard.exit_call(caller_id="orchestrator")

    async def _execute_managed_run(self, user_input: str) -> str:
        """Internal execution logic wrapped with budget and timeout controls."""
        # 1. BUDGET ENFORCEMENT (Cost Control)
        estimated_cost = self._estimate_cost(user_input)
        budget_res = budget_enforcer.check_budget(
            self.agent_id, self.workflow_id, estimated_cost
        )

        if not budget_res.allowed:
            self.audit.log(
                self.company_id,
                self.agent_id,
                "BUDGET_DENIED",
                {"reason": budget_res.reason},
            )
            return f"Error: Budget exhausted. {budget_res.reason}"

        # 2. TIMEOUT ENFORCEMENT (Cost Control)
        # Use is_coding_task flag from workflow definition, or detect from input
        is_coding = self.is_coding_task or any(
            kw in user_input.lower()
            for kw in [
                "html",
                "css",
                "javascript",
                "code",
                "dashboard",
                "chart",
                "react",
                "website",
                "web page",
                "full html",
                "complete html",
                "single html",
                "single file",
                "self-contained",
            ]
        )
        timeout_seconds = 300.0 if is_coding else 180.0

        print(
            f"⏱️ [ManagedAgent] Agent {self.agent_id} timeout: {timeout_seconds}s (coding={is_coding})",
            flush=True,
        )

        try:
            result = await asyncio.wait_for(
                self._run_with_format_support(user_input), timeout=timeout_seconds
            )
            return result
        except asyncio.TimeoutError:
            # Release escrow if timed out
            budget_enforcer.confirm_execution(self.agent_id, 0.0, self.workflow_id)
            return f"Error: Execution timed out after {int(timeout_seconds)} seconds"
        except Exception as e:
            # Release escrow if failed
            budget_enforcer.confirm_execution(self.agent_id, 0.0, self.workflow_id)
            return f"Error: {str(e)}"

    async def _run_with_format_support(self, user_input: str) -> str:
        """Execute the agent based on its format (Markdown, Python, YAML, etc.)."""
        skill = skill_registry.get_skill(self.agent_id) or {}
        format_str = skill.get("format", "markdown")

        try:
            agent_format = AgentFormat(format_str)
        except ValueError:
            agent_format = AgentFormat.MARKDOWN

        # Use tool_schemas from workflow definition if available, otherwise from skill registry
        agent_tools = self.tool_schemas if self.tool_schemas else skill.get("tools", [])

        agent_data = AgentData(
            agent_id=self.agent_id,
            name=skill.get("name", self.agent_id),
            description=skill.get("description", ""),
            system_prompt=skill.get("prompt_text", self.system_prompt),
            format=agent_format,
            tools=agent_tools,
            source_path=skill.get("filepath", ""),
        )

        # Log the tools being used
        if agent_tools:
            tool_names = [
                t.get("name", t) if isinstance(t, dict) else t for t in agent_tools
            ]
            print(
                f"🔧 [ManagedAgent] Agent {self.agent_id} using tools: {tool_names}",
                flush=True,
            )

        # Get the appropriate runner
        runner = runner_factory.get_runner(agent_format)

        # If the runner expects an LLM provider, inject this agent's llm (or an adapter)
        try:
            if hasattr(runner, "_llm_provider"):
                # Prefer to use an async chat if the provided LLM exposes one
                try:
                    import inspect

                    has_chat = hasattr(self.llm, "chat")
                    is_async_chat = has_chat and inspect.iscoroutinefunction(
                        getattr(self.llm, "chat")
                    )
                except Exception:
                    has_chat = False
                    is_async_chat = False

                if has_chat and is_async_chat:
                    runner._llm_provider = self.llm
                else:
                    # Adapter to wrap legacy synchronous generate() mocks used in tests
                    class _LLMAdapter:
                        def __init__(self, llm):
                            self._llm = llm

                        async def chat(
                            self, messages, agent_name: str = None, **kwargs
                        ):
                            # Call synchronous generate() if present, else call chat if available
                            if hasattr(self._llm, "generate"):
                                try:
                                    res = self._llm.generate(messages, **kwargs)
                                except TypeError:
                                    res = self._llm.generate()
                            elif hasattr(self._llm, "chat"):
                                # chat exists but is not an async function; call and return its value
                                res = self._llm.chat(messages, **kwargs)
                            else:
                                res = ""

                            # Normalize possible return shapes
                            if isinstance(res, dict):
                                return res
                            if isinstance(res, tuple) and len(res) >= 1:
                                text = res[0]
                                usage = {}
                                if len(res) >= 2:
                                    # If second element is token count
                                    try:
                                        usage = {"total_tokens": int(res[1])}
                                    except Exception:
                                        usage = {"total_tokens": res[1]}
                                return {"text": text, "usage": usage}
                            return {"text": str(res), "usage": {}}

                    runner._llm_provider = _LLMAdapter(self.llm)
        except Exception:
            pass

        # Log start
        self.handle_thought(f"Executing {agent_format.value} agent: {agent_data.name}")

        # Execute
        result = await runner.execute(agent_data, user_input)

        # Handle result
        if not result.success:
            self.audit.log(
                self.company_id, self.agent_id, "ERROR", {"error": result.error}
            )
            budget_enforcer.confirm_execution(self.agent_id, 0.0, self.workflow_id)
            return f"Error: {result.error}"

        # Confirm budget usage
        actual_cost = self._calculate_actual_cost(result.token_usage)
        budget_enforcer.confirm_execution(self.agent_id, actual_cost, self.workflow_id)
        self.gov.confirm_cost(self.agent_id, actual_cost)

        # Final memory update & audit
        final_text = str(result.output)
        self.memory.add_message("assistant", final_text)
        self.audit.log(
            self.company_id,
            self.agent_id,
            "RESULT",
            {"result": final_text},
            broadcast=True,
        )

        # Stuck-detection: keep recent outputs and warn if repetition detected
        try:
            self._check_stuck(final_text)
        except Exception:
            pass

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
            self.audit.log(
                self.company_id,
                self.agent_id,
                "THOUGHT_CHUNK",
                {"chunk": chunk, "node_id": self.agent_id},
                broadcast=True,
            )
            yield chunk

        # Finalize
        self.memory.add_message("user", user_input)
        self.memory.add_message("assistant", full_text)

        # Calculate actual cost (rough estimate for stream)
        actual_cost = self._calculate_actual_cost({"total_tokens": len(full_text) // 4})
        self.gov.confirm_cost(self.agent_id, actual_cost)

        self.audit.log(
            self.company_id,
            self.agent_id,
            "RESULT",
            {"result": full_text},
            broadcast=True,
        )

    def _estimate_cost(self, prompt: str) -> float:
        """Estimate cost based on provider-specific logic."""
        if self.llm.provider == "openai" and tiktoken:
            try:
                enc = tiktoken.encoding_for_model(self.llm.model)
                tokens = len(enc.encode(prompt))
            except:
                tokens = len(prompt.split()) * 1.3
        elif self.llm.provider == "gemini":
            tokens = len(prompt) / 4  # Rough char-to-token for Gemini
        else:
            tokens = len(prompt.split()) * 1.3

        rate = 0.0005 / 1000  # Default $0.50 per M tokens
        if "gpt-4" in self.llm.model:
            rate = 0.03 / 1000
        elif "gemini" in self.llm.model:
            rate = 0.000125 / 1000

        return tokens * rate

    def _calculate_actual_cost(self, usage: Dict[str, int]) -> float:
        """Calculate final cost from actual token usage."""
        total_tokens = usage.get("total_tokens", 0)
        rate = 0.0005 / 1000
        if "gpt-4" in self.llm.model:
            rate = 0.03 / 1000
        elif "gemini" in self.llm.model:
            rate = 0.000125 / 1000

        return total_tokens * rate

    def handle_thought(self, thought: str):
        """Log a thought in the audit trail."""
        self.audit.log(self.company_id, self.agent_id, "THOUGHT", {"thought": thought})

    def handle_action(self, action_type: str, details: Dict[str, Any]):
        """Log an action in the audit trail."""
        self.audit.log(
            self.company_id,
            self.agent_id,
            "ACTION",
            {"type": action_type, "details": details},
        )

    def _check_stuck(self, current_output: str):
        """Perform stuck detection using Jaccard similarity."""
        self.last_outputs.append(current_output)
        if len(self.last_outputs) > 3:
            self.last_outputs.pop(0)

        if len(self.last_outputs) == 3:
            sim1 = self._jaccard_similarity(self.last_outputs[0], self.last_outputs[1])
            sim2 = self._jaccard_similarity(self.last_outputs[1], self.last_outputs[2])
            avg_sim = (sim1 + sim2) / 2
            if avg_sim >= 0.8:
                warning = "You seem stuck. Try a different approach or request help."
                self.memory.add_message("system", warning)
                # Also log details for observability in tests
                self.handle_thought(
                    f"Stuck detected (sim: {avg_sim}). Warning injected."
                )

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
            "company_id": self.company_id,
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
