import os
import json
import httpx
from typing import List, Dict, Any, Optional

class LLMProvider:
    """
    Unified interface for multiple LLM backends (Gemini, Ollama, OpenAI).
    """
    
    def __init__(self, provider: str = None, model: str = None, base_url: str = None, api_key: str = None):
        self.reinitialize(provider, model, base_url, api_key)

    @staticmethod
    def get_supported_models() -> List[Dict[str, Any]]:
        """Returns the official registry of supported models for v3."""
        return [
            {
                "id": "gemini-2.5-flash",
                "name": "Gemini 2.5 Flash",
                "provider": "gemini",
                "cost_per_1k_tokens": 0.0001,
                "capabilities": ["tools", "vision", "high_context"]
            },
            {
                "id": "gemini-2.0-flash",
                "name": "Gemini 2.0 Flash",
                "provider": "gemini",
                "cost_per_1k_tokens": 0.0001,
                "capabilities": ["tools", "vision"]
            },
            {
                "id": "llama-3.2-3b",
                "name": "Llama 3.2 (3B)",
                "provider": "ollama",
                "cost_per_1k_tokens": 0.0,
                "capabilities": ["local", "fast"]
            },
            {
                "id": "deepseek-v3",
                "name": "DeepSeek V3",
                "provider": "openai",
                "cost_per_1k_tokens": 0.0002,
                "capabilities": ["reasoning", "coding"]
            }
        ]

    def reinitialize(self, provider: str = None, model: str = None, base_url: str = None, api_key: str = None):
        """Reload configuration from environment or provided overrides."""
        from dotenv import load_dotenv
        load_dotenv(override=True)
        
        self.provider = provider or os.getenv("LLM_PROVIDER", "gemini")
        self.model = model or os.getenv("OLLAMA_MODEL" if self.provider == "ollama" else "GEMINI_MODEL", "llama3.2" if self.provider == "ollama" else "gemini-2.0-flash")
        self.base_url = base_url or os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        
        print(f"🔄 [LLMProvider] Reinitialized: {self.provider} | Model: {self.model}", flush=True)

    async def chat(self, messages: List[Dict[str, str]], **kwargs) -> Dict[str, Any]:
        """Standard chat completion call. Returns {'text': str, 'usage': dict}"""
        if self.provider == "gemini":
            return await self._chat_gemini(messages, **kwargs)
        elif self.provider in ["ollama", "openai", "local"]:
            return await self._chat_openai_compatible(messages, **kwargs)
        else:
            raise ValueError(f"Unsupported provider: {self.provider}")

    async def chat_stream(self, messages: List[Dict[str, str]], **kwargs):
        """Streaming chat completion. Yields text chunks."""
        if self.provider == "gemini":
            async for chunk in self._chat_gemini_stream(messages, **kwargs):
                yield chunk
        elif self.provider in ["ollama", "openai", "local"]:
            async for chunk in self._chat_openai_compatible_stream(messages, **kwargs):
                yield chunk
        else:
            raise ValueError(f"Unsupported provider: {self.provider}")

    async def _chat_gemini(self, messages: List[Dict[str, str]], **kwargs) -> str:
        # Existing Gemini logic (from our Phase 1 implemention)
        # Note: We'll pull this from the logic we've been using in core/engine.py or similar
        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": self.api_key
        }
        
    def _get_context_limit(self) -> int:
        """Returns the token/char limit for the model (80% strategy)."""
        # Default limits: 8k for llama3.2, 128k for gemini
        if "gemini" in self.model: return 100000 
        if "llama" in self.model: return 6400
        return 4000 # Conservative default

    def _prepare_messages(self, messages: List[Dict[str, str]]) -> List[Dict[str, str]]:
        """Ensures roles alternate and truncates if over 80% context capacity."""
        # 1. Initial filter for sanity
        raw = [m for m in messages if isinstance(m, dict) and "role" in m and "content" in m]
        
        # 2. Sync consecutive roles (merging content)
        refined = []
        for m in raw:
            if refined and refined[-1]["role"] == m["role"]:
                # Ensure we don't append None
                new_content = m.get("content") or ""
                refined[-1]["content"] += "\n" + new_content
            else:
                refined.append(m.copy())

        # 3. Simple Truncation (Preserve System + Most Recent)
        limit = self._get_context_limit()
        # Very rough token estimation (char / 4 or whitespace * 1.3)
        def estimate(msg_list):
            return sum(len(m.get("content") or "") / 4 for m in msg_list)

        if estimate(refined) > limit:
            print(f"⚠️  [LLMProvider] Context over limit ({estimate(refined)} chars), truncating older history...", flush=True)
            system = [m for m in refined if m["role"] == "system"]
            non_system = [m for m in refined if m["role"] != "system"]
            while non_system and estimate(system + non_system) > limit:
                non_system.pop(0) # Remove oldest history
            refined = system + non_system
            
        return refined

    async def _chat_gemini(self, messages: List[Dict[str, str]], **kwargs) -> Dict[str, Any]:
        """Call Google Gemini API with corrected formatting."""
        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": self.api_key
        }

        # Standardize turns and clip context
        refined = self._prepare_messages(messages)

        print(f"🤖 [LLMProvider] Calling Gemini API: model={self.model}, messages={len(refined)}", flush=True)

        contents = []
        system_instruction = None

        for idx, m in enumerate(refined):
            # Extreme defensive logging
            role = m.get("role")
            content = m.get("content")

            if not role or content is None:
                print(f"❌ [LLMProvider] Malformed message detected at index {idx}: {m}", flush=True)
                continue

            if role == "system":
                if system_instruction:
                    system_instruction += "\n" + content
                else:
                    system_instruction = content
            else:
                gemini_role = "user" if role == "user" else "model"
                contents.append({
                    "role": gemini_role,
                    "parts": [{"text": content}]
                })

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent"
        print(f"🌐 [LLMProvider] URL: {url}", flush=True)

        payload = {
            "contents": contents,
            "generationConfig": {
                "thinkingConfig": {
                    "includeThoughts": False
                }
            }
        }
        if system_instruction:
            payload["system_instruction"] = {"parts": [{"text": system_instruction}]}
            
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                resp = await client.post(url, headers=headers, json=payload)
                resp.raise_for_status()
                data = resp.json()
                
                # Robust path checking for Gemini's deep JSON structure
                candidates = data.get("candidates", [])
                if not candidates:
                    return {"text": "Error: Gemini returned no candidates. (Possible safety block or empty response)", "usage": {}}
                
                first_candidate = candidates[0]
                content = first_candidate.get("content")
                if not content or "parts" not in content or not content["parts"]:
                    finish_reason = first_candidate.get("finishReason", "UNKNOWN")
                    return {"text": f"Error: Gemini response missing content. Finish Reason: {finish_reason}", "usage": {}}
                
                text = content["parts"][0].get("text", "")
                usage = data.get("usageMetadata", {})
                return {
                    "text": text,
                    "usage": {
                        "prompt_tokens": usage.get("promptTokenCount", 0),
                        "completion_tokens": usage.get("candidatesTokenCount", 0),
                        "total_tokens": usage.get("totalTokenCount", 0)
                    }
                }
            except Exception as e:
                # Log actual error to console for debugging
                print(f"❌ [LLMProvider v1.1.3] Gemini API Error: {str(e)}", flush=True)
                return {"text": f"Error calling Gemini [v1.1.3]: {str(e)}", "usage": {}}
    async def _chat_gemini_stream(self, messages: List[Dict[str, str]], **kwargs):
        """Stream chunks from Gemini."""
        headers = {"Content-Type": "application/json", "x-goog-api-key": self.api_key}
        refined = self._prepare_messages(messages)
        contents = []
        system_instruction = None
        for m in refined:
            if m["role"] == "system":
                system_instruction = (system_instruction + "\n" + m["content"]) if system_instruction else m["content"]
            else:
                contents.append({"role": "user" if m["role"] == "user" else "model", "parts": [{"text": m["content"]}]})
        
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:streamGenerateContent?alt=sse"
        payload = {"contents": contents}
        if system_instruction: payload["system_instruction"] = {"parts": [{"text": system_instruction}]}
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as response:
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        try:
                            data = json.loads(line[6:])
                            text = data["candidates"][0]["content"]["parts"][0]["text"]
                            yield text
                        except:
                            pass

    async def _chat_openai_compatible_stream(self, messages: List[Dict[str, str]], **kwargs):
        """Stream chunks from OpenAI-compatible provider."""
        headers = {"Content-Type": "application/json"}
        if self.api_key: headers["Authorization"] = f"Bearer {self.api_key}"
        refined = self._prepare_messages(messages)
        payload = {"model": self.model, "messages": refined, "stream": True}
        url = self.base_url.rstrip("/") + "/chat/completions"
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as response:
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        if line[6:] == "[DONE]": break
                        try:
                            data = json.loads(line[6:])
                            text = data["choices"][0]["delta"].get("content", "")
                            if text: yield text
                        except:
                            pass

    async def _chat_openai_compatible(self, messages: List[Dict[str, str]], **kwargs) -> Dict[str, Any]:
        """Call Ollama / LM Studio using OpenAI-style JSON."""
        headers = {
            "Content-Type": "application/json"
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
            
        # Standardize turns and clip context
        refined = self._prepare_messages(messages)

        payload = {
            "model": self.model,
            "messages": refined,
            "temperature": kwargs.get("temperature", 0.7),
            "stream": False
        }
        
        endpoint = self.base_url.rstrip("/")
        if not endpoint.endswith("/chat/completions"):
            endpoint += "/chat/completions"
            
        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                resp = await client.post(endpoint, headers=headers, json=payload)
                resp.raise_for_status()
                data = resp.json()
                
                # Safe JSON path extraction
                choices = data.get("choices", [])
                if not choices:
                    return {"text": f"Error: No responses from {self.provider}.", "usage": {}}
                
                message = choices[0].get("message", {})
                text = message.get("content", "")
                
                usage = data.get("usage", {})
                return {
                    "text": text,
                    "usage": {
                        "prompt_tokens": usage.get("prompt_tokens", 0),
                        "completion_tokens": usage.get("completion_tokens", 0),
                        "total_tokens": usage.get("total_tokens", 0)
                    }
                }
            except Exception as e:
                print(f"❌ [LLMProvider] OpenAI API Error: {str(e)}", flush=True)
                return {"text": f"Error calling {self.provider}: {str(e)}", "usage": {}}
