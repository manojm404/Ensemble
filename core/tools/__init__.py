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
        # Use the new ddgs package (formerly duckduckgo_search)
        try:
            from ddgs import DDGS
        except ImportError:
            from duckduckgo_search import DDGS
        
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=5))

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
        return f"""⚠️ Web search encountered an error: {str(e)}

This may be due to:
- Network connectivity issues
- DuckDuckGo rate limiting
- Package not installed

Try again or search manually at: https://duckduckgo.com/?q={query.replace(' ', '+')}"""

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
        "list_artifacts": list_artifacts,
        "get_stock_data": get_stock_data,
        "get_technical_indicators": get_technical_indicators,
        "get_company_fundamentals": get_company_fundamentals,
        "get_market_news": get_market_news,
    }
    if name in tools:
        return tools[name](**args)
    return f"Error: Tool {name} not implemented."


# ============================================================
# Financial Data Tools (TradingAgents Integration)
# ============================================================

def get_stock_data(ticker: str, period: str = "1y") -> str:
    """
    Get historical stock price data using Yahoo Finance.

    Args:
        ticker: Stock ticker symbol (e.g., "NVDA", "AAPL", "TSLA")
        period: Time period for historical data (1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max)

    Returns:
        Formatted string with current price, change, and historical data summary
    """
    try:
        import yfinance as yf

        stock = yf.Ticker(ticker.upper())

        # Get current info
        info = stock.info

        # Get historical data
        hist = stock.history(period=period)

        if hist.empty:
            return f"❌ No data found for ticker: {ticker}\n\nPossible reasons:\n- Invalid ticker symbol\n- Delisted stock\n- Market is closed\n\nTry a different ticker or period."

        # Current price info
        current_price = hist['Close'].iloc[-1]
        prev_price = hist['Close'].iloc[-2] if len(hist) > 1 else current_price
        price_change = current_price - prev_price
        pct_change = (price_change / prev_price) * 100

        # Key metrics
        high_52w = info.get('fiftyTwoWeekHigh', 'N/A')
        low_52w = info.get('fiftyTwoWeekLow', 'N/A')
        market_cap = info.get('marketCap', 'N/A')
        volume = info.get('volume', hist['Volume'].iloc[-1])
        avg_volume = info.get('averageVolume', 'N/A')

        # Format market cap
        if market_cap != 'N/A' and isinstance(market_cap, (int, float)):
            if market_cap >= 1e12: market_cap = f"${market_cap/1e12:.2f}T"
            elif market_cap >= 1e9: market_cap = f"${market_cap/1e9:.2f}B"
            elif market_cap >= 1e6: market_cap = f"${market_cap/1e6:.2f}M"
            else: market_cap = f"${market_cap:,.0f}"

        output = f"""📊 Stock Data: {ticker.upper()}

💰 Current Price: ${current_price:.2f}
📈 Change: {'+' if price_change >= 0 else ''}{price_change:.2f} ({'+' if pct_change >= 0 else ''}{pct_change:.2f}%)

📋 Key Metrics:
• Market Cap: {market_cap}
• Volume: {volume:,}
• Avg Volume: {avg_volume}
• 52W High: ${high_52w if isinstance(high_52w, (int, float)) else high_52w}
• 52W Low: ${low_52w if isinstance(low_52w, (int, float)) else low_52w}

📊 Recent Price History (Last 5 Days):
| Date       | Open    | High    | Low     | Close   | Volume    |
|------------|---------|---------|---------|---------|-----------|
"""
        # Add last 5 rows
        for date, row in hist.tail(5).iterrows():
            output += f"| {date.strftime('%Y-%m-%d')} | ${row['Open']:.2f} | ${row['High']:.2f} | ${row['Low']:.2f} | ${row['Close']:.2f} | {int(row['Volume']):,} |\n"

        # Company name if available
        company_name = info.get('shortName', info.get('longName', ''))
        if company_name:
            output = f"🏢 {company_name} ({ticker.upper()})\n\n" + output

        return output

    except ImportError:
        return "❌ yfinance package not installed. Run: pip install yfinance"
    except Exception as e:
        return f"❌ Error fetching stock data for {ticker}: {str(e)}\n\nCheck the ticker symbol and try again."


