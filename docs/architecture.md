# Architecture

## System Overview

```
Browser (Next.js / TypeScript)
       │
       │  WebSocket /api/realtime/{session_id}
       │  audio.chunk, session.start, user.interrupt →
       │  ← transcript.partial, transcript.final
       │  ← assistant.text.partial, assistant.audio.chunk
       │  ← assistant.speaking.start/stop, assistant.interrupted
       │  ← error, connection.status
       │
FastAPI Backend (Python / uvicorn)
       │
       ├── POST /api/session     → create session
       ├── GET  /api/health      → health check
       ├── GET  /api/ready       → readiness
       └── WS   /api/realtime/{session_id}
             │
             ├──►  wss://api.sarvam.ai/speech-to-text-realtime/ws
             │     saaras:v3-realtime
             │     ← session.begin, vad.speech_start, transcript.partial,
             │       vad.speech_end, transcript.final, session.end, error
             │
             ├──►  POST https://api.sarvam.ai/v1/chat/completions
             │     sarvam-105b-conversations  (streaming SSE)
             │     ← delta text chunks
             │
             └──►  POST https://api.sarvam.ai/text-to-speech
                   bulbul:v3  (REST, Phase 1A)
                   ← WAV audio bytes per chunk
```

## Data Flow

### Audio Input Path
1. `getUserMedia` with `echoCancellation: true, noiseSuppression: true, autoGainControl: true`
2. `AudioWorkletProcessor` downsamples to 16 kHz, emits 1600-sample Int16 frames (~100ms)
3. Frames base64-encoded → `audio.chunk` WebSocket message → backend
4. Backend proxies raw PCM to `saaras:v3-realtime`

### STT Path
1. Saaras emits: `vad.speech_start` → `transcript.partial` (multiple) → `vad.speech_end` → `transcript.final`
2. Backend relays partials to browser for real-time display
3. `transcript.final` triggers LLM pipeline

### LLM Path
1. `sarvam-105b-conversations` receives conversation history + voice system prompt
2. Streams SSE delta text
3. Backend relays text deltas to browser as `assistant.text.partial`

### TTS Path
1. `TextChunker` splits LLM stream at sentence boundaries (target ≤ 450 chars)
2. Each chunk synthesized via `bulbul:v3` REST API
3. WAV bytes base64-encoded → `assistant.audio.chunk` → browser `AudioPlayer`
4. `AudioPlayer` decodes and queues for gapless playback

## Adapter Contracts

### SarvamSTTAdapter
```python
await adapter.connect()
await adapter.send_audio(pcm_bytes: bytes)
async for event in adapter.receive_events(): ...  # yields STTEvent
await adapter.close()
```

### SarvamLLMAdapter
```python
async for delta in adapter.generate_stream(messages, cancel_event): ...
await adapter.close()
```

### SarvamTTSAdapter
```python
audio_bytes = await adapter.synthesize(text: str)
await adapter.close()
```

## Session State Machine

```
IDLE → CONNECTING → LISTENING → USER_TURN_ACTIVE → USER_TURN_FINALIZING
                                                           ↓
                                               THINKING → ASSISTANT_SPEAKING
                                                           ↓
                                               IDLE  ←────┘
                                               ↑
                                           INTERRUPTED (on user.interrupt)
```

## Key Design Decisions

1. **Walking skeleton first** — Phase 1A uses REST endpoints for all Sarvam services to reduce debugging scope before adding WebSocket streaming
2. **turn_id / response_id** — Every turn gets unique IDs; stale audio is filtered by response_id
3. **cancel_event** — asyncio.Event signals LLM/TTS pipeline to abort on interrupt
4. **No database** — Session state is in-memory; persists for session lifetime only
5. **API key stays on backend** — Browser only talks to our backend; Sarvam key never in JS
6. **No pitch/loudness** — bulbul:v3 doesn't support them; omitted from all TTS calls
7. **stream_type=fast** — Lower partial-transcript latency for conversational use
