"""
core/runners/json_runner.py
Runner for JSON-format agents.

Parses JSON manifest and executes based on the configuration.
Supports SuperAGI and generic JSON agent formats.
"""
import json
import time
import logging
from typing import Any, Dict, Optional

from core.parsers.agent_data import AgentData, AgentFormat
from core.runners.base_runner import BaseRunner, RunnerResult

logger = logging.getLogger(__name__)


class JSONRunner(BaseRunner):
    """
    Runner for JSON-format agents.

    Executes agents based on JSON manifest configuration.
    Supports SuperAGI format and generic JSON agent specifications.
    """

    def __init__(self, llm_provider=None, timeout: float = 60.0):
        """
        Initialize the JSON runner.

        Args:
            llm_provider: LLMProvider instance for making API calls.
            timeout: Maximum execution time in seconds.
        """
        super().__init__(timeout=timeout)
        self._llm_provider = llm_provider

    @property
    def llm_provider(self):
        """Lazily initialize the LLM provider."""
        if self._llm_provider is None:
            from core.llm_provider import LLMProvider
            self._llm_provider = LLMProvider()
        return self._llm_provider

    def can_execute(self, agent_data: AgentData) -> bool:
        """Check if this runner can execute the given agent."""
        return agent_data.format == AgentFormat.JSON

    async def execute(
        self, agent_data: AgentData, input_data: Any = None
    ) -> RunnerResult:
        """
        Execute a JSON-configured agent.

        Parses the JSON manifest and executes based on the configuration.

        Args:
            agent_data: The parsed agent specification.
            input_data: Optional input data for the agent.

        Returns:
            RunnerResult with execution output.
        """
        self._log_execution_start(agent_data)
        start_time = time.time()

        try:
            # Parse the JSON config
            config = self._parse_config(agent_data)

            # Determine agent type from config
            agent_type = self._determine_type(config, agent_data)

            # Execute based on type
            if agent_type == "conversational":
                result = await self._execute_conversational(
                    agent_data, config, input_data
                )
            elif agent_type == "task":
                result = await self._execute_task(agent_data, config, input_data)
            else:
                result = await self._execute_generic(agent_data, config, input_data)

            execution_time = time.time() - start_time
            result.execution_time_seconds = execution_time
            result.metadata["agent_format"] = "json"
            result.metadata["agent_type"] = agent_type

            self._log_execution_end(result, agent_data)
            return result

        except Exception as e:
            execution_time = time.time() - start_time
            result = self._create_error_result(e, execution_time)
            result.metadata = {
                "agent_format": "json",
                "config_keys": list(agent_data.config.keys()) if agent_data.config else [],
            }
            self._log_execution_end(result, agent_data)
            return result

    def _parse_config(self, agent_data: AgentData) -> Dict[str, Any]:
        """Parse the raw JSON content into a config dictionary."""
        raw_content = agent_data.raw_content
        if not raw_content:
            return agent_data.config

        try:
            data = json.loads(raw_content)
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError as e:
            self.logger.warning(f"Failed to re-parse JSON config: {e}")

        return agent_data.config

    def _determine_type(
        self, config: Dict[str, Any], agent_data: AgentData
    ) -> str:
        """
        Determine agent type from config.

        Returns one of:
        - conversational: Chat-based agent
        - task: Task-based agent with defined steps
        - generic: Default fallback
        """
        agent_type = config.get("agent_type", "").lower()

        if agent_type in ("conversational", "chat", "chatbot", "assistant"):
            return "conversational"

        if agent_type in ("task", "worker", "processor"):
            return "task"

        # Infer from structure
        if "conversation_history" in config or "greeting" in config:
            return "conversational"

        if "steps" in config or "workflow" in config or "tasks" in config:
            return "task"

        # Check agent_data config
        if agent_data.config.get("agent_type", "").lower() in (
            "conversational", "chat", "chatbot"
        ):
            return "conversational"

        return "generic"

    async def _execute_conversational(
        self, agent_data: AgentData, config: Dict[str, Any], input_data: Any
    ) -> RunnerResult:
        """Execute as a conversational agent."""
        messages = []

        # System prompt
        system_parts = []
        if agent_data.system_prompt:
            system_parts.append(agent_data.system_prompt)
        elif config.get("system_prompt"):
            system_parts.append(config["system_prompt"])
        elif config.get("instructions"):
            system_parts.append(config["instructions"])
        elif config.get("role"):
            system_parts.append(f"You are {config['role']}.")

        if system_parts:
            messages.append({
                "role": "system",
                "content": "\n".join(system_parts),
            })

        # Greeting (if any)
        greeting = config.get("greeting", "")
        if greeting:
            messages.append({
                "role": "assistant",
                "content": greeting,
            })

        # User input
        user_content = str(input_data) if input_data else ""
        if not user_content and agent_data.body_prompt:
            user_content = agent_data.body_prompt

        if user_content:
            messages.append({
                "role": "user",
                "content": user_content,
            })

        if not messages:
            messages.append({
                "role": "user",
                "content": "Hello",
            })

        kwargs = self._build_kwargs(agent_data, config)
        response = await self.llm_provider.chat(
            messages, agent_name=agent_data.name, **kwargs
        )

        text = response.get("text", "")
        usage = response.get("usage", {})

        return self._create_success_result(
            output=text,
            token_usage=usage,
            metadata={"strategy": "conversational"},
        )

    async def _execute_task(
        self, agent_data: AgentData, config: Dict[str, Any], input_data: Any
    ) -> RunnerResult:
        """Execute as a task-based agent."""
        steps = (
            config.get("steps")
            or config.get("workflow")
            or config.get("tasks")
            or []
        )

        if not steps and agent_data.body_prompt:
            # No steps defined, use body prompt as single task
            return await self._execute_conversational(agent_data, config, input_data)

        result_text = ""
        current_context = str(input_data) if input_data else ""

        for i, step in enumerate(steps):
            step_prompt = ""
            if isinstance(step, str):
                step_prompt = step
            elif isinstance(step, dict):
                step_prompt = step.get("prompt", step.get("instruction", step.get("task", "")))

            if not step_prompt:
                continue

            messages = []
            if agent_data.system_prompt:
                messages.append({
                    "role": "system",
                    "content": agent_data.system_prompt,
                })
            messages.append({
                "role": "user",
                "content": f"{step_prompt}\n\nInput/Context: {current_context}",
            })

            response = await self.llm_provider.chat(
                messages, agent_name=agent_data.name
            )
            step_output = response.get("text", "")
            result_text += f"\n--- Task {i + 1} ---\n{step_output}"
            current_context = step_output

        return self._create_success_result(
            output=result_text.strip(),
            metadata={"strategy": "task", "tasks_executed": len(steps)},
        )

    async def _execute_generic(
        self, agent_data: AgentData, config: Dict[str, Any], input_data: Any
    ) -> RunnerResult:
        """Execute with generic strategy (fallback to conversational)."""
        return await self._execute_conversational(agent_data, config, input_data)

    def _build_kwargs(
        self, agent_data: AgentData, config: Dict[str, Any]
    ) -> dict:
        """Build LLM call kwargs."""
        kwargs = {}

        model = agent_data.model or config.get("model", config.get("llm", ""))
        if model:
            kwargs["model"] = model

        temp = agent_data.temperature
        if temp is None:
            temp = config.get("temperature")
        if temp is not None:
            kwargs["temperature"] = float(temp)

        max_t = agent_data.max_tokens
        if max_t is None:
            max_t = config.get("max_tokens", config.get("max_length"))
        if max_t is not None:
            kwargs["max_tokens"] = int(max_t)

        tools = agent_data.tools or config.get("tools", [])
        if tools:
            kwargs["tools"] = tools

        return kwargs