def get_technical_indicators(ticker: str, period: str = "6mo") -> str:
    """
    Calculate technical indicators using stockstats.

    Args:
        ticker: Stock ticker symbol
        period: Time period for analysis

    Returns:
        Technical analysis with MACD, RSI, Bollinger Bands, and other indicators
    """
    try:
        import yfinance as yf
        from stockstats import StockDataFrame

        stock = yf.Ticker(ticker.upper())
        hist = stock.history(period=period)

        if hist.empty:
            return f"❌ No data found for ticker: {ticker}"

        # Convert to stockstats format
        df = StockDataFrame.retype(hist)

        # Calculate indicators
        # RSI (Relative Strength Index)
        df.get('rsi_14')
        # MACD
        df.get('macd')
        df.get('macds')  # MACD signal
        df.get('macdh')  # MACD histogram
        # Bollinger Bands
        df.get('boll')
        df.get('boll_ub')  # Upper band
        df.get('boll_lb')  # Lower band
        # KD (Stochastic)
        df.get('kdjk')
        df.get('kdjd')
        # CCI (Commodity Channel Index)
        df.get('cci_20')
        # ATR (Average True Range)
        df.get('atr_14')

        # Get latest values
        last = df.iloc[-1]

        rsi = last.get('rsi_14', None)
        macd = last.get('macd', None)
        macd_signal = last.get('macds', None)
        macd_hist = last.get('macdh', None)
        boll_mid = last.get('boll', None)
        boll_upper = last.get('boll_ub', None)
        boll_lower = last.get('boll_lb', None)
        kdj_k = last.get('kdjk', None)
        kdj_d = last.get('kdjd', None)
        cci = last.get('cci_20', None)
        atr = last.get('atr_14', None)

        # Interpretations
        rsi_signal = "OVERBOUGHT (sell pressure likely)" if rsi and rsi > 70 else \
                     "OVERSOLD (buy opportunity)" if rsi and rsi < 30 else \
                     "NEUTRAL" if rsi else "N/A"

        macd_signal_text = "BULLISH crossover" if macd_hist and macd_hist > 0 else \
                          "BEARISH crossover" if macd_hist else "N/A"

        output = f"""📈 Technical Indicators: {ticker.upper()}

🔴 RSI (14): {rsi:.2f} → {rsi_signal}

📊 MACD:
• MACD Line: {macd:.4f}
• Signal Line: {macd_signal:.4f}
• Histogram: {macd_hist:.4f}
• Signal: {macd_signal_text}

📉 Bollinger Bands:
• Upper Band: ${boll_upper:.2f}
• Middle (SMA): ${boll_mid:.2f}
• Lower Band: ${boll_lower:.2f}
• Position: {'NEAR UPPER BAND (overbought)' if boll_upper and last['Close'] > boll_upper * 0.95 else 'NEAR LOWER BAND (oversold)' if boll_lower and last['Close'] < boll_lower * 1.05 else 'WITHIN BANDS (neutral)'}

🎯 Stochastic (KDJ):
• K: {kdj_k:.2f}
• D: {kdj_d:.2f}
• Signal: {'OVERBOUGHT' if kdj_k and kdj_k > 80 else 'OVERSOLD' if kdj_k and kdj_k < 20 else 'NEUTRAL'}

📊 CCI (20): {cci:.2f} → {'OVERBOUGHT' if cci and cci > 100 else 'OVERSOLD' if cci and cci < -100 else 'NEUTRAL'}

⚡ ATR (14): {atr:.2f} (volatility measure)

💡 Summary:
• Trend: {'BULLISH' if macd and macd > macd_signal else 'BEARISH' if macd and macd < macd_signal else 'NEUTRAL'}
• Volatility: {'HIGH' if atr and atr > (hist['Close'].mean() * 0.03) else 'LOW' if atr else 'MODERATE'}
• Momentum: {'STRONG' if rsi and (rsi > 60 or rsi < 40) else 'MODERATE' if rsi else 'N/A'}
"""
        return output

    except ImportError as e:
        return f"❌ Missing package: {str(e)}\nRun: pip install yfinance stockstats"
    except Exception as e:
        return f"❌ Error calculating technical indicators for {ticker}: {str(e)}"


