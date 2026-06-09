"""
core/langchain_adapter.py

Thin LangChain bridge for 0101.

This keeps the product contract in our own runtime while delegating provider
access and message normalization to LangChain/LangGraph-compatible models.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

try:
    from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
    from langchain_google_genai import ChatGoogleGenerativeAI
    from langchain_openai import ChatOpenAI

    LANGCHAIN_AVAILABLE = True
except Exception as exc:  # pragma: no cover - import guard
    AIMessage = HumanMessage = SystemMessage = None  # type: ignore[assignment]
    ChatGoogleGenerativeAI = ChatOpenAI = None  # type: ignore[assignment]
    LANGCHAIN_AVAILABLE = False
    LANGCHAIN_IMPORT_ERROR = exc


@dataclass
class LangChainConfig:
    provider: str
    model: str
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    temperature: float = 0.7


class LangChainBridge:
    """Provider/model creation and message conversion helpers."""

    SYSTEM_TAG = "<!-- ENSEMBLE_SYSTEM_LOCKED -->"

    @staticmethod
    def build_model(config: LangChainConfig):
        if not LANGCHAIN_AVAILABLE:
            raise RuntimeError(
                "LangChain is not available in this environment."
                + (f" Import error: {LANGCHAIN_IMPORT_ERROR}" if "LANGCHAIN_IMPORT_ERROR" in globals() else "")
            )

        provider = (config.provider or "").strip().lower()
        api_key = config.api_key
        base_url = config.base_url

        if provider == "gemini":
            return ChatGoogleGenerativeAI(
                model=config.model,
                api_key=api_key or os.getenv("GEMINI_API_KEY"),
                temperature=config.temperature,
            )

        if provider in {"openai", "groq", "openai_compatible", "ollama", "local"}:
            if provider == "groq" and not base_url:
                base_url = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1")
            elif provider == "openai_compatible" and not base_url:
                base_url = os.getenv("OPENAI_COMPATIBLE_BASE_URL", "https://api.cerebras.ai/v1")
            elif provider in {"ollama", "local"} and not base_url:
                base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
            elif provider == "openai" and not base_url:
                base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")

            return ChatOpenAI(
                model=config.model,
                api_key=api_key or os.getenv("OPENAI_API_KEY") or os.getenv("OPENAI_COMPATIBLE_API_KEY") or os.getenv("GROQ_API_KEY"),
                base_url=base_url,
                temperature=config.temperature,
            )

        raise ValueError(f"Unsupported provider for LangChain bridge: {config.provider}")

    @staticmethod
    def build_messages(messages: List[Dict[str, str]], system_prompt: str = ""):
        if not LANGCHAIN_AVAILABLE:
            raise RuntimeError("LangChain is not available in this environment.")

        refined = [dict(message) for message in messages]
        if system_prompt:
            has_tag = any(LangChainBridge.SYSTEM_TAG in str(message.get("content", "")) for message in refined)
            if not has_tag:
                for system_message in refined:
                    if system_message.get("role") == "system":
                        system_message["content"] = f"{LangChainBridge.SYSTEM_TAG}\n{system_prompt}\n\n{system_message.get('content', '')}"
                        break
                else:
                    refined.insert(0, {"role": "system", "content": f"{LangChainBridge.SYSTEM_TAG}\n{system_prompt}"})

        lc_messages = []
        for message in refined:
            role = (message.get("role") or "user").lower()
            content = str(message.get("content") or "")
            if role == "system":
                lc_messages.append(SystemMessage(content=content))
            elif role in {"assistant", "model"}:
                lc_messages.append(AIMessage(content=content))
            else:
                lc_messages.append(HumanMessage(content=content))
        return lc_messages

    @staticmethod
    def extract_text(response: Any) -> str:
        if response is None:
            return ""
        if isinstance(response, str):
            return response

        content = getattr(response, "content", None)
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts: List[str] = []
            for part in content:
                if isinstance(part, str):
                    parts.append(part)
                elif isinstance(part, dict) and isinstance(part.get("text"), str):
                    parts.append(part["text"])
            return "".join(parts).strip()

        text = getattr(response, "text", None)
        if isinstance(text, str):
            return text

        if isinstance(response, dict):
            maybe = response.get("text") or response.get("content")
            if isinstance(maybe, str):
                return maybe

        return str(response)
