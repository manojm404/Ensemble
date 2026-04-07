import os
import json
import httpx
from typing import List, Dict, Any, Optional

UNIVERSAL_PROFESSIONAL_PROMPT = """
You are {identity}. Deliver world-class analysis with a warm, approachable vibe—but be **extremely concise**.

**TOOL RULE (Highest Priority):**
When a user attaches a file or mentions a filename, you MUST immediately call `read_artifact`. NEVER say you cannot read a file.
If `read_artifact` returns an error, state the error in one sentence and stop. Do not suggest manual workarounds.
If multiple files are attached, read all of them and provide a unified analysis.

**INTERACTION RULES:**
- Respond to "hi" or "hello" with ONLY: "👋 Ready. What's the task?" (one emoji allowed).
- NEVER write: "I will now...", "Analysis Plan:", "Please allow me...", "Let me first...", "Here's what I'll do...", or "To begin with...".
- After delivering the final output, wait silently for the user's next message. Do not ask "Anything else?" or "How can I help further?".

**OUTPUT STRUCTURE:**
# 📊 [Title]
## 📈 Key Metrics (Markdown table, right-aligned numbers)
## 💡 Insights (3-5 bullets using ↗️ ↘️ →)
## 🚀 Recommendations (Up to 5 numbered items, each under 10 words)

**FORMATTING:**
- Professional notation: $1,234.56, +12.3%, 1.96M.
- **Visuals:** Use Mermaid diagrams ONLY if the user explicitly asks for a chart, diagram, graph, plot, or visualization. Otherwise, use Markdown tables.

*Identity: {identity}*
"""