def get_company_fundamentals(ticker: str) -> str:
    """
    Get company fundamental data (financials, ratios, key metrics).

    Args:
        ticker: Stock ticker symbol

    Returns:
        Fundamental analysis with revenue, EPS, P/E, margins, etc.
    """
    try:
        import yfinance as yf

        stock = yf.Ticker(ticker.upper())
        info = stock.info
        financials = stock.financials
        balance_sheet = stock.balance_sheet

        if not info:
            return f"❌ No fundamental data found for ticker: {ticker}\n\nPossible reasons:\n- Invalid ticker\n- Company is not publicly traded\n- Data temporarily unavailable"

        # Key fundamentals
        company_name = info.get('longName', info.get('shortName', ticker.upper()))
        sector = info.get('sector', 'N/A')
        industry = info.get('industry', 'N/A')
        market_cap = info.get('marketCap', 'N/A')

        # Valuation metrics
        pe_ratio = info.get('trailingPE', info.get('forwardPE', 'N/A'))
        pb_ratio = info.get('priceToBook', 'N/A')
        ps_ratio = info.get('priceToSalesTrailing12Months', 'N/A')
        peg_ratio = info.get('pegRatio', 'N/A')
        ev_ebitda = info.get('enterpriseToEbitda', 'N/A')

        # Financial health
        revenue = info.get('totalRevenue', 'N/A')
        gross_profit = info.get('grossMargins', 'N/A')
        operating_margin = info.get('operatingMargins', 'N/A')
        profit_margin = info.get('profitMargins', 'N/A')
        roe = info.get('returnOnEquity', 'N/A')
        roa = info.get('returnOnAssets', 'N/A')
        debt_to_equity = info.get('debtToEquity', 'N/A')
        current_ratio = info.get('currentRatio', 'N/A')
        quick_ratio = info.get('quickRatio', 'N/A')

        # Per share metrics
        eps = info.get('trailingEps', info.get('forwardEps', 'N/A'))
        book_value = info.get('bookValue', 'N/A')
        revenue_per_share = info.get('revenuePerShare', 'N/A')

        # Dividends
        dividend_yield = info.get('dividendYield', 'N/A')
        payout_ratio = info.get('payoutRatio', 'N/A')

        def fmt(val, suffix='', precision=2):
            if val == 'N/A' or val is None:
                return 'N/A'
            if isinstance(val, (int, float)):
                if val >= 1e12: return f"${val/1e12:.2f}T{suffix}"
                if val >= 1e9: return f"${val/1e9:.2f}B{suffix}"
                if val >= 1e6: return f"${val/1e6:.2f}M{suffix}"
                if isinstance(val, float) and val < 10: return f"{val:.{precision}f}{suffix}"
                return f"{val:,.0f}{suffix}"
            return f"{val}{suffix}"

        def pct(val):
            if val == 'N/A' or val is None: return 'N/A'
            if isinstance(val, (int, float)): return f"{val*100:.2f}%"
            return f"{val}"

        output = f"""🏢 {company_name} ({ticker.upper()})

📋 Overview:
• Sector: {sector}
• Industry: {industry}
• Market Cap: {fmt(market_cap)}

💰 Valuation:
• P/E Ratio: {fmt(pe_ratio)}
• Price-to-Book: {fmt(pb_ratio)}
• Price-to-Sales: {fmt(ps_ratio)}
• PEG Ratio: {fmt(peg_ratio)}
• EV/EBITDA: {fmt(ev_ebitda)}

📊 Financial Health:
• Revenue: {fmt(revenue)}
• EPS: {fmt(eps)}
• Gross Margin: {pct(gross_profit)}
• Operating Margin: {pct(operating_margin)}
• Profit Margin: {pct(profit_margin)}
• Return on Equity: {pct(roe)}
• Return on Assets: {pct(roa)}

⚖️ Balance Sheet:
• Debt-to-Equity: {fmt(debt_to_equity)}
• Current Ratio: {fmt(current_ratio)}
• Quick Ratio: {fmt(quick_ratio)}
• Book Value/Share: {fmt(book_value)}

💵 Dividends:
• Dividend Yield: {pct(dividend_yield)}
• Payout Ratio: {pct(payout_ratio)}

💡 Quick Assessment:
• Valuation: {'UNDERVALUED' if pe_ratio and isinstance(pe_ratio, (int, float)) and pe_ratio < 15 else 'OVERVALUED' if pe_ratio and isinstance(pe_ratio, (int, float)) and pe_ratio > 30 else 'FAIR' if pe_ratio and isinstance(pe_ratio, (int, float)) else 'N/A'}
• Profitability: {'STRONG' if profit_margin and isinstance(profit_margin, (int, float)) and profit_margin > 0.2 else 'MODERATE' if profit_margin and isinstance(profit_margin, (int, float)) and profit_margin > 0.1 else 'WEAK' if profit_margin else 'N/A'}
• Financial Health: {'STRONG' if debt_to_equity and isinstance(debt_to_equity, (int, float)) and debt_to_equity < 50 else 'MODERATE' if debt_to_equity and isinstance(debt_to_equity, (int, float)) and debt_to_equity < 100 else 'WEAK' if debt_to_equity else 'N/A'}
"""
        return output

    except ImportError:
        return "❌ yfinance package not installed. Run: pip install yfinance"
    except Exception as e:
        return f"❌ Error fetching fundamentals for {ticker}: {str(e)}"


