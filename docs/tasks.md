# Tasks

## Phase 0 — Foundation ✅ COMPLETE
- [x] Project structure created
- [x] FastAPI skeleton with health + session + WS gateway
- [x] Next.js frontend initialized
- [x] .env.example
- [x] Unit tests (15/15 passing)
- [x] Backend imports verified
- [x] Frontend builds clean
- [x] Health endpoint returns 200

## Phase 1A — Walking Skeleton ✅ COMPLETE (code written, needs API key to test E2E)
- [x] AudioCaptureManager (AudioWorklet, 16 kHz PCM, echo cancellation)
- [x] AudioPlayer (gapless queue, TTFAR callback, cancel/flush)
- [x] SarvamSTTAdapter (saaras:v3-realtime WebSocket)
- [x] SarvamLLMAdapter (sarvam-105b-conversations streaming SSE)
- [x] SarvamTTSAdapter (bulbul:v3 REST)
- [x] TextChunker (sentence boundary, ≤450 chars)
- [x] WS gateway (full pipeline, cancellation)
- [x] VoiceAssistant UI (dark glassmorphism, state-driven orb)
- [x] useVoiceSession hook
- [x] useLatencyMetrics hook

## Phase 1B — Realtime Streaming (next)
- [ ] Saaras v3-realtime partial transcripts → browser (gateway already wired)
- [ ] Bulbul v3 WebSocket (replace REST adapter for lower latency)
- [ ] Warm-up connection on session create
- [ ] Measure TTFAR improvement

## Phase 2 — Full State Machine + Barge-In
- [ ] vad.speech_start → gate LLM cancellation
- [ ] Browser-side TTS gate while assistant speaks
- [ ] Full barge-in flow

## Phase 3 — Recovery
- [ ] WebSocket reconnect with session recovery
- [ ] Error categorization with user-visible retry
- [ ] Exponential backoff

## Phase 4 — Benchmarking
- [ ] Latency metrics panel (already partially built)
- [ ] JSON benchmark export
- [ ] 20 short / 20 medium / 10 long / 10 interrupt test set

## Phase 5 — Mobile + Production
- [ ] Chrome Android validation
- [ ] Safari iOS validation
- [ ] Security hardening
- [ ] Rate limiting
- [ ] Log redaction
