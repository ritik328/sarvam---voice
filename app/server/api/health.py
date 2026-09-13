from __future__ import annotations

import time

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

_start_time = time.time()


class HealthResponse(BaseModel):
    status: str
    uptime_s: float


@router.get("/api/health", response_model=HealthResponse, tags=["Health"])
async def health() -> HealthResponse:
    """Process health check."""
    return HealthResponse(status="ok", uptime_s=round(time.time() - _start_time, 2))


@router.get("/api/ready", response_model=HealthResponse, tags=["Health"])
async def ready() -> HealthResponse:
    """Readiness check."""
    return HealthResponse(status="ready", uptime_s=round(time.time() - _start_time, 2))
