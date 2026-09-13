from __future__ import annotations

import asyncio
import base64
import json
import logging
from dataclasses import dataclass
from typing import AsyncIterator
from urllib.parse import urlencode

import websockets
from websockets.exceptions import ConnectionClosedError, ConnectionClosedOK

from app.server.config.settings import Settings

logger = logging.getLogger(__name__)


@dataclass
class STTEvent:
    event: str  # "transcript.partial" | "transcript.final" | "vad.speech_start" | "vad.speech_end" | "session.begin" | "session.end" | "error"
    text: str = ""
    is_final: bool = False
    code: str | None = None
    message: str | None = None
    is_fatal: bool = False


class SarvamSTTAdapter:
    """
    Manages a persistent WebSocket connection to Saaras v3-realtime.

    Usage:
        adapter = SarvamSTTAdapter(settings)
        await adapter.connect()
        # send audio
        await adapter.send_audio(base64_bytes)
        # receive events
        async for event in adapter.receive_events():
            ...
        await adapter.close()
    """

    WS_BASE = "wss://api.sarvam.ai/speech-to-text-realtime/ws"

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._ws: websockets.WebSocketClientProtocol | None = None
        self._closed = False

    def _build_url(self) -> str:
        s = self._settings
        params = {
            "model": s.sarvam_stt_model,
            "language_code": s.sarvam_stt_language,
            "stream_type": s.stt_stream_type,
            "mode": "transcribe",
            "endpointing": "vad",
            "encoding": "linear16",
            "sample_rate": 16000,
            "threshold": s.stt_vad_threshold,
            "silence_duration_ms": s.stt_silence_duration_ms,
            "min_speech_duration_ms": s.stt_min_speech_duration_ms,
        }
        return f"{self.WS_BASE}?{urlencode(params)}"

    async def connect(self) -> None:
        url = self._build_url()
        headers = {"api-subscription-key": self._settings.sarvam_api_key}
        logger.info("STT: connecting to %s", url)
        self._ws = await websockets.connect(
            url,
            additional_headers=headers,
            ping_interval=20,
            ping_timeout=10,
        )
        self._closed = False
        logger.info("STT: connected")

    async def send_audio(self, pcm_bytes: bytes) -> None:
        """Send raw Linear16 PCM bytes as base64-encoded audio_input event."""
        if not self._ws or self._closed:
            return
        b64 = base64.b64encode(pcm_bytes).decode("utf-8")
        msg = json.dumps({"event": "audio_input", "audio": b64})
        try:
            await self._ws.send(msg)
        except (ConnectionClosedError, ConnectionClosedOK):
            self._closed = True

    async def send_end(self) -> None:
        """Signal end of audio stream."""
        if not self._ws or self._closed:
            return
        try:
            await self._ws.send(json.dumps({"event": "end"}))
        except Exception:
            pass

    async def receive_events(self) -> AsyncIterator[STTEvent]:
        """Yield parsed STT events from the WebSocket."""
        if not self._ws:
            return
        try:
            async for raw in self._ws:
                try:
                    data = json.loads(raw)
                except json.JSONDecodeError:
                    logger.warning("STT: non-JSON message: %r", raw)
                    continue

                event_type = data.get("event", "")
                if event_type == "transcript.partial":
                    yield STTEvent(event=event_type, text=data.get("text", ""))
                elif event_type == "transcript.final":
                    yield STTEvent(
                        event=event_type,
                        text=data.get("text", ""),
                        is_final=True,
                    )
                elif event_type in ("vad.speech_start", "vad.speech_end"):
                    yield STTEvent(event=event_type)
                elif event_type == "session.begin":
                    yield STTEvent(event=event_type)
                elif event_type == "session.end":
                    yield STTEvent(event=event_type)
                    break
                elif event_type == "error":
                    yield STTEvent(
                        event="error",
                        code=str(data.get("code", "")),
                        message=data.get("message", "Unknown STT error"),
                        is_fatal=data.get("is_fatal", False),
                    )
                    if data.get("is_fatal", False):
                        break
                else:
                    logger.debug("STT: unknown event: %s", event_type)

        except (ConnectionClosedError, ConnectionClosedOK):
            logger.info("STT: connection closed")
            self._closed = True

    async def close(self) -> None:
        self._closed = True
        if self._ws:
            try:
                await self._ws.close()
            except Exception:
                pass
            self._ws = None
