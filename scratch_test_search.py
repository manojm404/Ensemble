from duckduckgo_search import DDGS
import json

def test_search():
    print("🚀 Testing DuckDuckGo Search Tool...")
    query = "GitHub Copilot features 2025"
    try:
        from duckduckgo_search import DDGS
        with DDGS() as ddgs:
            print(f"--- Trying Standard Search for '{query}' ---")
            results = list(ddgs.text(query, max_results=3))
            print(f"Standard Results: {len(results)}")
            
            print(f"\n--- Trying News Search for '{query}' ---")
            results = list(ddgs.news(query, max_results=3))
            print(f"News Results: {len(results)}")
            
            print(f"\n--- Trying Lite Search (via backend='lite') ---")
            # In some versions it's passed differently
            try:
                results = list(ddgs.text(query, region='wt-wt', safesearch='off', timelimit='y', max_results=3))
                print(f"Time-limited Results: {len(results)}")
            except:
                pass

    except Exception as e:
        print(f"❌ Search Error: {str(e)}")

if __name__ == "__main__":
    test_search()
