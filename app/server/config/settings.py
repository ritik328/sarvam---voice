from __future__ import annotations

import os
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All configuration values, loaded from environment / .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Sarvam
    sarvam_api_key: str = ""
    sarvam_api_base: str = "https://api.sarvam.ai"

    # Web Search (Tavily)
    tavily_api_key: str = ""
    search_interim_cue: str = "Let me check that for you."

    # STT
    sarvam_stt_model: str = "saaras:v3-realtime"
    sarvam_stt_language: str = "en-IN"
    stt_stream_type: str = "fast"
    stt_vad_threshold: float = 0.3
    stt_silence_duration_ms: int = 500
    stt_min_speech_duration_ms: int = 250

    # LLM
    sarvam_llm_model: str = "sarvam-105b-conversations"
    llm_max_tokens: int = 100
    llm_temperature: float = 0.7

    # TTS
    sarvam_tts_model: str = "bulbul:v3"
    sarvam_tts_language: str = "en-IN"
    sarvam_tts_speaker: str = "shubh"
    sarvam_tts_pace: float = 1.0
    sarvam_tts_temperature: float = 0.6
    sarvam_tts_sample_rate: int = 24000
    tts_max_chunk_chars: int = 450

    # Warm-up
    warmup_enabled: bool = True

    # Server
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    log_level: str = "info"
    environment: str = "development"


def get_settings() -> Settings:
    return Settings()
