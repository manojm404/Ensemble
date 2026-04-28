"""
core/runners/markdown_runner.py
Runner for Markdown-format agents.

Executes agents by loading their prompt content and calling the LLM provider.
"""

import logging
import time
from typing import Any

from backend.ensemble.parsers.agent_data import AgentData, AgentFormat

from .base_runner import BaseRunner, RunnerResult

logger = logging.getLogger(__name__)


class MarkdownRunner(BaseRunner):
    """
    Runner for Markdown-format agents.

    Executes agents by using their prompt content (system prompt + body)
    and calling the LLM provider with the combined prompt.
    """

    def __init__(self, llm_provider=None, timeout: float = 60.0):
        """
        Initialize the Markdown runner.

        Args:
            llm_provider: LLMProvider instance for making API calls.
                         If None, will be lazily initialized.
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
        return agent_data.format == AgentFormat.MARKDOWN

    async def execute(
        self, agent_data: AgentData, input_data: Any = None
    ) -> RunnerResult:
        """
        Execute a Markdown agent using the LLM provider.

        Combines system prompt and body prompt, then calls the LLM.

        Args:
            agent_data: The parsed agent specification.
            input_data: Optional user input to append to the prompt.

        Returns:
            RunnerResult with LLM response.
        """
        self._log_execution_start(agent_data)
        start_time = time.time()

        try:
            # Build messages
            messages = self._build_messages(agent_data, input_data)

            # Configure LLM parameters
            kwargs = self._build_kwargs(agent_data)

            # Call LLM
            response = await self.llm_provider.chat(
                messages, agent_name=agent_data.name, **kwargs
            )

            execution_time = time.time() - start_time

            # Extract text and token usage
            text = response.get("text", "")
            usage = response.get("usage", {})

            self._log_execution_end(
                self._create_success_result(
                    output=text,
                    execution_time=execution_time,
                    token_usage=usage,
                    metadata={"agent_format": "markdown"},
                ),
                agent_data,
            )

            return self._create_success_result(
                output=text,
                execution_time=execution_time,
                token_usage=usage,
                metadata={"agent_format": "markdown"},
            )

        except Exception as e:
            execution_time = time.time() - start_time
            result = self._create_error_result(e, execution_time)
            self._log_execution_end(result, agent_data)
            return result

    def _build_messages(self, agent_data: AgentData, input_data: Any) -> list:
        """Build the message list for the LLM call."""
        messages = []

        # System prompt
        system_parts = []
        if agent_data.system_prompt:
            system_parts.append(agent_data.system_prompt)
        if agent_data.description:
            system_parts.append(agent_data.description)

        if system_parts:
            messages.append(
                {
                    "role": "system",
                    "content": "\n".join(system_parts),
                }
            )

        # Body prompt + user input
        body_parts = []
        if agent_data.body_prompt:
            body_parts.append(agent_data.body_prompt)
        if input_data:
            body_parts.append(str(input_data))

        if body_parts:
            messages.append(
                {
                    "role": "user",
                    "content": "\n\n".join(body_parts),
                }
            )

        # Fallback if no messages
        if not messages:
            messages.append(
                {
                    "role": "user",
                    "content": "Hello, please respond.",
                }
            )

        return messages

    def _build_kwargs(self, agent_data: AgentData) -> dict:
        """Build LLM call kwargs from agent config."""
        kwargs = {}

        if agent_data.model:
            kwargs["model"] = agent_data.model

        if agent_data.temperature is not None:
            kwargs["temperature"] = agent_data.temperature

        if agent_data.max_tokens is not None:
            kwargs["max_tokens"] = agent_data.max_tokens

        if agent_data.tools:
            kwargs["tools"] = agent_data.tools

        return kwargs
