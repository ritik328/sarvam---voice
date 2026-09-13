from __future__ import annotations

import asyncio
import base64
import json
import logging
import time
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.server.config.settings import get_settings
from app.server.sarvam.llm_adapter import SarvamLLMAdapter
from app.server.sarvam.search_adapter import WebSearchAdapter
from app.server.sarvam.stt_adapter import SarvamSTTAdapter
from app.server.sarvam.tts_adapter import SarvamTTSAdapter
from app.server.services.chunker import chunk_text, extract_streaming_chunk
from app.server.sessions.store import SessionPhase

logger = logging.getLogger(__name__)

router = APIRouter()


async def _send(ws: WebSocket, event: str, payload: dict) -> None:
    """Send a typed JSON event to the browser."""
    try:
        await ws.send_text(json.dumps({"event": event, **payload}))
    except Exception:
        pass


@router.websocket("/api/realtime/{session_id}")
async def realtime_gateway(ws: WebSocket, session_id: str) -> None:
    """
    Main browser ↔ backend realtime WebSocket.

    Browser → Backend messages:
      {"event": "session.start"}
      {"event": "audio.chunk", "data": "<base64 PCM>"}
      {"event": "session.stop"}
      {"event": "user.interrupt"}

    Backend → Browser messages:
      session.ready, transcript.partial, transcript.final,
      assistant.text.partial, assistant.text.final,
      assistant.audio.chunk, assistant.speaking.start,
      assistant.speaking.stop, assistant.interrupted, error,
      connection.status
    """
    from app.server.sessions import get_store
    store = get_store()

    settings = get_settings()
    await ws.accept()
    logger.info("WS: accepted session=%s", session_id)

    # Get or create session state
    state = await store.get(session_id)
    if state is None:
        state = await store.create(session_id)

    state.phase = SessionPhase.IDLE

    # Instantiate adapters
    stt = SarvamSTTAdapter(settings)
    llm = SarvamLLMAdapter(settings)
    tts = SarvamTTSAdapter(settings)
    search = WebSearchAdapter(settings)

    await _send(ws, "connection.status", {
        "session_id": session_id,
        "status": "connected",
        "ts": time.time(),
    })

    # STT connection (persistent)
    stt_connected = False

    async def ensure_stt_connected() -> bool:
        nonlocal stt_connected
        if stt_connected:
            return True
        try:
            await stt.connect()
            stt_connected = True
            return True
        except Exception as e:
            logger.error("STT connect failed: %s", e)
            await _send(ws, "error", {"code": "STT_CONNECT_FAILED", "message": str(e)})
            return False

    stt_receiver_task: asyncio.Task | None = None
    response_pipeline_task: asyncio.Task | None = None

    async def run_stt_receiver() -> None:
        """Continuously receive STT events and drive the pipeline."""
        nonlocal response_pipeline_task
        async for stt_event in stt.receive_events():
            ev = stt_event.event

            if ev == "transcript.partial":
                state.phase = SessionPhase.USER_TURN_ACTIVE
                await _send(ws, "transcript.partial", {
                    "session_id": session_id,
                    "turn_id": state.turn_id,
                    "text": stt_event.text,
                })

            elif ev == "vad.speech_start":
                if response_pipeline_task and not response_pipeline_task.done():
                    logger.info("Speech started: cancelling active response task")
                    state.cancel()
                    response_pipeline_task.cancel()
                if state.phase in (SessionPhase.IDLE, SessionPhase.ASSISTANT_SPEAKING):
                    state.new_turn()
                    state.phase = SessionPhase.LISTENING
                await _send(ws, "connection.status", {
                    "session_id": session_id,
                    "status": "speech_detected",
                })

            elif ev == "vad.speech_end":
                state.phase = SessionPhase.USER_TURN_FINALIZING
                await _send(ws, "connection.status", {
                    "session_id": session_id,
                    "status": "speech_ended",
                })

            elif ev == "transcript.final":
                final_text = stt_event.text.strip()
                if not final_text:
                    state.phase = SessionPhase.IDLE
                    continue

                # Ignore isolated single-letter hesitation (e.g. "I", "a", "um")
                if len(final_text) <= 1:
                    logger.info("Ignoring single-letter hesitation: %s", final_text)
                    continue

                # Cancel previous response pipeline if still running
                if response_pipeline_task and not response_pipeline_task.done():
                    state.cancel()
                    response_pipeline_task.cancel()

                state.new_turn()
                turn_id = state.turn_id

                await _send(ws, "transcript.final", {
                    "session_id": session_id,
                    "turn_id": turn_id,
                    "text": final_text,
                })

                # Add user message to history
                state.messages.append({"role": "user", "content": final_text})
                # Trim history to last 20 messages (10 turns)
                if len(state.messages) > 20:
                    state.messages = state.messages[-20:]

                # Start response pipeline (non-blocking)
                response_pipeline_task = asyncio.create_task(
                    _run_response_pipeline(
                        ws, state, llm, tts, search, session_id, turn_id, settings
                    )
                )

            elif ev == "error":
                logger.error("STT error %s: %s", stt_event.code, stt_event.message)
                await _send(ws, "error", {
                    "code": stt_event.code or "STT_ERROR",
                    "message": stt_event.message or "STT error",
                    "fatal": stt_event.is_fatal,
                })

    try:
        async for raw in ws.iter_text():
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            event = msg.get("event", "")

            if event == "session.start":
                if not await ensure_stt_connected():
                    continue
                # Kick off the STT event receiver
                if stt_receiver_task is None or stt_receiver_task.done():
                    stt_receiver_task = asyncio.create_task(run_stt_receiver())
                state.phase = SessionPhase.LISTENING
                state.new_turn()
                await _send(ws, "session.ready", {
                    "session_id": session_id,
                    "turn_id": state.turn_id,
                })

            elif event == "audio.chunk":
                if not stt_connected:
                    continue
                data_b64 = msg.get("data", "")
                if data_b64:
                    pcm_bytes = base64.b64decode(data_b64)
                    await stt.send_audio(pcm_bytes)

            elif event == "user.interrupt":
                logger.info("WS: user interrupt session=%s", session_id)
                state.cancel()
                if response_pipeline_task and not response_pipeline_task.done():
                    response_pipeline_task.cancel()
                state.phase = SessionPhase.INTERRUPTED
                await _send(ws, "assistant.interrupted", {
                    "session_id": session_id,
                    "turn_id": state.turn_id,
                })
                # Reset for next turn
                state.new_turn()
                state.phase = SessionPhase.LISTENING

            elif event == "session.stop":
                logger.info("WS: session stop session=%s", session_id)
                if response_pipeline_task and not response_pipeline_task.done():
                    response_pipeline_task.cancel()
                break

    except WebSocketDisconnect:
        logger.info("WS: client disconnected session=%s", session_id)
    except Exception as e:
        logger.error("WS: unexpected error session=%s: %s", session_id, e)
    finally:
        if response_pipeline_task and not response_pipeline_task.done():
            response_pipeline_task.cancel()
        if stt_receiver_task:
            stt_receiver_task.cancel()
        await stt.close()
        await llm.close()
        await tts.close()
        await search.close()
        await store.delete(session_id)
        logger.info("WS: cleanup complete session=%s", session_id)


