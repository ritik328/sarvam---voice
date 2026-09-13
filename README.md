# Sarvam Voice Assistant

A browser-based, realtime voice-to-voice assistant powered by Sarvam AI's `saaras:v3-realtime` STT, `sarvam-105b-conversations` LLM, and `bulbul:v3` TTS.

## Quick Start

### 1. Clone and set up environment

```bash
cp .env.example .env
# Edit .env and set SARVAM_API_KEY=your_key_here
```

### 2. Start the backend

```bash
# Install Python deps (first time)
pip install -r app/server/requirements.txt

# Run the server
uvicorn app.server.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Start the frontend

```bash
cd app/web
npm install
npm run dev
```

### 4. Open the app

Open `http://localhost:3000` in Chrome.

Click the microphone button → speak → hear the response.

---

## Architecture

```
Browser (Next.js + TypeScript)
  │
  │  WebSocket (audio.chunk, session.start, user.interrupt)
  │  ◄── transcript.partial, assistant.audio.chunk, ...
  │
FastAPI Backend (Python)
  ├── POST /api/session   → create session
  ├── GET  /api/health    → health check
  └── WS   /api/realtime/{session_id}
        │
        ├──► saaras:v3-realtime (STT WebSocket)
        ├──► sarvam-105b-conversations (LLM HTTP/SSE)
        └──► bulbul:v3 (TTS REST)
```

## Environment Variables

See [.env.example](.env.example) for the full list.

## Project Structure

```
app/
  server/          FastAPI backend
    main.py        App factory
    config/        Pydantic settings
    api/           HTTP endpoints (health, session)
    realtime/      WebSocket gateway
    sarvam/        STT / LLM / TTS adapters
    services/      Text chunker
    sessions/      In-memory session store
  web/             Next.js frontend
    app/           Next.js App Router
    components/    React components
    audio/         AudioCapture + AudioPlayer
    hooks/         useVoiceSession, useLatencyMetrics
docs/              Project documentation
tests/             Unit + integration tests
```

## Running Tests

```bash
pip install pytest pytest-asyncio
python -m pytest tests/unit/ -v
```

## Key Design Decisions

- **No database** — session state is in-memory for the MVP
- **API key stays on backend** — never exposed to browser JS
- **Walking-skeleton first** — Phase 1A proves the full pipeline with push-to-talk REST, then Phase 1B adds realtime streaming
- **Cancellation** — every response has a `cancel_event`; interrupt stops LLM + TTS immediately
- **Chunked TTS** — LLM text is split at sentence boundaries (≤450 chars) so audio starts before the full response is complete
