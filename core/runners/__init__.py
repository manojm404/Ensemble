"""
core/runners/__init__.py
Runner package for the Universal Agent Importer.

Provides execution runners for different agent formats.
Each runner knows how to execute agents in its native format.
"""
from core.runners.base_runner import BaseRunner, RunnerResult
from core.runners.markdown_runner import MarkdownRunner
from core.runners.python_runner import PythonRunner
from core.runners.yaml_runner import YAMLRunner
from core.runners.json_runner import JSONRunner
from core.parsers.agent_data import AgentFormat

__all__ = [
    "BaseRunner",
    "RunnerResult",
    "MarkdownRunner",
    "PythonRunner",
    "YAMLRunner",
    "JSONRunner",
    "RunnerFactory",
]

class RunnerFactory:
    """Factory for creating the appropriate runner for an agent format."""
    
    _runners = {
        AgentFormat.MARKDOWN: MarkdownRunner(),
        AgentFormat.PYTHON: PythonRunner(),
        AgentFormat.YAML: YAMLRunner(),
        AgentFormat.JSON: JSONRunner(),
        AgentFormat.TEXT: MarkdownRunner(), # Text agents run as simple Markdown
    }
    
    @classmethod
    def get_runner(cls, format: AgentFormat) -> BaseRunner:
        """Get the runner for the specified format."""
        runner = cls._runners.get(format)
        if not runner:
            raise ValueError(f"No runner found for agent format: {format}")
        return runner

# Global instance
runner_factory = RunnerFactory()

