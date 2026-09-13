from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class SessionPhase(str, Enum):
    IDLE = "IDLE"
    LISTENING = "LISTENING"
    USER_TURN_ACTIVE = "USER_TURN_ACTIVE"
    USER_TURN_FINALIZING = "USER_TURN_FINALIZING"
    THINKING = "THINKING"
    ASSISTANT_SPEAKING = "ASSISTANT_SPEAKING"
    INTERRUPTED = "INTERRUPTED"
    PAUSED = "PAUSED"
    ERROR = "ERROR"


@dataclass
class SessionState:
    session_id: str
    phase: SessionPhase = SessionPhase.IDLE
    turn_id: str = ""
    response_id: str = ""
    # Conversation history for LLM context
    messages: list[dict[str, str]] = field(default_factory=list)
    # Active cancel event for the current LLM/TTS pipeline
    cancel_event: asyncio.Event = field(default_factory=asyncio.Event)

    def new_turn(self) -> str:
        self.turn_id = uuid.uuid4().hex
        self.response_id = ""
        self.cancel_event = asyncio.Event()
        return self.turn_id

    def new_response(self) -> str:
        self.response_id = uuid.uuid4().hex
        return self.response_id

    def cancel(self) -> None:
        self.cancel_event.set()


class SessionStore:
    """Thread-safe in-memory session store."""

    def __init__(self) -> None:
        self._sessions: dict[str, SessionState] = {}
        self._lock = asyncio.Lock()

    async def create(self, session_id: str | None = None) -> SessionState:
        async with self._lock:
            sid = session_id or uuid.uuid4().hex
            state = SessionState(session_id=sid)
            self._sessions[sid] = state
            return state

    async def get(self, session_id: str) -> SessionState | None:
        return self._sessions.get(session_id)

    async def delete(self, session_id: str) -> None:
        async with self._lock:
            self._sessions.pop(session_id, None)

    def count(self) -> int:
        return len(self._sessions)
