# API Reference

## HTTP Endpoints

### POST /api/session
Create a new voice session.

**Response:**
```json
{
  "session_id": "abc123...",
  "config": {
    "stt_model": "saaras:v3-realtime",
    "llm_model": "sarvam-105b-conversations",
    "tts_model": "bulbul:v3",
    "tts_language": "en-IN",
    "tts_speaker": "shubh"
  }
}
```

### GET /api/health
```json
{"status": "ok", "uptime_s": 42.1}
```

### GET /api/ready
```json
{"status": "ready", "uptime_s": 42.1}
```

---

## WebSocket Protocol

### Connection
`WS /api/realtime/{session_id}`

### Browser → Backend Messages

| Event | Payload | Description |
|---|---|---|
| `session.start` | — | Initialize session, open STT connection |
| `audio.chunk` | `{data: "<base64 PCM>"}` | Send 16kHz mono PCM audio frame |
| `user.interrupt` | — | Cancel current assistant response |
| `session.stop` | — | Close session cleanly |

### Backend → Browser Messages

| Event | Key Fields | Description |
|---|---|---|
| `session.ready` | `session_id`, `turn_id` | STT connected, ready to listen |
| `connection.status` | `status` | `connected`, `speech_detected`, `speech_ended` |
| `transcript.partial` | `text`, `turn_id` | Interim STT result |
| `transcript.final` | `text`, `turn_id` | Final STT result for a turn |
| `assistant.text.partial` | `text`, `response_id` | Streaming LLM delta |
| `assistant.text.final` | `text`, `chunks_sent` | Full assistant text |
| `assistant.speaking.start` | `response_id` | First TTS chunk about to play |
| `assistant.audio.chunk` | `audio` (base64 WAV), `text` | Audio for one text chunk |
| `assistant.speaking.stop` | — | All audio sent |
| `assistant.interrupted` | `turn_id` | Response cancelled by interrupt |
| `error` | `code`, `message`, `fatal` | Error event |

---

## Sarvam API Contracts

### STT WebSocket
- Endpoint: `wss://api.sarvam.ai/speech-to-text-realtime/ws`
- Auth: `api-subscription-key` query param
- Audio format: `encoding=linear16&sample_rate=16000`
- Client sends: `{"event": "audio_input", "audio": "<base64>"}`
- Server events: `session.begin`, `vad.speech_start`, `transcript.partial`, `transcript.final`, `vad.speech_end`, `session.end`, `error`

### LLM REST
- Endpoint: `POST https://api.sarvam.ai/v1/chat/completions`
- Auth: `api-subscription-key` header
- Model: `sarvam-105b-conversations`
- Format: OpenAI-compatible streaming SSE

### TTS REST
- Endpoint: `POST https://api.sarvam.ai/text-to-speech`
- Auth: `api-subscription-key` header
- Model: `bulbul:v3`
- **Do NOT include**: `pitch`, `loudness`
- Response: `{"audios": ["<base64 WAV>"]}`
