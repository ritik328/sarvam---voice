import pytest
import httpx
from unittest.mock import AsyncMock, MagicMock, patch

from app.server.config.settings import Settings
from app.server.sarvam.search_adapter import WebSearchAdapter
from app.server.sarvam.llm_adapter import SEARCH_TOOLS


def test_search_tools_schema():
    assert len(SEARCH_TOOLS) >= 1
    tool = SEARCH_TOOLS[0]
    assert tool["type"] == "function"
    assert tool["function"]["name"] == "web_search"
    assert "query" in tool["function"]["parameters"]["properties"]
    assert "query" in tool["function"]["parameters"]["required"]


@pytest.mark.asyncio
async def test_search_adapter_no_api_key():
    settings = Settings(tavily_api_key="")
    adapter = WebSearchAdapter(settings)
    try:
        res = await adapter.search("latest news")
        assert "Search unavailable" in res
    finally:
        await adapter.close()


@pytest.mark.asyncio
async def test_search_adapter_formatting():
    settings = Settings(tavily_api_key="mock_key")
    adapter = WebSearchAdapter(settings)

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "answer": "OpenAI announced GPT-5.",
        "results": [
            {
                "title": "GPT-5 Overview",
                "content": "A detailed article about the new model features.",
                "url": "https://example.com/gpt5",
            }
        ],
    }

    try:
        with patch.object(adapter._client, "post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_response
            res = await adapter.search("GPT-5 release")

            assert "Quick answer: OpenAI announced GPT-5." in res
            assert "[1] GPT-5 Overview" in res
            assert "Source: https://example.com/gpt5" in res
    finally:
        await adapter.close()


@pytest.mark.asyncio
async def test_search_adapter_http_error():
    settings = Settings(tavily_api_key="mock_key")
    adapter = WebSearchAdapter(settings)

    try:
        with patch.object(adapter._client, "post", new_callable=AsyncMock) as mock_post:
            req = httpx.Request("POST", "https://api.tavily.com/search")
            resp = httpx.Response(status_code=401, text="Unauthorized", request=req)
            mock_post.side_effect = httpx.HTTPStatusError("Unauthorized", request=req, response=resp)

            res = await adapter.search("test query")
            assert "Search failed: HTTP 401" in res
    finally:
        await adapter.close()


@pytest.mark.asyncio
async def test_search_adapter_zero_results_fallback():
    settings = Settings(tavily_api_key="mock_key")
    adapter = WebSearchAdapter(settings)

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.http_version = "HTTP/2"
    mock_response.json.return_value = {"results": [], "answer": ""}

    try:
        with patch.object(adapter._client, "post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_response
            res = await adapter.search("nonexistent query 12345")
            assert "No web results found. Answer from your training data" in res
    finally:
        await adapter.close()


@pytest.mark.asyncio
async def test_search_adapter_payload_settings():
    settings = Settings(tavily_api_key="mock_key")
    adapter = WebSearchAdapter(settings)

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.http_version = "HTTP/2"
    mock_response.json.return_value = {
        "results": [{"title": "T1", "content": "C1", "url": "U1"}]
    }

    try:
        with patch.object(adapter._client, "post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_response
            await adapter.search("test")

            call_args = mock_post.call_args
            payload = call_args.kwargs.get("json") or call_args[1].get("json")
            assert payload["include_answer"] is False
            assert payload["max_results"] == 2
            assert payload["search_depth"] == "basic"
    finally:
        await adapter.close()


def test_settings_search_interim_cue():
    s_default = Settings(tavily_api_key="mock")
    assert s_default.search_interim_cue == "Let me check that for you."

    s_custom = Settings(tavily_api_key="mock", search_interim_cue="Looking into that...")
    assert s_custom.search_interim_cue == "Looking into that..."

