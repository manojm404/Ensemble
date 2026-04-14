"""
tests/test_data_injector.py
Unit tests for the data injector feature in DAGWorkflowEngine.

Tests:
- _extract_json_path: Safe JSON path traversal
- _resolve_data_bindings: Placeholder substitution from predecessor outputs
"""
import pytest
import json
from unittest.mock import MagicMock, patch
from core.dag_engine import DAGWorkflowEngine


class TestExtractJsonPath:
    """Tests for safe JSON path traversal."""

    def setup_method(self):
        """Create a mock engine for testing."""
        mock_space = MagicMock()
        mock_audit = MagicMock()
        mock_llm = MagicMock()
        mock_gov = MagicMock()
        self.engine = DAGWorkflowEngine(mock_space, mock_audit, mock_llm, mock_gov)

    def test_simple_key(self):
        """Extract a top-level key."""
        data = {"price": 1089.46, "ticker": "NVDA"}
        assert self.engine._extract_json_path(data, "price") == "1089.46"
        assert self.engine._extract_json_path(data, "ticker") == "NVDA"

    def test_nested_path(self):
        """Extract a deeply nested value."""
        data = {
            "rsi": {"value": 68.5, "signal": "neutral"},
            "macd": {"line": 45.7, "signal": 42.1}
        }
        assert self.engine._extract_json_path(data, "rsi.value") == "68.5"
        assert self.engine._extract_json_path(data, "rsi.signal") == "neutral"
        assert self.engine._extract_json_path(data, "macd.line") == "45.7"

    def test_list_index(self):
        """Extract from a list by index."""
        data = {"history": [100, 200, 300]}
        assert self.engine._extract_json_path(data, "history.0") == "100"
        assert self.engine._extract_json_path(data, "history.2") == "300"

    def test_case_insensitive(self):
        """Case-insensitive key matching."""
        data = {"CurrentPrice": 1089.46, "PE_RATIO": 70.8}
        assert self.engine._extract_json_path(data, "currentprice") == "1089.46"
        assert self.engine._extract_json_path(data, "pe_ratio") == "70.8"

    def test_missing_key(self):
        """Graceful handling of missing keys."""
        data = {"price": 100}
        result = self.engine._extract_json_path(data, "volume")
        assert "N/A" in result
        assert "key not found" in result

    def test_null_value(self):
        """Handling of null values."""
        data = {"price": None}
        assert self.engine._extract_json_path(data, "price") == "null"

    def test_bool_value(self):
        """Handling of boolean values."""
        data = {"active": True, "deleted": False}
        assert self.engine._extract_json_path(data, "active") == "true"
        assert self.engine._extract_json_path(data, "deleted") == "false"

    def test_complex_object(self):
        """Complex objects returned as compact JSON."""
        data = {"indicators": {"rsi": 68.5, "macd": 45.7}}
        result = self.engine._extract_json_path(data, "indicators")
        parsed = json.loads(result)
        assert parsed["rsi"] == 68.5
        assert parsed["macd"] == 45.7

    def test_empty_path(self):
        """Empty path returns entire data as string."""
        data = {"a": 1, "b": 2}
        result = self.engine._extract_json_path(data, "")
        assert "a" in result and "b" in result


class TestResolveDataBindings:
    """Tests for placeholder substitution."""

    def setup_method(self):
        """Create engine with mocked space."""
        self.mock_space = MagicMock()
        mock_audit = MagicMock()
        mock_llm = MagicMock()
        mock_gov = MagicMock()
        self.engine = DAGWorkflowEngine(self.mock_space, mock_audit, mock_llm, mock_gov)

    def test_simple_binding(self):
        """Substitute a single placeholder."""
        output = json.dumps({"current_price": 1089.46, "ticker": "NVDA"})
        self.mock_space.exists.return_value = True
        self.mock_space.read.return_value = output.encode()

        text = "Price: {{data_fetcher.current_price}}"
        result = self.engine._resolve_data_bindings(text, "run_123", ["data_fetcher_node"])
        
        assert result == "Price: 1089.46"

    def test_nested_binding(self):
        """Substitute a nested path placeholder."""
        output = json.dumps({"rsi": {"value": 68.5, "signal": "neutral"}})
        self.mock_space.exists.return_value = True
        self.mock_space.read.return_value = output.encode()

        text = "RSI: {{technical.rsi.value}} → {{technical.rsi.signal}}"
        result = self.engine._resolve_data_bindings(text, "run_123", ["technical_node"])
        
        assert "RSI: 68.5 → neutral" == result

    def test_multiple_bindings(self):
        """Substitute multiple placeholders from different agents."""
        outputs = {
            "data_fetcher_node": json.dumps({"price": 1089.46}),
            "risk_node": json.dumps({"risk_score": 8}),
        }
        
        def mock_exists(name):
            return name.endswith("_output")
        
        def mock_read(name):
            for node_id, data in outputs.items():
                if name == f"{node_id}_output":
                    return data.encode()
            return b""
        
        self.mock_space.exists.side_effect = mock_exists
        self.mock_space.read.side_effect = mock_read

        text = "Price: ${{data_fetcher.price}} | Risk: {{risk.risk_score}}/10"
        result = self.engine._resolve_data_bindings(
            text, "run_123", ["data_fetcher_node", "risk_node"]
        )
        
        assert result == "Price: $1089.46 | Risk: 8/10"

    def test_missing_agent(self):
        """Graceful handling when agent output not found."""
        text = "Price: {{unknown_agent.price}}"
        result = self.engine._resolve_data_bindings(text, "run_123", ["data_fetcher"])
        
        assert "[N/A: agent 'unknown_agent' not found]" in result

    def test_no_bindings(self):
        """Text without bindings passes through unchanged."""
        text = "This is plain text with no bindings."
        result = self.engine._resolve_data_bindings(text, "run_123", ["data_fetcher"])
        
        assert result == text

    def test_malformed_json(self):
        """Non-JSON output falls back to raw text."""
        self.mock_space.exists.return_value = True
        self.mock_space.read.return_value = b"Plain text output from previous agent"

        text = "Previous: {{data_fetcher}}"
        result = self.engine._resolve_data_bindings(text, "run_123", ["data_fetcher_node"])
        
        assert "Plain text output from previous agent" in result

    def test_truncation_for_long_output(self):
        """Long raw text output gets truncated when no field path."""
        long_text = "x" * 1000
        self.mock_space.exists.return_value = True
        self.mock_space.read.return_value = long_text.encode()

        text = "Data: {{data_fetcher}}"
        result = self.engine._resolve_data_bindings(text, "run_123", ["data_fetcher_node"])
        
        assert len(result.replace("Data: ", "")) <= 500
