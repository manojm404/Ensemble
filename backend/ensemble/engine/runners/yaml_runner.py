"""
core/runners/yaml_runner.py
Runner for YAML-format agents.

Loads YAML configuration and executes agents based on the config structure.
Supports LangChain-style and generic YAML agent configurations.
"""

import logging
import time
from typing import Any, Dict

import yaml

from backend.ensemble.parsers.agent_data import AgentData, AgentFormat

from .base_runner import BaseRunner, RunnerResult

logger = logging.getLogger(__name__)


class YAMLRunner(BaseRunner):
    """
    Runner for YAML-format agents.

    Executes agents based on YAML configuration. The runner interprets
    the config to determine how to construct and execute the agent.
    """

    def __init__(self, llm_provider=None, timeout: float = 60.0):
        """
        Initialize the YAML runner.

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
            from backend.ensemble.llm_provider import LLMProvider

            self._llm_provider = LLMProvider()
        return self._llm_provider

    def can_execute(self, agent_data: AgentData) -> bool:
        """Check if this runner can execute the given agent."""
        return agent_data.format == AgentFormat.YAML

    async def execute(
        self, agent_data: AgentData, input_data: Any = None
    ) -> RunnerResult:
        """
        Execute a YAML-configured agent.

        Interprets the YAML config and executes based on the configuration.

        Args:
            agent_data: The parsed agent specification.
            input_data: Optional input data for the agent.

        Returns:
            RunnerResult with execution output.
        """
        self._log_execution_start(agent_data)
        start_time = time.time()

        try:
            # Parse the YAML config
            config = self._parse_config(agent_data)

            # Determine execution strategy
            strategy = self._determine_strategy(config, agent_data)

            # Execute based on strategy
            if strategy == "llm_prompt":
                result = await self._execute_llm_prompt(agent_data, config, input_data)
            elif strategy == "llm_chain":
                result = await self._execute_llm_chain(agent_data, config, input_data)
            elif strategy == "passthrough":
                result = self._execute_passthrough(agent_data, config, input_data)
            else:
                result = self._execute_generic(agent_data, config, input_data)

            execution_time = time.time() - start_time

            # Merge execution time into result
            result.execution_time_seconds = execution_time
            if "strategy" not in result.metadata:
                result.metadata["strategy"] = strategy
            result.metadata["agent_format"] = "yaml"

            self._log_execution_end(result, agent_data)
            return result

        except Exception as e:
            execution_time = time.time() - start_time
            result = self._create_error_result(e, execution_time)
            result.metadata["agent_format"] = "yaml"
            self._log_execution_end(result, agent_data)
            return result

    def _parse_config(self, agent_data: AgentData) -> Dict[str, Any]:
        """Parse the raw YAML content into a config dictionary."""
        raw_content = agent_data.raw_content
        if not raw_content:
            return agent_data.config

        try:
            data = yaml.safe_load(raw_content)
            if isinstance(data, dict):
                return data
        except yaml.YAMLError as e:
            self.logger.warning(f"Failed to re-parse YAML config: {e}")

        return agent_data.config

    def _determine_strategy(self, config: Dict[str, Any], agent_data: AgentData) -> str:
        """
        Determine execution strategy from config.

        Returns one of:
        - llm_prompt: Simple prompt-based execution
        - llm_chain: Chain-based execution with steps
        - passthrough: Direct config passthrough
        - generic: Generic execution
        """
        # Check for chain-like structure
        if "chain" in config or "steps" in config or "sequence" in config:
            return "llm_chain"

        # Check for prompt-based structure
        if "prompt" in config or "system_prompt" in config or "instructions" in config:
            return "llm_prompt"

        # Check for model config
        if "model" in config or "llm" in config:
            return "llm_prompt"

        # Check for agent_type field
        agent_type = config.get("agent_type", "").lower()
        if "chain" in agent_type:
            return "llm_chain"

        return "generic"

    async def _execute_llm_prompt(
        self, agent_data: AgentData, config: Dict[str, Any], input_data: Any
    ) -> RunnerResult:
        """Execute using simple LLM prompt completion."""
        messages = self._build_messages(agent_data, config, input_data)
        kwargs = self._build_kwargs(agent_data, config)

        response = await self.llm_provider.chat(
            messages, agent_name=agent_data.name, **kwargs
        )

        text = response.get("text", "")
        usage = response.get("usage", {})

        return self._create_success_result(
            output=text,
            token_usage=usage,
            metadata={"strategy": "llm_prompt"},
        )

    async def _execute_llm_chain(
        self, agent_data: AgentData, config: Dict[str, Any], input_data: Any
    ) -> RunnerResult:
        """
        Execute using a chain of LLM calls.

        Processes each step/sequence in the config.
        """
        chain_steps = (
            config.get("chain") or config.get("steps") or config.get("sequence") or []
        )

        result_text = ""
        current_context = str(input_data) if input_data else ""

        for i, step in enumerate(chain_steps):
            if isinstance(step, str):
                # Simple string step
                messages = [
                    {"role": "system", "content": agent_data.system_prompt or ""},
                    {
                        "role": "user",
                        "content": f"{step}\n\nContext: {current_context}",
                    },
                ]
            elif isinstance(step, dict):
                # Step with configuration
                step_prompt = step.get("prompt", step.get("instruction", ""))
                step_role = step.get("role", "user")

                messages = []
                if agent_data.system_prompt:
                    messages.append(
                        {
                            "role": "system",
                            "content": agent_data.system_prompt,
                        }
                    )
                messages.append(
                    {
                        "role": step_role,
                        "content": f"{step_prompt}\n\nContext: {current_context}",
                    }
                )
            else:
                continue

            response = await self.llm_provider.chat(
                messages, agent_name=agent_data.name
            )
            step_output = response.get("text", "")
            result_text += f"\n--- Step {i + 1} ---\n{step_output}"
            current_context = step_output

        return self._create_success_result(
            output=result_text.strip(),
            metadata={"strategy": "llm_chain", "steps_executed": len(chain_steps)},
        )

    def _execute_passthrough(
        self, agent_data: AgentData, config: Dict[str, Any], input_data: Any
    ) -> RunnerResult:
        """
        Execute by returning the config directly (for non-LLM agents).

        Used when the agent is a pure configuration agent that doesn't
        need LLM execution.
        """
        return self._create_success_result(
            output=config,
            metadata={"strategy": "passthrough"},
        )

    def _execute_generic(
        self, agent_data: AgentData, config: Dict[str, Any], input_data: Any
    ) -> RunnerResult:
        """
        Generic execution for unrecognized YAML structures.

        Attempts a basic LLM prompt with available content.
        """
        return self._execute_llm_prompt(agent_data, config, input_data)

    def _build_messages(
        self, agent_data: AgentData, config: Dict[str, Any], input_data: Any
    ) -> list:
        """Build message list for LLM call."""
        messages = []

        # System message
        system_parts = []
        if agent_data.system_prompt:
            system_parts.append(agent_data.system_prompt)
        elif config.get("system_prompt"):
            system_parts.append(config["system_prompt"])
        elif config.get("instructions"):
            system_parts.append(config["instructions"])

        if agent_data.description and not agent_data.system_prompt:
            system_parts.append(agent_data.description)

        if system_parts:
            messages.append(
                {
                    "role": "system",
                    "content": "\n".join(system_parts),
                }
            )

        # User message
        body_parts = []
        if agent_data.body_prompt:
            body_parts.append(agent_data.body_prompt)
        elif config.get("prompt"):
            body_parts.append(config["prompt"])
        elif config.get("user_prompt"):
            body_parts.append(config["user_prompt"])

        if input_data:
            body_parts.append(str(input_data))

        if body_parts:
            messages.append(
                {
                    "role": "user",
                    "content": "\n\n".join(body_parts),
                }
            )

        if not messages:
            messages.append(
                {
                    "role": "user",
                    "content": "Hello",
                }
            )

        return messages

    def _build_kwargs(self, agent_data: AgentData, config: Dict[str, Any]) -> dict:
        """Build LLM call kwargs."""
        kwargs = {}

        # Model from agent data or config
        model = agent_data.model or config.get("model", config.get("llm", ""))
        if model:
            kwargs["model"] = model

        # Temperature
        temp = agent_data.temperature
        if temp is None:
            temp = config.get("temperature")
        if temp is not None:
            kwargs["temperature"] = float(temp)

        # Max tokens
        max_t = agent_data.max_tokens
        if max_t is None:
            max_t = config.get("max_tokens", config.get("max_length"))
        if max_t is not None:
            kwargs["max_tokens"] = int(max_t)

        # Tools
        tools = agent_data.tools or config.get("tools", [])
        if tools:
            kwargs["tools"] = tools

        return kwargs
