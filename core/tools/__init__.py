import os
import json

def read_artifact(path: str = None, file_id: str = None) -> str:
    """Reads the content of a file from uploads or workspace with auto-truncation."""
    workspace_dir = "data/workspace"
    TRUNCATE_LIMIT = 5000 # Increased for higher-fidelity analysis

    def _safe_read(full_path: str, ext: str) -> str:
        if ext in [".xlsx", ".xls", ".ods"]:
            try:
                import pandas as pd
                df = pd.read_excel(full_path)
                schema = f"Sheet: {full_path.split('/')[-1]}\nColumns: {', '.join(df.columns)}\nShape: {df.shape[0]} rows x {df.shape[1]} columns\n\n"
                stats = f"### Statistical Summary:\n{df.describe().to_markdown()}\n\n"
                sample = f"### First 10 Rows:\n{df.head(10).to_markdown(index=False)}"
                return f"[DATA EXTRACTED]\n{schema}{stats}{sample}"
            except Exception as e:
                return f"[INFO] Spreadsheet Extraction failed: {str(e)}."
        
        if ext == ".docx":
            try:
                import docx
                doc = docx.Document(full_path)
                content = "\n".join([p.text for p in doc.paragraphs])
            except Exception as e:
                return f"Error reading .docx: {str(e)}"
        else:
            try:
                with open(full_path, "r", encoding="utf-8", errors="ignore") as file:
                    content = file.read()
            except Exception as e:
                return f"Error reading file: {str(e)}"

        if len(content) > TRUNCATE_LIMIT:
            return content[:TRUNCATE_LIMIT] + f"\n\n... [TRUNCATED. Size: {len(content)} bytes] ..."
        return content

    # Standardize to data/workspace sandbox for all file lookups
    if path:
        full_p = os.path.join(workspace_dir, path)
        if os.path.exists(full_p):
            return _safe_read(full_p, os.path.splitext(full_p)[1].lower())
            
    if file_id and os.path.exists(workspace_dir):
        # Fallback to scanning for file_id match
        for f in os.listdir(workspace_dir):
            if f.startswith(file_id):
                return _safe_read(os.path.join(workspace_dir, f), os.path.splitext(f)[1].lower())

    return f"Error: File '{path or file_id}' not found in agent sandbox."

def search_web(query: str) -> str:
    """Search the web for real-time information using DuckDuckGo."""
    try:
        from duckduckgo_search import DDGS
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=5))

        if not results:
            return f"No results found for '{query}'."

        output = []
        for r in results:
            output.append(f"Title: {r.get('title')}\nURL: {r.get('href')}\nSnippet: {r.get('body')}")
        return "\n\n".join(output)
    except Exception as e:
        return f"Error during web search: {str(e)}"

def write_artifact(path: str, content: str, is_binary: bool = False) -> str:
    """Saves content to a file in the project workspace."""
    try:
        # Strictly Sandbox all writes to data/workspace/
        os.makedirs("data/workspace", exist_ok=True)
        full_path = os.path.join("data/workspace", path)
        mode = "wb" if is_binary else "w"
        
        if is_binary:
            import base64
            # Handle common base64 data URL prefixes if present
            raw_data = content.split("base64,", 1)[1] if "base64," in content else content
            data = base64.b64decode(raw_data)
            with open(full_path, "wb") as f: f.write(data)
        else:
            with open(full_path, "w", encoding="utf-8") as f: f.write(content)
            
        return f"Successfully wrote {os.path.getsize(full_path)} bytes to '{path}' (Sandboxed in data/workspace)."
    except Exception as e:
        return f"Error writing artifact: {str(e)}"

def list_artifacts(directory: str = "data/workspace") -> str:
    """Lists visible files in the agent sandbox directory."""
    try:
        # Force the list to the sandbox
        target_dir = "data/workspace"
        os.makedirs(target_dir, exist_ok=True)
        visible = [f for f in os.listdir(target_dir) if not f.startswith(".")]
        return f"Visible files in agent sandbox:\n" + "\n".join([f"- {f}" for f in visible])
    except Exception as e:
        return f"Error listing artifacts: {str(e)}"

def execute_tool(name: str, args: dict) -> str:
    """Route tool calls."""
    tools = {
        "read_artifact": read_artifact,
        "search_web": search_web,
        "write_artifact": write_artifact,
        "list_artifacts": list_artifacts
    }
    if name in tools:
        return tools[name](**args)
    return f"Error: Tool {name} not implemented."
