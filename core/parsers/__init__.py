"""
core/parsers/__init__.py
Parser package for the Universal Agent Importer.

Provides parsers for converting external agent formats to the internal AgentData format.
Supported formats: Markdown, Python, YAML, JSON, Text.
"""
from core.parsers.markdown_parser import MarkdownParser
from core.parsers.python_parser import PythonParser
from core.parsers.yaml_parser import YAMLParser
from core.parsers.json_parser import JSONParser
from core.parsers.text_parser import TextParser

__all__ = [
    "MarkdownParser",
    "PythonParser",
    "YAMLParser",
    "JSONParser",
    "TextParser",
]
