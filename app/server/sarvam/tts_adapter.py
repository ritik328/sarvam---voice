from __future__ import annotations

import asyncio
import base64
import json
import logging

import httpx

from app.server.config.settings import Settings

logger = logging.getLogger(__name__)


class SarvamTTSAdapter:
    """
    Text-to-speech via Bulbul v3.

    Phase 1A: Uses REST API (POST /text-to-speech).
    Phase 1B: Will upgrade to persistent WebSocket.

    Returns raw audio bytes (wav/linear16 at 24kHz).
    """

    REST_PATH = "/text-to-speech"

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client = httpx.AsyncClient(
            base_url=settings.sarvam_api_base,
            headers={"api-subscription-key": settings.sarvam_api_key},
            http2=True,
            timeout=httpx.Timeout(connect=5.0, read=30.0, write=10.0, pool=5.0),
        )

    async def synthesize(self, text: str) -> bytes:
        """
        Synthesize text to audio. Returns raw WAV bytes.
        Does NOT send pitch or loudness (not supported by bulbul:v3).
        """
        if not text.strip():
            return b""

        # Truncate to safe limit
        safe_text = text[:2500]

        payload = {
            "model": self._settings.sarvam_tts_model,
            "inputs": [safe_text],
            "target_language_code": self._settings.sarvam_tts_language,
            "speaker": self._settings.sarvam_tts_speaker,
            "pace": self._settings.sarvam_tts_pace,
            "temperature": self._settings.sarvam_tts_temperature,
            "sample_rate": self._settings.sarvam_tts_sample_rate,
            "enable_preprocessing": True,
        }
        logger.debug("TTS: synthesizing %d chars", len(safe_text))

        try:
            response = await self._client.post(self.REST_PATH, json=payload)
            response.raise_for_status()
            data = response.json()
            # Response: {"audios": ["<base64 wav>"]}
            audios = data.get("audios", [])
            if not audios:
                logger.warning("TTS: empty audios in response")
                return b""
            audio_b64 = audios[0]
            return base64.b64decode(audio_b64)
        except httpx.HTTPStatusError as e:
            logger.error("TTS HTTP error %s: %s", e.response.status_code, e.response.text)
            return b""
        except Exception as e:
            logger.error("TTS unexpected error: %s", e)
            return b""

    async def close(self) -> None:
        await self._client.aclose()
