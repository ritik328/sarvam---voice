from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.server.api.health import router as health_router
from app.server.api.session import router as session_router
from app.server.realtime.gateway import router as gateway_router
from app.server.config.settings import get_settings

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    settings = get_settings()

    logging.basicConfig(
        level=settings.log_level.upper(),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    app = FastAPI(
        title="Sarvam Voice Assistant API",
        description="Realtime voice-to-voice assistant using Sarvam AI (STT + LLM + TTS)",
        version="0.1.0",
    )

    # CORS: allow frontend origin
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:3001",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Routers
    app.include_router(health_router)
    app.include_router(session_router)
    app.include_router(gateway_router)

    @app.on_event("startup")
    async def startup() -> None:
        logger.info(
            "Sarvam Voice Assistant starting — env=%s model=%s",
            settings.environment,
            settings.sarvam_llm_model,
        )
        if not settings.sarvam_api_key:
            logger.warning("SARVAM_API_KEY is not set — Sarvam API calls will fail!")

    @app.on_event("shutdown")
    async def shutdown() -> None:
        logger.info("Sarvam Voice Assistant shutting down")

    return app


app = create_app()
