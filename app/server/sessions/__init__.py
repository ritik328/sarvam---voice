from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any

from app.server.sessions.store import SessionStore


_store = SessionStore()


def get_store() -> SessionStore:
    return _store
