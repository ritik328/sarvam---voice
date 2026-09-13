from __future__ import annotations

import asyncio
import json
import logging
from typing import AsyncIterator

import httpx

from datetime import datetime

from app.server.config.settings import Settings

logger = logging.getLogger(__name__)


VOICE_SYSTEM_PROMPT = """\
You are a realtime voice assistant powered by Sarvam AI.
Speak naturally, concisely, and directly.

Rules:
- Answer the user's latest query immediately without hesitation
- Keep simple answers to 1 to 2 clear sentences
- Expand only when the user asks for more detail
- Avoid markdown formatting, asterisks, bullet points, emojis, or tables
- Use natural spoken language suitable for text-to-speech audio
- If the user had previous short hesitations or greetings in the conversation history, address the latest question directly
"""


def get_voice_system_prompt() -> str:
    """Returns the voice system prompt. Dynamic context is appended at the end to preserve KV cache prefix."""
    now_str = datetime.now().strftime("%A, %B %d, %Y at %I:%M %p")
    return f"{VOICE_SYSTEM_PROMPT}\nCurrent local time: {now_str}."


SEARCH_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": (
                "Search the web for current information, news, recent events, "
                "latest AI models, products, releases, prices, dates, or anything that requires up-to-date data. "
                "Use this whenever the user asks about recent releases, latest news, current facts, or time-sensitive events."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query to look up",
                    }
                },
                "required": ["query"],
            },
        },
    }
]


