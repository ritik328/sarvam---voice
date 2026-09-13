from __future__ import annotations

import logging
import httpx
from app.server.config.settings import Settings

logger = logging.getLogger(__name__)


class WebSearchAdapter:
    """
    Web search via Tavily API.
    Returns clean text snippets the LLM can use to answer current-events questions.
    """

    SEARCH_PATH = "https://api.tavily.com/search"

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client = httpx.AsyncClient(
            http2=True,
            timeout=httpx.Timeout(connect=2.0, read=5.0, write=5.0, pool=5.0),
        )

    async def search(self, query: str, max_results: int = 2) -> str:
        """
        Search the web and return formatted text results.
        Returns a string the LLM can read as tool output.
        """
        api_key = self._settings.tavily_api_key
        if not api_key:
            logger.warning("Search: no Tavily API key configured")
            return "Search unavailable: no API key configured."

        payload = {
            "api_key": api_key,
            "query": query,
            "max_results": max_results,
            "include_answer": False,
            "search_depth": "basic",
        }

        try:
            response = await self._client.post(self.SEARCH_PATH, json=payload)
            response.raise_for_status()
            data = response.json()

            answer = data.get("answer", "")
            results = data.get("results", [])

            if not results and not answer:
                logger.info("Search: query='%s' returned 0 results", query)
                return (
                    "No web results found. Answer from your training data if possible, "
                    "and let the user know the information may not be current."
                )

            formatted = ""
            if answer:
                formatted += f"Quick answer: {answer}\n\n"
            for i, r in enumerate(results[:max_results], 1):
                title = r.get("title", "")
                snippet = r.get("content", "")[:250]
                url = r.get("url", "")
                formatted += f"[{i}] {title}\n{snippet}\nSource: {url}\n\n"

            logger.info("Search (HTTP/%s): query='%s' → %d chars", response.http_version, query, len(formatted))
            return formatted.strip()

        except httpx.HTTPStatusError as e:
            logger.error("Search HTTP error %s: %s", e.response.status_code, e.response.text)
            return f"Search failed: HTTP {e.response.status_code}"
        except Exception as e:
            logger.error("Search unexpected error: %s", e)
            return f"Search failed: {e}"

    async def close(self) -> None:
        await self._client.aclose()
