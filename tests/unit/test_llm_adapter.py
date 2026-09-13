import asyncio
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.server.config.settings import Settings
from app.server.sarvam.llm_adapter import SarvamLLMAdapter


@pytest.mark.asyncio
async def test_generate_with_tools_direct():
    settings = Settings(sarvam_api_key="mock", sarvam_llm_model="test-model")
    llm = SarvamLLMAdapter(settings)
    mock_search = AsyncMock()

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "choices": [
            {
                "message": {
                    "role": "assistant",
                    "content": "Hello! How can I help you?",
                }
            }
        ]
    }

    try:
        with patch.object(llm._client, "post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_resp
            cancel_event = asyncio.Event()

            text, used_search = await llm.generate_with_tools(
                [{"role": "user", "content": "Hi"}],
                mock_search,
                cancel_event,
            )

            assert text == "Hello! How can I help you?"
            assert used_search is False
            mock_search.search.assert_not_called()
    finally:
        await llm.close()


@pytest.mark.asyncio
async def test_generate_with_tools_search_streaming():
    settings = Settings(sarvam_api_key="mock", sarvam_llm_model="test-model")
    llm = SarvamLLMAdapter(settings)
    mock_search = AsyncMock()
    mock_search.search.return_value = "[1] OpenAI announces new model."

    # Step 1 response (Tool call)
    mock_step1_resp = MagicMock()
    mock_step1_resp.status_code = 200
    mock_step1_resp.json.return_value = {
        "choices": [
            {
                "message": {
                    "role": "assistant",
                    "tool_calls": [
                        {
                            "id": "call_123",
                            "type": "function",
                            "function": {
                                "name": "web_search",
                                "arguments": json.dumps({"query": "OpenAI news"}),
                            },
                        }
                    ],
                }
            }
        ]
    }

    # Step 3 streaming lines
    step3_lines = [
        b'data: {"choices":[{"delta":{"content":"OpenAI "}}]}\n',
        b'data: {"choices":[{"delta":{"content":"has announced a new model."}}]}\n',
        b'data: [DONE]\n',
    ]

    class MockStreamContext:
        def __init__(self, lines):
            self.lines = lines

        async def __aenter__(self):
            resp = MagicMock()
            resp.status_code = 200
            resp.raise_for_status = MagicMock()

            async def aiter_lines():
                for line in self.lines:
                    yield line.decode("utf-8")

            resp.aiter_lines = aiter_lines
            return resp

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    cue_called = False

    async def mock_cue():
        nonlocal cue_called
        cue_called = True

    received_deltas = []

    async def mock_delta(delta):
        received_deltas.append(delta)

    try:
        with patch.object(llm._client, "post", new_callable=AsyncMock) as mock_post, \
             patch.object(llm._client, "stream", side_effect=lambda *args, **kwargs: MockStreamContext(step3_lines)):
            mock_post.return_value = mock_step1_resp
            cancel_event = asyncio.Event()

            text, used_search = await llm.generate_with_tools(
                [{"role": "user", "content": "What is the OpenAI news?"}],
                mock_search,
                cancel_event,
                on_tool_call_start=mock_cue,
                on_delta=mock_delta,
            )

            assert used_search is True
            assert cue_called is True
            assert text == "OpenAI has announced a new model."
            assert received_deltas == ["OpenAI ", "has announced a new model."]
            mock_search.search.assert_awaited_once_with("OpenAI news")
    finally:
        await llm.close()


@pytest.mark.asyncio
async def test_generate_with_tools_cancellation():
    settings = Settings(sarvam_api_key="mock", sarvam_llm_model="test-model")
    llm = SarvamLLMAdapter(settings)
    mock_search = AsyncMock()

    # Make search slow
    async def slow_search(query):
        await asyncio.sleep(0.5)
        return "result"

    mock_search.search.side_effect = slow_search

    mock_step1_resp = MagicMock()
    mock_step1_resp.status_code = 200
    mock_step1_resp.json.return_value = {
        "choices": [
            {
                "message": {
                    "role": "assistant",
                    "tool_calls": [
                        {
                            "id": "call_123",
                            "type": "function",
                            "function": {
                                "name": "web_search",
                                "arguments": '{"query": "cancel test"}',
                            },
                        }
                    ],
                }
            }
        ]
    }

    try:
        with patch.object(llm._client, "post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_step1_resp
            cancel_event = asyncio.Event()

            async def cancel_soon():
                await asyncio.sleep(0.05)
                cancel_event.set()

            asyncio.create_task(cancel_soon())

            text, used_search = await llm.generate_with_tools(
                [{"role": "user", "content": "cancel me"}],
                mock_search,
                cancel_event,
            )

            assert text == ""
            assert used_search is True
    finally:
        await llm.close()
