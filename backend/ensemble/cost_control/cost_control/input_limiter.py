"""LLM input token estimation and truncation.

Provides deterministic limits on input size to prevent runaway token costs.
Estimates tokens via character-length heuristic (chars / 4), auto-truncates
content that exceeds the configured ceiling, and returns a structured result
with metadata about what happened.
"""

from __future__ import annotations

import html
import json
import logging
import math
import re
import threading
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

# Default maximum tokens (~32 KB of text)
MAX_TOKENS: int = 8000


@dataclass(frozen=True)
class InputResult:
    """Immutable result of input-limit processing."""

    data: Any
    token_count: int
    truncated: bool
    original_size: int
    warning_message: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _estimate_tokens(text: str) -> int:
    """Return a conservative token estimate based on character count.

    The heuristic ``chars / 4`` approximates ~4 characters per token for
    typical LLM tokenizers.  It is deliberately simple and stateless.
    """
    if not text:
        return 0
    return max(1, math.ceil(len(text) / 4))


def _truncate_text(text: str, max_tokens: int) -> tuple[str, str]:
    """Truncate *text* to fit within *max_tokens* and return (truncated, summary)."""
    max_chars = max_tokens * 4
    if len(text) <= max_chars:
        return text, ""

    # Keep enough content for the model to still be useful.
    head_size = int(max_chars * 0.85)
    tail_size = max_chars - head_size

    truncated = text[:head_size] + "\n\n... [content truncated] ...\n\n" + text[-tail_size:]

    # Build a short summary of what was removed.
    removed = text[head_size:-tail_size]
    summary_lines = [
        f"Input truncated: {_estimate_tokens(text)} tokens -> {max_tokens} tokens.",
        f"Removed {len(removed)} characters ({_estimate_tokens(removed)} tokens) from the middle.",
    ]
    summary = " ".join(summary_lines)
    return truncated, summary


def _strip_markdown(text: str) -> str:
    """Return plain text from a markdown string."""
    # Remove code blocks but keep their inner content.
    text = re.sub(r"```[\w]*\n(.*?)```", r"\1", text, flags=re.DOTALL)
    # Remove inline code markers.
    text = text.replace("`", "")
    # Strip heading markers.
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)
    # Strip bold/italic markers.
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"\*(.+?)\*", r"\1", text)
    # Strip link syntax, keep the label.
    text = re.sub(r"\[(.+?)\]\(.+?\)", r"\1", text)
    # Strip images.
    text = re.sub(r"!\[.*?\]\(.+?\)", "", text)
    return text


def _strip_html(text: str) -> str:
    """Return readable text from an HTML string."""
    # Remove script and style elements.
    text = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", text, flags=re.DOTALL | re.IGNORECASE)
    # Remove all other tags.
    text = re.sub(r"<[^>]+>", " ", text)
    # Decode common entities.
    text = html.unescape(text)
    # Collapse whitespace.
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _compact_json(obj: Any) -> str:
    """Return the most compact valid JSON representation."""
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False)


# ---------------------------------------------------------------------------
# InputLimiter
# ---------------------------------------------------------------------------

class InputLimiter:
    """Thread-safe, stateless limiter for LLM input payloads.

    Supports four input formats: ``text``, ``json``, ``markdown``, and
    ``html``.  The caller specifies the format (or ``auto`` for best-effort
    detection).  If the estimated token count exceeds *max_tokens* the content
    is truncated and a warning message is attached to the result.
    """

    def __init__(self, max_tokens: int = MAX_TOKENS) -> None:
        if max_tokens < 1:
            raise ValueError("max_tokens must be >= 1")
        self._max_tokens = max_tokens
        self._lock = threading.Lock()  # serialises warning construction only

    # -- public API -----------------------------------------------------------

    def process(self, data: Any, *, fmt: str = "auto") -> InputResult:
        """Process *data* through the limiter and return an ``InputResult``.

        Parameters
        ----------
        data:
            The input payload.  For ``text`` / ``markdown`` / ``html`` this
            should be a string.  For ``json`` it can be any JSON-serialisable
            value.
        fmt:
            One of ``text``, ``json``, ``markdown``, ``html``, or ``auto``.
        """
        text, original_tokens = self._normalise(data, fmt)
        original_size = len(text)

        if original_tokens <= self._max_tokens:
            return InputResult(
                data=data,
                token_count=original_tokens,
                truncated=False,
                original_size=original_size,
            )

        truncated_text, warning = _truncate_text(text, self._max_tokens)
        truncated_tokens = _estimate_tokens(truncated_text)

        # Rebuild the output in the original format.
        limited_data = self._denormalise(truncated_text, fmt, data)

        return InputResult(
            data=limited_data,
            token_count=truncated_tokens,
            truncated=True,
            original_size=original_size,
            warning_message=warning,
        )

    def estimate_tokens(self, data: Any, *, fmt: str = "auto") -> int:
        """Return the estimated token count for *data* without truncating."""
        _, tokens = self._normalise(data, fmt)
        return tokens

    @property
    def max_tokens(self) -> int:
        return self._max_tokens

    # -- internals -----------------------------------------------------------

    def _detect_format(self, data: Any) -> str:
        """Best-effort format detection."""
        if not isinstance(data, str):
            return "json"
        stripped = data.strip()
        if stripped.startswith(("{", "[")):
            try:
                json.loads(stripped)
                return "json"
            except (json.JSONDecodeError, ValueError):
                pass
        if "<" in stripped and ("html" in stripped[:200].lower() or "</" in stripped):
            return "html"
        if re.search(r"```|#{1,6}\s|[*_]{2}|\[.*?\]\(", stripped):
            return "markdown"
        return "text"

    def _normalise(self, data: Any, fmt: str) -> tuple[str, int]:
        """Convert *data* to a flat string and estimate tokens."""
        effective_fmt = fmt if fmt != "auto" else self._detect_format(data)

        if effective_fmt == "json":
            if isinstance(data, str):
                text = data
            else:
                text = _compact_json(data)
        elif effective_fmt == "markdown":
            text = data if isinstance(data, str) else str(data)
            text = _strip_markdown(text)
        elif effective_fmt == "html":
            text = data if isinstance(data, str) else str(data)
            text = _strip_html(text)
        else:
            text = data if isinstance(data, str) else str(data)

        return text, _estimate_tokens(text)

    def _denormalise(self, text: str, fmt: str, original: Any) -> Any:
        """Rebuild output in the caller's original format."""
        effective_fmt = fmt if fmt != "auto" else self._detect_format(original)

        if effective_fmt == "json":
            if isinstance(original, str):
                return text
            # Try to return valid JSON even after truncation.
            try:
                return json.loads(text)
            except (json.JSONDecodeError, ValueError):
                return {"_truncated": True, "_content": text}
        elif effective_fmt == "markdown":
            return text
        elif effective_fmt == "html":
            return f"<div>{html.escape(text)}</div>"
        return text

    def __repr__(self) -> str:
        return f"InputLimiter(max_tokens={self._max_tokens})"

    # Backwards compatibility alias
    def prepare_for_llm(self, data: Any, fmt: str = "auto") -> InputResult:
        """Alias for process() method for backwards compatibility."""
        return self.process(data, fmt=fmt)
