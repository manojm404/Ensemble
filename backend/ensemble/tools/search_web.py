"""
Web Search Tool - Real-time web search using DuckDuckGo
"""

def search_web(query: str, max_results: int = 5) -> str:
    """
    Search the web for real-time information using DuckDuckGo.
    
    Args:
        query: The search query
        max_results: Maximum number of results to return (default: 5)
    
    Returns:
        Formatted search results with title, URL, and snippet
    """
    try:
        # Use the new ddgs package (formerly duckduckgo_search)
        try:
            from ddgs import DDGS
        except ImportError:
            from duckduckgo_search import DDGS
        
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=max_results))

        if not results:
            return f"""🔍 Search Results for: "{query}"

No results found. Try:
- Using different keywords
- Making the query more specific
- Checking spelling"""

        output = [f"🔍 Search Results for: \"{query}\"\n"]
        for i, r in enumerate(results, 1):
            title = r.get('title', 'No title')
            url = r.get('href', 'No URL')
            snippet = r.get('body', 'No description')
            output.append(f"{i}. **{title}**")
            output.append(f"   URL: {url}")
            output.append(f"   {snippet}\n")
        
        return "\n".join(output)
    
    except Exception as e:
        return f"Error during web search: {str(e)}"

if __name__ == "__main__":
    import sys
    query = sys.argv[1] if len(sys.argv) > 1 else "weirdest animal facts"
    print(search_web(query))

