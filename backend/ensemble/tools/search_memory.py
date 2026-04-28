"""
Module: search_memory.py
Description: Part of the Ensemble backend system.
"""

import json
import sys

from backend.ensemble.rag import get_vector_store


def search_memory(query: str, top_k: int = 5):
    """
    Search the Ensemble long-term memory for semantic matches.
    Useful for recalling past decisions, artifact contents, or cross-project info.
    """
    try:
        store = get_vector_store()
        results = store.search(query, top_k=top_k)

        if not results:
            return "No matching memories found."

        formatted = "Found the following relevant memories:\n\n"
        for r in results:
            score_pct = int(r["score"] * 100)
            formatted += f"--- [Score: {score_pct}%] ---\n"
            formatted += f"Content: {r['content'][:500]}...\n"  # Truncate long content
            formatted += f"Metadata: {json.dumps(r['metadata'])}\n\n"

        return formatted
    except Exception as e:
        return f"Error searching memory: {str(e)}"


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python search_memory.py '<query>'")
        sys.exit(1)

    query = sys.argv[1]
    print(search_memory(query))
