from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.server.config.settings import Settings, get_settings
from app.server.sessions.store import SessionStore

router = APIRouter()

# Shared store — imported lazily to avoid circular imports
_store: SessionStore | None = None


def _get_store() -> SessionStore:
    global _store
    if _store is None:
        from app.server.sessions import get_store
        _store = get_store()
    return _store


class SessionCreateResponse(BaseModel):
    session_id: str
    config: dict


@router.post("/api/session", response_model=SessionCreateResponse, tags=["Session"])
async def create_session(
    settings: Settings = Depends(get_settings),
) -> SessionCreateResponse:
    """Create a new voice session. Returns session_id and runtime config."""
    store = _get_store()
    session_id = uuid.uuid4().hex
    await store.create(session_id)

    return SessionCreateResponse(
        session_id=session_id,
        config={
            "stt_model": settings.sarvam_stt_model,
            "llm_model": settings.sarvam_llm_model,
            "tts_model": settings.sarvam_tts_model,
            "tts_language": settings.sarvam_tts_language,
            "tts_speaker": settings.sarvam_tts_speaker,
        },
    )