class SarvamLLMAdapter:
    """
    Streams chat completions from sarvam-105b-conversations,
    with support for web search tool calling.

    Usage:
        adapter = SarvamLLMAdapter(settings)
        async for text_delta in adapter.generate_stream(messages, cancel_event):
            ...
    """

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client = httpx.AsyncClient(
            base_url=settings.sarvam_api_base,
            headers={"api-subscription-key": settings.sarvam_api_key},
            http2=True,
            timeout=httpx.Timeout(connect=5.0, read=60.0, write=10.0, pool=5.0),
        )

    async def generate_stream(
        self,
        messages: list[dict[str, str]],
        cancel_event: asyncio.Event,
    ) -> AsyncIterator[str]:
        """Yield text deltas from the streaming LLM response."""
        full_messages = [
            {"role": "system", "content": get_voice_system_prompt()},
            *messages,
        ]
        payload = {
            "model": self._settings.sarvam_llm_model,
            "messages": full_messages,
            "stream": True,
            "max_tokens": self._settings.llm_max_tokens,
            "temperature": self._settings.llm_temperature,
        }
        logger.info("LLM: starting stream, %d messages", len(full_messages))

        try:
            async with self._client.stream(
                "POST",
                "/v1/chat/completions",
                json=payload,
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if cancel_event.is_set():
                        logger.info("LLM: cancelled by cancel_event")
                        break
                    if not line or not line.startswith("data:"):
                        continue
                    data_str = line[5:].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        data = json.loads(data_str)
                        delta = data["choices"][0]["delta"].get("content", "")
                        if delta:
                            yield delta
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue

        except httpx.HTTPStatusError as e:
            logger.error("LLM HTTP error %s: %s", e.response.status_code, e.response.text)
            yield "I'm sorry, I encountered an error. Please try again."
        except Exception as e:
            logger.error("LLM unexpected error: %s", e)

    async def generate_with_tools(
        self,
        messages: list[dict],
        search_adapter,
        cancel_event: asyncio.Event,
        on_tool_call_start=None,
        on_delta=None,
    ) -> tuple[str, bool]:
        """
        Generate a response with tool-calling support.
        Returns (final_text, used_search).

        Flow:
        1. Call LLM with tools enabled (max_tokens=100).
        2. If tool call requested:
           - Concurrently trigger interim cue and search_adapter.search(query).
           - Support immediate cancellation on cancel_event.
        3. Stream Step 3 response with tool results and emit deltas via on_delta.
        4. If no tool call, return direct text immediately.
        """
        request_messages = [
            {"role": "system", "content": get_voice_system_prompt()},
            *messages,
        ]

        try:
            # Step 1: Initial call with tools
            response = await self._client.post(
                "/v1/chat/completions",
                json={
                    "model": self._settings.sarvam_llm_model,
                    "messages": request_messages,
                    "tools": SEARCH_TOOLS,
                    "tool_choice": "auto",
                    "temperature": self._settings.llm_temperature,
                    "max_tokens": 100,  # 100 tokens prevents mid-parse truncation
                    "stream": False,
                },
            )
            response.raise_for_status()
            data = response.json()
            choice = data["choices"][0]
            message = choice["message"]

            # Step 2: Check if LLM wants to call a tool
            tool_calls = message.get("tool_calls", [])
            if tool_calls:
                used_search = True
                logger.info("LLM: tool call requested: %s", tool_calls)

                # Extract query from first tool call
                tc = tool_calls[0]
                raw_args = tc["function"]["arguments"]
                fn_args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                query = fn_args.get("query", "")

                # Concurrent interim cue + search execution with cancellation support
                interim_task = asyncio.create_task(on_tool_call_start()) if on_tool_call_start else None
                search_task = asyncio.create_task(search_adapter.search(query))

                # Wait for search while proactively checking cancel_event
                while not search_task.done():
                    if cancel_event.is_set():
                        search_task.cancel()
                        if interim_task and not interim_task.done():
                            interim_task.cancel()
                        return ("", used_search)
                    await asyncio.sleep(0.02)

                if cancel_event.is_set():
                    if interim_task and not interim_task.done():
                        interim_task.cancel()
                    return ("", used_search)

                try:
                    search_result = search_task.result()
                except Exception as e:
                    logger.error("Search task failed: %s", e)
                    search_result = "Search failed: unexpected error."

                # Ensure interim cue task is completed or cleanly drained
                if interim_task:
                    try:
                        await interim_task
                    except asyncio.CancelledError:
                        return ("", used_search)
                    except Exception as cue_err:
                        logger.warning("Error in interim cue task: %s", cue_err)

                if cancel_event.is_set():
                    return ("", used_search)

                # Append assistant tool-call and tool-result message to history
                request_messages.append({
                    "role": "assistant",
                    "content": None,
                    "tool_calls": [
                        {
                            "id": tc["id"],
                            "type": "function",
                            "function": {
                                "name": tc["function"]["name"],
                                "arguments": tc["function"]["arguments"],
                            },
                        }
                    ],
                })
                request_messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": search_result,
                })

                # Step 3: Stream the response from LLM
                final_text = ""
                async with self._client.stream(
                    "POST",
                    "/v1/chat/completions",
                    json={
                        "model": self._settings.sarvam_llm_model,
                        "messages": request_messages,
                        "tools": SEARCH_TOOLS,
                        "temperature": self._settings.llm_temperature,
                        "max_tokens": self._settings.llm_max_tokens,
                        "stream": True,
                    },
                ) as stream_resp:
                    stream_resp.raise_for_status()
                    async for line in stream_resp.aiter_lines():
                        if cancel_event.is_set():
                            break
                        if not line or not line.startswith("data:"):
                            continue
                        data_str = line[5:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            sdata = json.loads(data_str)
                            delta = sdata["choices"][0]["delta"].get("content", "")
                            if delta:
                                final_text += delta
                                if on_delta:
                                    await on_delta(delta)
                        except (json.JSONDecodeError, KeyError, IndexError):
                            continue

                return (final_text.strip(), used_search)

            else:
                # No tool call — direct text response
                final_text = message.get("content", "").strip()
                return (final_text, False)

        except Exception as e:
            logger.error("LLM tool-call error: %s", e)
            return ("", False)

    async def close(self) -> None:
        await self._client.aclose()