async def _run_response_pipeline(
    ws: WebSocket,
    state,
    llm: SarvamLLMAdapter,
    tts: SarvamTTSAdapter,
    search: WebSearchAdapter,
    session_id: str,
    turn_id: str,
    settings,
) -> None:
    """
    LLM (with tools) → Streaming TextChunker → TTS → browser audio.
    Respects state.cancel_event for interruption.
    """
    response_id = state.new_response()
    state.phase = SessionPhase.THINKING
    cancel_event = state.cancel_event
    max_chunk = settings.tts_max_chunk_chars

    logger.info(
        "Pipeline: start session=%s turn=%s response=%s",
        session_id, turn_id, response_id,
    )

    speaking_started = False
    chunks_sent = 0
    stream_buffer = ""

    async def handle_tool_call_start():
        nonlocal speaking_started, chunks_sent
        if cancel_event.is_set():
            return
        cue_text = settings.search_interim_cue
        await _send(ws, "assistant.text.partial", {
            "session_id": session_id,
            "turn_id": turn_id,
            "response_id": response_id,
            "text": cue_text + " ",
        })
        if not speaking_started:
            state.phase = SessionPhase.ASSISTANT_SPEAKING
            await _send(ws, "assistant.speaking.start", {
                "session_id": session_id,
                "turn_id": turn_id,
                "response_id": response_id,
            })
            speaking_started = True

        await _synthesize_and_send(
            ws, tts, cue_text, session_id,
            turn_id, response_id, cancel_event,
        )
        chunks_sent += 1

    async def handle_delta(delta: str):
        nonlocal stream_buffer, speaking_started, chunks_sent
        if cancel_event.is_set():
            return
        stream_buffer += delta
        chunk, remaining = extract_streaming_chunk(
            stream_buffer,
            is_first=(chunks_sent == 0),
            min_first_chars=15,
            max_chars=max_chunk,
        )
        if chunk:
            stream_buffer = remaining
            await _send(ws, "assistant.text.partial", {
                "session_id": session_id,
                "turn_id": turn_id,
                "response_id": response_id,
                "text": chunk + " ",
            })
            if not speaking_started:
                state.phase = SessionPhase.ASSISTANT_SPEAKING
                await _send(ws, "assistant.speaking.start", {
                    "session_id": session_id,
                    "turn_id": turn_id,
                    "response_id": response_id,
                })
                speaking_started = True

            await _synthesize_and_send(
                ws, tts, chunk, session_id,
                turn_id, response_id, cancel_event,
            )
            chunks_sent += 1

    try:
        full_assistant_text, used_search = await llm.generate_with_tools(
            state.messages,
            search,
            cancel_event,
            on_tool_call_start=handle_tool_call_start,
            on_delta=handle_delta,
        )

        if cancel_event.is_set():
            return

        if not full_assistant_text:
            full_assistant_text = "I couldn't find an answer for that."

        # If search was used, flush any remaining text in stream_buffer
        if used_search:
            if stream_buffer.strip() and not cancel_event.is_set():
                chunk_str = stream_buffer.strip()
                await _send(ws, "assistant.text.partial", {
                    "session_id": session_id,
                    "turn_id": turn_id,
                    "response_id": response_id,
                    "text": chunk_str + " ",
                })
                if not speaking_started:
                    state.phase = SessionPhase.ASSISTANT_SPEAKING
                    await _send(ws, "assistant.speaking.start", {
                        "session_id": session_id,
                        "turn_id": turn_id,
                        "response_id": response_id,
                    })
                    speaking_started = True

                await _synthesize_and_send(
                    ws, tts, chunk_str, session_id,
                    turn_id, response_id, cancel_event,
                )
                chunks_sent += 1
        else:
            # Direct answer without search — chunk and synthesize
            pending_chunks = chunk_text(full_assistant_text, max_chunk)
            for chunk_text_str in pending_chunks:
                if cancel_event.is_set():
                    break

                await _send(ws, "assistant.text.partial", {
                    "session_id": session_id,
                    "turn_id": turn_id,
                    "response_id": response_id,
                    "text": chunk_text_str + " ",
                })

                if not speaking_started:
                    state.phase = SessionPhase.ASSISTANT_SPEAKING
                    await _send(ws, "assistant.speaking.start", {
                        "session_id": session_id,
                        "turn_id": turn_id,
                        "response_id": response_id,
                    })
                    speaking_started = True

                await _synthesize_and_send(
                    ws, tts, chunk_text_str, session_id,
                    turn_id, response_id, cancel_event,
                )
                chunks_sent += 1

        # --- Finalize ---
        if full_assistant_text:
            state.messages.append({"role": "assistant", "content": full_assistant_text})
            if len(state.messages) > 20:
                state.messages = state.messages[-20:]

        await _send(ws, "assistant.text.final", {
            "session_id": session_id,
            "turn_id": turn_id,
            "response_id": response_id,
            "text": full_assistant_text,
            "chunks_sent": chunks_sent,
            "used_search": used_search,
        })

        # Refinement 4: speaking.stop is sent strictly ONCE at the end of the entire turn!
        await _send(ws, "assistant.speaking.stop", {
            "session_id": session_id,
            "turn_id": turn_id,
            "response_id": response_id,
        })
        state.phase = SessionPhase.IDLE

    except Exception as e:
        logger.error("Pipeline error: %s", e)
        await _send(ws, "error", {
            "code": "PIPELINE_ERROR",
            "message": str(e),
            "session_id": session_id,
        })
        state.phase = SessionPhase.IDLE


async def _synthesize_and_send(
    ws: WebSocket,
    tts: SarvamTTSAdapter,
    text: str,
    session_id: str,
    turn_id: str,
    response_id: str,
    cancel_event: asyncio.Event,
) -> None:
    """Synthesize one chunk and send audio bytes to browser."""
    if cancel_event.is_set() or not text.strip():
        return

    audio_bytes = await tts.synthesize(text)
    if not audio_bytes or cancel_event.is_set():
        return

    audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
    await _send(ws, "assistant.audio.chunk", {
        "session_id": session_id,
        "turn_id": turn_id,
        "response_id": response_id,
        "audio": audio_b64,
        "text": text,
    })