def get_market_news(ticker: str = "", limit: int = 10) -> str:
    """
    Get latest market news for a specific ticker or general market news.

    Args:
        ticker: Stock ticker symbol (optional, leave empty for general news)
        limit: Number of news articles to fetch (default: 10)

    Returns:
        Formatted list of recent news articles with sentiment hints
    """
    try:
        import yfinance as yf

        if ticker:
            stock = yf.Ticker(ticker.upper())
            news_list = stock.news
        else:
            # Get general market news via ^GSPC (S&P 500)
            market = yf.Ticker("^GSPC")
            news_list = market.news

        if not news_list:
            return f"📰 No recent news found for {ticker.upper() if ticker else 'general market'}\n\nTry again later or search manually."

        output = f"""📰 Market News: {ticker.upper() if ticker else 'General Market'}

"""
        for i, article in enumerate(news_list[:limit], 1):
            title = article.get('title', 'No title')
            publisher = article.get('publisher', 'Unknown')
            link = article.get('link', '#')
            published = article.get('providerPublishTime', 0)

            # Convert timestamp
            from datetime import datetime
            if published:
                pub_date = datetime.fromtimestamp(published).strftime('%Y-%m-%d %H:%M')
            else:
                pub_date = 'N/A'

            # Simple sentiment hint from title keywords
            title_lower = title.lower()
            bullish_words = ['up', 'rise', 'gain', 'bullish', 'rally', 'surge', 'jump', 'beat', 'strong', 'growth', 'profit']
            bearish_words = ['down', 'fall', 'drop', 'bearish', 'crash', 'slump', 'miss', 'weak', 'loss', 'decline', 'cut']

            bullish_count = sum(1 for w in bullish_words if w in title_lower)
            bearish_count = sum(1 for w in bearish_words if w in title_lower)

            if bullish_count > bearish_count:
                sentiment = "🟢 Bullish"
            elif bearish_count > bullish_count:
                sentiment = "🔴 Bearish"
            else:
                sentiment = "🟡 Neutral"

            output += f"""{i}. {title}
   📅 {pub_date} | 📰 {publisher}
   📊 Sentiment: {sentiment}
   🔗 {link}

"""

        return output.strip()

    except ImportError:
        return "❌ yfinance package not installed. Run: pip install yfinance"
    except Exception as e:
        return f"❌ Error fetching news: {str(e)}"