class LLMProvider:
    """
    Unified interface for multiple LLM backends (Gemini, Ollama, OpenAI-compatible).
    Supports tool calling (read_artifact, write_artifact, search_web, read_url).
    """

    def __init__(self, provider: str = None, model: str = None, base_url: str = None, api_key: str = None):
        self.reinitialize(provider, model, base_url, api_key)

    @staticmethod
    def get_supported_models() -> List[Dict[str, Any]]:
        """Returns the official registry of supported models based on latest Gemini API docs (2026)."""
        return [
            {
                "id": "gemini-2.5-flash",
                "name": "Gemini 2.5 Flash (Stable, Recommended)",
                "provider": "gemini",
                "cost_per_1k_tokens": 0.0001,
                "capabilities": ["stable", "production", "tools", "fast"]
            },
            {
                "id": "gemini-2.5-pro",
                "name": "Gemini 2.5 Pro (Stable, Deep Reasoning)",
                "provider": "gemini",
                "cost_per_1k_tokens": 0.0005,
                "capabilities": ["stable", "deep_reasoning", "tools"]
            },
            {
                "id": "gemini-2.5-flash-live-preview",
                "name": "Gemini 2.5 Flash Live (Preview, Real-time)",
                "provider": "gemini",
                "cost_per_1k_tokens": 0.0001,
                "capabilities": ["preview", "real-time", "audio", "tools"]
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
        # Default to stable Gemini 2.5 Flash (not deprecated)
        default_model = "gemini-2.5-flash"
        if self.provider == "ollama":
            default_model = "llama3.2"
        elif self.provider == "openai":
            default_model = "gpt-4o-mini"  # fallback, but can be overridden

        self.model = model or os.getenv(
            "OLLAMA_MODEL" if self.provider == "ollama" else "GEMINI_MODEL",
            default_model
        )
        self.base_url = base_url or os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")

        print(f"🔄 [LLMProvider] Reinitialized: {self.provider} | Model: {self.model}", flush=True)

    # -------------------------------------------------------------------------
    # Public API
    # -------------------------------------------------------------------------
    async def chat(self, messages: List[Dict[str, str]], agent_name: str = "Ensemble specialist", **kwargs) -> Dict[str, Any]:
        """Standard chat completion call. Returns {'text': str, 'usage': dict}"""
        if self.provider == "gemini":
            return await self._chat_gemini(messages, agent_name=agent_name, **kwargs)
        elif self.provider in ["ollama", "openai", "local"]:
            return await self._chat_openai_compatible(messages, agent_name=agent_name, **kwargs)
        else:
            raise ValueError(f"Unsupported provider: {self.provider}")

    async def chat_stream(self, messages: List[Dict[str, str]], agent_name: str = "Ensemble specialist", **kwargs):
        """Streaming chat completion. Yields text chunks."""
        if self.provider == "gemini":
            async for chunk in self._chat_gemini_stream(messages, agent_name=agent_name, **kwargs):
                yield chunk
        elif self.provider in ["ollama", "openai", "local"]:
            async for chunk in self._chat_openai_compatible_stream(messages, agent_name=agent_name, **kwargs):
                yield chunk
        else:
            raise ValueError(f"Unsupported provider: {self.provider}")

    # -------------------------------------------------------------------------
    # Context management
    # -------------------------------------------------------------------------
    def _get_context_limit(self) -> int:
        """Returns the approximate character limit for the model (80% of token limit)."""
        if "gemini-2.5" in self.model:
            return 1_000_000  # 1M tokens * 4 chars ~ 4M, but conservative
        if "gemini" in self.model:
            return 100_000
        if "llama" in self.model:
            return 6_400
        return 4_000

    def _prepare_messages(self, messages: List[Dict[str, str]]) -> List[Dict[str, str]]:
        """Ensures roles alternate and truncates context while PRESERVING tool-chains."""
        refined = []
        for m in messages:
            role = m.get("role")
            content = m.get("content")
            
            # Skip merging for tools (Function calls/responses must remain distinct)
            is_tool = role in ("function", "tool") or "function_call" in m
            
            if refined and refined[-1]["role"] == role and not is_tool:
                # Merge consecutive plain text messages
                refined[-1]["content"] += "\n" + (content or "")
            else:
                refined.append(m.copy())

        # Rough character-based truncation
        limit = self._get_context_limit()
        def estimate(msg_list):
            return sum(len(m.get("content", "")) for m in msg_list)

        if estimate(refined) > limit:
            print(f"⚠️ [LLMProvider] Context over limit, truncating older history...", flush=True)
            system = [m for m in refined if m["role"] == "system"]
            non_system = [m for m in refined if m["role"] != "system"]
            while non_system and estimate(system + non_system) > limit:
                non_system.pop(0)
            refined = system + non_system

        return refined

    # -------------------------------------------------------------------------
    # Tool definitions (used by Gemini)
    # -------------------------------------------------------------------------
    TOOLS_DEFINITIONS = {
        "read_artifact": {
            "name": "read_artifact",
            "description": "Reads the content of a file or data artifact from the platform's workspace.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "The path or filename to read (e.g., 'data.xlsx')"},
                    "file_id": {"type": "string", "description": "The unique ID of the file to read (from attachment metadata)"}
                },
                "required": ["path"]
            }
        },
        "write_artifact": {
            "name": "write_artifact",
            "description": "Writes or saves data to a file in the platform's workspace.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "The path or filename to write to"},
                    "content": {"type": "string", "description": "The string content or data to write"},
                    "is_binary": {"type": "boolean", "description": "Whether the content is base64 encoded binary data"}
                },
                "required": ["path", "content"]
            }
        },
        "search_web": {
            "name": "search_web",
            "description": "Performs a real-time web search for the latest information using the platform's research engine.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "The search query to perform"}
                },
                "required": ["query"]
            }
        },
        "read_url": {
            "name": "read_url",
            "description": "Fetches and reads the full text and HTML content of a public website URL.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "The absolute URL to read"}
                },
                "required": ["url"]
            }
        }
    }

    # -------------------------------------------------------------------------
    # Gemini implementation (with tool calling)
    # -------------------------------------------------------------------------
    async def _chat_gemini(self, messages: List[Dict[str, str]], agent_name: str = "Ensemble specialist", **kwargs) -> Dict[str, Any]:
        """Call Google Gemini API with tool support and auto-retry after tool execution."""
        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": self.api_key
        }

        # 1. Inject Universal Professional Prompt (Once Only)
        tag = "<!-- ENSEMBLE_SYSTEM_LOCKED -->"
        has_tag = any(tag in str(m.get("content", "")) for m in messages)
        
        if not has_tag:
            # Format the template with the provided agent identity
            formatted_prompt = UNIVERSAL_PROFESSIONAL_PROMPT.format(identity=agent_name)
            has_system = False
            for system_m in (m for m in messages if m.get("role") == "system"):
                system_m["content"] = f"{tag}\n{formatted_prompt}\n\n{system_m['content']}"
                has_system = True
                break
            if not has_system:
                messages.insert(0, {"role": "system", "content": f"{tag}\n{formatted_prompt}"})

        # Build tool declarations if requested
        requested_tools = kwargs.get("tools", [])
        gemini_tools = []
        if requested_tools:
            function_declarations = []
            for t in requested_tools:
                if isinstance(t, str):
                    # It's a tool name, lookup in definitions
                    if t in self.TOOLS_DEFINITIONS:
                        function_declarations.append(self.TOOLS_DEFINITIONS[t])
                elif isinstance(t, dict):
                    # It's already a full schema
                    function_declarations.append(t)
            
            if function_declarations:
                gemini_tools.append({"function_declarations": function_declarations})

        # Convert messages to Gemini format (Official REST Spec 2026)
        contents = []
        system_instruction = None

        # Gemini context Coalescing engine
        idx = 0
        while idx < len(messages):
            m = messages[idx]
            role = m.get("role", "user")
            
            if role == "system":
                content = m.get("content", "")
                system_instruction = (system_instruction + "\n" + content) if system_instruction else content
                idx += 1
                continue

            # --- COALESCE PARALLEL RESPONSES ---
            if role == "function":
                # Gather all consecutive function responses into a single turn
                response_parts = []
                while idx < len(messages) and messages[idx].get("role") == "function":
                    fn_m = messages[idx]
                    response_parts.append({
                        "functionResponse": {
                            "name": fn_m.get("name"),
                            "response": {"content": fn_m.get("content", "")}
                        }
                    })
                    idx += 1
                
                # Push a single turn with all collected responses (Mandatory for parallel spec)
                contents.append({
                    "role": "user",
                    "parts": response_parts
                })
                continue

            # --- MODEL CALLS (ASSISTANT) ---
            if role == "assistant" or role == "model":
                parts = []
                # Reconstruct turn: [Text (if any)] + [FunctionCalls]
                text = m.get("content")
                if text and text.strip():
                    parts.append({"text": text})
                
                fcs = m.get("function_calls") or ([m["function_call"]] if "function_call" in m else [])
                for fc in fcs:
                    parts.append({"functionCall": fc})
                
                # Ensure turn is never empty per REST spec
                if not parts:
                    parts.append({"text": " "})
                
                contents.append({"role": "model", "parts": parts})
                idx += 1
                continue

            # --- USER MESSAGES ---
            else:
                contents.append({
                    "role": "user",
                    "parts": [{"text": m.get("content") or " "}]
                })
                idx += 1

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent"
        payload = {
            "contents": contents,
            "generationConfig": {
                "temperature": kwargs.get("temperature", 0.7),
                "topP": kwargs.get("top_p", 0.95),
                "maxOutputTokens": kwargs.get("max_tokens", 8192)
            }
        }
        
        # Only inject thinkingConfig if it's explicitly a reasoning model
        if "-thinking" in self.model:
            payload["generationConfig"]["thinkingConfig"] = {"includeThoughts": False}
        if system_instruction:
            payload["system_instruction"] = {"parts": [{"text": system_instruction}]}
        if gemini_tools:
            payload["tools"] = gemini_tools
            payload["toolConfig"] = {"functionCallingConfig": {"mode": "AUTO"}}

        # 🛰️ Telemetry: Log the payload for protocol verification
        # print(f"DEBUG: Gemini Payload -> {json.dumps(payload, indent=2)}")

        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                resp = await client.post(url, headers=headers, json=payload)
                resp.raise_for_status()
                data = resp.json()
                
                # 📢 Protocol Forensics: Print trace on protocol error
                # print(f"DEBUG: Gemini Raw Response -> {json.dumps(data, indent=2)}")

                candidates = data.get("candidates", [])
                if not candidates:
                    print(f"❌ [Gemini Protocol Error] No candidates. Data: {data}")
                    return {"text": "Error: Gemini returned no candidates (Response may be blocked).", "usage": {}}

                first = candidates[0]
                finish_reason = first.get("finishReason")
                
                parts = first.get("content", {}).get("parts", [])
                if not parts:
                    if finish_reason == "UNEXPECTED_TOOL_CALL":
                        print(f"❌ [Protocol Culprit] UNEXPECTED_TOOL_CALL detected. Trace: {json.dumps(first, indent=2)}")
                    return {"text": f"Error: Gemini response incomplete (Finish Reason: {finish_reason}).", "usage": {}}

                # Check for parallel function calls (Gemini 2.5 supports multiple per turn)
                tool_calls = [p["functionCall"] for p in parts if "functionCall" in p]
                
                if tool_calls:
                    # Capture preamble text often sent alongside tool calls (Crucial for protocol integrity)
                    preamble = " ".join([p["text"] for p in parts if "text" in p]).strip() or None
                    print(f"🛠️ [ParallelCall] Agent requested {len(tool_calls)} tools. Preamble: {preamble}")
                    
                    # 🧱 State Bridge: Add the model's turn (Text + Logic) to history
                    messages.append({"role": "assistant", "content": preamble, "function_calls": tool_calls})
                    
                    # Execute all tools in parallel (logical batch)
                    for fc in tool_calls:
                        tool_name = fc["name"]
                        tool_args = fc.get("args", {})
                        
                        try:
                            from core.tools import execute_tool
                            result = execute_tool(tool_name, tool_args)
                        except Exception as e:
                            result = f"Error executing tool '{tool_name}': {str(e)}"
                        
                        # Add individual responses to history
                        messages.append({"role": "function", "name": tool_name, "content": result})

                    print(f"🔄 [AgentMode] Re-calling LLM with {len(tool_calls)} results")
                    return await self._chat_gemini(messages, agent_name=agent_name, **kwargs)

                # Normal text response
                text = parts[0].get("text", "")
                usage = data.get("usageMetadata", {})
                return {
                    "text": text,
                    "usage": {
                        "prompt_tokens": usage.get("promptTokenCount", 0),
                        "completion_tokens": usage.get("candidatesTokenCount", 0),
                        "total_tokens": usage.get("totalTokenCount", 0)
                    }
                }

            except httpx.HTTPStatusError as e:
                error_detail = f"HTTP {e.response.status_code}: {e.response.text[:200]}"
                print(f"❌ [LLMProvider] Gemini API Error: {error_detail}", flush=True)
                return {"text": f"Error calling Gemini: {error_detail}", "usage": {}}
            except Exception as e:
                print(f"❌ [LLMProvider] Gemini API Error: {str(e)}", flush=True)
                return {"text": f"Error calling Gemini: {str(e)}", "usage": {}}

    async def _chat_gemini_stream(self, messages: List[Dict[str, str]], agent_name: str = "Ensemble specialist", **kwargs):
        """Stream chunks from Gemini (no tool calling in stream mode)."""
        headers = {"Content-Type": "application/json", "x-goog-api-key": self.api_key}
        
        # Inject Universal Professional Prompt (Once Only)
        tag = "<!-- ENSEMBLE_SYSTEM_LOCKED -->"
        has_tag = any(tag in str(m.get("content", "")) for m in messages)
        formatted_prompt = UNIVERSAL_PROFESSIONAL_PROMPT.format(identity=agent_name)
        
        if not has_tag:
            has_system = False
            for system_m in (m for m in messages if m.get("role") == "system"):
                system_m["content"] = f"{tag}\n{formatted_prompt}\n\n{system_m['content']}"
                has_system = True
                break
            if not has_system:
                messages.insert(0, {"role": "system", "content": f"{tag}\n{formatted_prompt}"})

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
        if system_instruction:
            payload["system_instruction"] = {"parts": [{"text": system_instruction}]}

        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as response:
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        if line[6:] == "[DONE]":
                            break
                        try:
                            data = json.loads(line[6:])
                            text = data["candidates"][0]["content"]["parts"][0]["text"]
                            yield text
                        except (KeyError, IndexError, json.JSONDecodeError):
                            continue

    # -------------------------------------------------------------------------
    # OpenAI-compatible (Ollama, LocalAI, DeepSeek, etc.)
    # -------------------------------------------------------------------------
    async def _chat_openai_compatible(self, messages: List[Dict[str, str]], agent_name: str = "Ensemble specialist", **kwargs) -> Dict[str, Any]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        # 1. Inject Universal Professional Prompt (Once Only)
        tag = "<!-- ENSEMBLE_SYSTEM_LOCKED -->"
        has_tag = any(tag in str(m.get("content", "")) for m in messages)
        formatted_prompt = UNIVERSAL_PROFESSIONAL_PROMPT.format(identity=agent_name)
        
        if not has_tag:
            has_system = False
            for system_m in (m for m in messages if m.get("role") == "system"):
                system_m["content"] = f"{tag}\n{formatted_prompt}\n\n{system_m['content']}"
                has_system = True
                break
            if not has_system:
                messages.insert(0, {"role": "system", "content": f"{tag}\n{formatted_prompt}"})

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

                choices = data.get("choices", [])
                if not choices:
                    return {"text": f"Error: No responses from {self.provider}.", "usage": {}}

                text = choices[0].get("message", {}).get("content", "")
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
                print(f"❌ [LLMProvider] OpenAI-compatible error: {str(e)}", flush=True)
                return {"text": f"Error calling {self.provider}: {str(e)}", "usage": {}}

    async def _chat_openai_compatible_stream(self, messages: List[Dict[str, str]], agent_name: str = "Ensemble specialist", **kwargs):
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        # 1. Inject Universal Professional Prompt (Once Only)
        tag = "<!-- ENSEMBLE_SYSTEM_LOCKED -->"
        has_tag = any(tag in str(m.get("content", "")) for m in messages)
        formatted_prompt = UNIVERSAL_PROFESSIONAL_PROMPT.format(identity=agent_name)
        
        if not has_tag:
            has_system = False
            for system_m in (m for m in messages if m.get("role") == "system"):
                system_m["content"] = f"{tag}\n{formatted_prompt}\n\n{system_m['content']}"
                has_system = True
                break
            if not has_system:
                messages.insert(0, {"role": "system", "content": f"{tag}\n{formatted_prompt}"})
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        refined = self._prepare_messages(messages)
        payload = {
            "model": self.model,
            "messages": refined,
            "temperature": kwargs.get("temperature", 0.7),
            "stream": True
        }

        endpoint = self.base_url.rstrip("/")
        if not endpoint.endswith("/chat/completions"):
            endpoint += "/chat/completions"

        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream("POST", endpoint, headers=headers, json=payload) as response:
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        if line[6:] == "[DONE]":
                            break
                        try:
                            data = json.loads(line[6:])
                            text = data["choices"][0]["delta"].get("content", "")
                            if text:
                                yield text
                        except (KeyError, IndexError, json.JSONDecodeError):
                            continue