"""
core/runners/base_runner.py
Abstract base class for agent execution runners.

Defines the interface that all format-specific runners must implement.
Provides common error handling, timeout wrapping, and logging.
"""
import time
import logging
import traceback
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional
from dataclasses import dataclass, field

from core.parsers.agent_data import AgentData

logger = logging.getLogger(__name__)


@dataclass
class RunnerResult:
    """
    Standard result object from runner execution.

    Contains the output, metadata, and any errors.
    """
    success: bool
    output: Any = None
    error: Optional[str] = None
    error_traceback: Optional[str] = None
    execution_time_seconds: float = 0.0
    token_usage: Dict[str, int] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def was_successful(self) -> bool:
        """Check if execution was successful."""
        return self.success and self.error is None

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "success": self.success,
            "output": self.output,
            "error": self.error,
            "error_traceback": self.error_traceback,
            "execution_time_seconds": self.execution_time_seconds,
            "token_usage": self.token_usage,
            "metadata": self.metadata,
        }


class BaseRunner(ABC):
    """
    Abstract base class for agent execution runners.

    All format-specific runners must inherit from this class
    and implement the execute method.
    """

    def __init__(self, timeout: float = 60.0):
        """
        Initialize the runner.

        Args:
            timeout: Maximum execution time in seconds.
        """
        self.timeout = timeout
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")

    @abstractmethod
    async def execute(
        self, agent_data: AgentData, input_data: Any = None
    ) -> RunnerResult:
        """
        Execute an agent with the given input data.

        Args:
            agent_data: The parsed agent specification.
            input_data: Optional input data for the agent.

        Returns:
            RunnerResult with output and metadata.
        """
        pass

    def can_execute(self, agent_data: AgentData) -> bool:
        """
        Check if this runner can execute the given agent.

        Override to add format-specific checks. Default implementation
        always returns True (subclasses should override).

        Args:
            agent_data: The agent to check.

        Returns:
            True if this runner can execute the agent.
        """
        return True

    def _create_error_result(
        self, error: Exception, execution_time: float = 0.0
    ) -> RunnerResult:
        """Create a RunnerResult from an exception."""
        return RunnerResult(
            success=False,
            error=str(error),
            error_traceback=traceback.format_exc(),
            execution_time_seconds=execution_time,
        )

    def _create_success_result(
        self,
        output: Any = None,
        execution_time: float = 0.0,
        token_usage: Optional[Dict[str, int]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> RunnerResult:
        """Create a RunnerResult from successful execution."""
        return RunnerResult(
            success=True,
            output=output,
            execution_time_seconds=execution_time,
            token_usage=token_usage or {},
            metadata=metadata or {},
        )

    def _log_execution_start(self, agent_data: AgentData):
        """Log the start of agent execution."""
        self.logger.info(
            f"Starting execution of agent: {agent_data.name} "
            f"(format={agent_data.format.value})"
        )

    def _log_execution_end(self, result: RunnerResult, agent_data: AgentData):
        """Log the end of agent execution."""
        if result.success:
            self.logger.info(
                f"Completed execution of agent: {agent_data.name} "
                f"(time={result.execution_time_seconds:.2f}s)"
            )
        else:
            self.logger.error(
                f"Failed execution of agent: {agent_data.name} "
                f"(error={result.error})"
            )
