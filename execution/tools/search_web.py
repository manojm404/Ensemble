import json

def search_web(query: str) -> str:
    """Performs a simulated web search for specific topics."""
    simulated_results = {
        "latest AI news": [
            "1. Google Deepmind announces new Agentic models for coding automation.",
            "2. OpenAI releases GPT-5 Turbo in limited beta for enterprise customers.",
            "3. Anthropic introduces Claude 4.5 Opus with enhanced multi-modal reasoning.",
            "4. Ensemble AI platform reaches v1.1 status with dynamic memory capabilities."
        ],
        "default": [
            f"Search result for '{query}': Top 3 results omitted for brief simulation.",
            "Relevant page from ArXiv.org found matching the topic.",
            "WikiPedia entry regarding this query exists."
        ]
    }
    
    results = simulated_results.get(query.lower(), simulated_results["default"])
    return "\n".join(results)

if __name__ == "__main__":
    print(search_web("latest AI news"))
