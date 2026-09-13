"""
test_sarvam_models.py
Quick smoke test for all three Sarvam models used in this project:
  1. sarvam-105b-conversations (LLM)
  2. bulbul:v3 (TTS)
  3. saaras:v3-realtime (STT — sends synthetic 1-second sine-wave PCM)
"""
import asyncio
import base64
import json
import math
import os
import struct
import time
import wave
import io
from urllib.parse import urlencode

import httpx
import websockets
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.environ["SARVAM_API_KEY"]
BASE    = "https://api.sarvam.ai"
HEADERS = {"api-subscription-key": API_KEY}

import sys
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

RESET  = "\033[0m"
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
BOLD   = "\033[1m"

def ok(msg):  print(f"  {GREEN}[OK] {msg}{RESET}")
def fail(msg):print(f"  {RED}[FAIL] {msg}{RESET}")
def info(msg):print(f"  {YELLOW}-> {msg}{RESET}")


# ─────────────────────────────────────────────────────────────────────────────
# 1. LLM — sarvam-105b-conversations
# ─────────────────────────────────────────────────────────────────────────────
async def test_llm():
    print(f"\n{BOLD}[1/3] LLM — sarvam-105b-conversations{RESET}")
    payload = {
        "model": "sarvam-105b-conversations",
        "messages": [
            {"role": "system", "content": "You are a concise voice assistant. Reply in 1 sentence."},
            {"role": "user",   "content": "What is the capital of India?"},
        ],
        "stream": True,
        "max_tokens": 50,
        "temperature": 0.7,
    }
    t0 = time.perf_counter()
    first_token_ms = None
    full_text = ""

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            async with client.stream("POST", f"{BASE}/v1/chat/completions",
                                     json=payload, headers=HEADERS) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    data_str = line[5:].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data_str)
                        delta = chunk["choices"][0]["delta"].get("content", "")
                        if delta:
                            if first_token_ms is None:
                                first_token_ms = round((time.perf_counter() - t0) * 1000)
                            full_text += delta
                    except Exception:
                        pass

        if full_text:
            ok(f"Response received in {round((time.perf_counter()-t0)*1000)}ms  |  TTFT: {first_token_ms}ms")
            info(f'LLM said: "{full_text.strip()}"')
        else:
            fail("Empty response from LLM")

    except Exception as e:
        fail(f"LLM error: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# 2. TTS — bulbul:v3
# ─────────────────────────────────────────────────────────────────────────────
async def test_tts():
    print(f"\n{BOLD}[2/3] TTS — bulbul:v3{RESET}")
    payload = {
        "model": "bulbul:v3",
        "inputs": ["Hello! I am Sarvam, your voice assistant. How can I help you today?"],
        "target_language_code": "en-IN",
        "speaker": "shubh",
        "pace": 1.0,
        "temperature": 0.6,
        "sample_rate": 24000,
        "enable_preprocessing": True,
    }
    # NOTE: no pitch, no loudness — bulbul:v3 doesn't support them
    t0 = time.perf_counter()

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(f"{BASE}/text-to-speech", json=payload, headers=HEADERS)
            resp.raise_for_status()
            data = resp.json()
            audios = data.get("audios", [])
            if not audios:
                fail("No audio in response")
                return
            audio_bytes = base64.b64decode(audios[0])
            elapsed = round((time.perf_counter() - t0) * 1000)
            ok(f"Audio received in {elapsed}ms  |  size: {len(audio_bytes):,} bytes")
            # Save to scratch for manual playback verification
            out_path = "scratch_tts_test.wav"
            with open(out_path, "wb") as f:
                f.write(audio_bytes)
            info(f"Audio saved to: {out_path}  (open to verify sound)")

    except httpx.HTTPStatusError as e:
        fail(f"TTS HTTP {e.response.status_code}: {e.response.text[:200]}")
    except Exception as e:
        fail(f"TTS error: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# 3. STT — saaras:v3-realtime
#    Sends 2 seconds of 440 Hz sine wave PCM (simulates human speech frame)
# ─────────────────────────────────────────────────────────────────────────────
def _make_sine_pcm(duration_s: float = 2.0, sample_rate: int = 16000, freq: float = 440.0) -> bytes:
    """Generate raw linear16 PCM bytes for a sine wave."""
    n_samples = int(duration_s * sample_rate)
    buf = bytearray(n_samples * 2)  # 16-bit = 2 bytes per sample
    amplitude = 8000  # well below int16 max (32767) to avoid clipping
    for i in range(n_samples):
        val = int(amplitude * math.sin(2 * math.pi * freq * i / sample_rate))
        struct.pack_into("<h", buf, i * 2, val)  # little-endian int16
    return bytes(buf)


async def test_stt():
    print(f"\n{BOLD}[3/3] STT — saaras:v3-realtime{RESET}")
    params = {
        "model": "saaras:v3-realtime",
        "language_code": "en-IN",
        "stream_type": "fast",
        "mode": "transcribe",
        "endpointing": "vad",
        "encoding": "linear16",
        "sample_rate": 16000,
        "threshold": 0.3,
        "silence_duration_ms": 500,
        "min_speech_duration_ms": 250,
        "api-subscription-key": API_KEY,
    }
    url = f"wss://api.sarvam.ai/speech-to-text-realtime/ws?{urlencode(params)}"

    # Use header auth as primary, query param as fallback (both sent)
    extra_headers = {"api-subscription-key": API_KEY}

    pcm_data = _make_sine_pcm(duration_s=2.0)
    # Split into ~100ms frames (3200 bytes at 16kHz 16-bit)
    frame_size = 3200
    frames = [pcm_data[i:i+frame_size] for i in range(0, len(pcm_data), frame_size)]

    t0 = time.perf_counter()
    events_received = []

    try:
        async with websockets.connect(
            url,
            additional_headers=extra_headers,
            open_timeout=10,
            ping_interval=None,
        ) as ws:
            ok(f"WebSocket connected in {round((time.perf_counter()-t0)*1000)}ms")

            # Send audio frames
            for frame in frames:
                b64 = base64.b64encode(frame).decode()
                await ws.send(json.dumps({"event": "audio_input", "audio": b64}))
                await asyncio.sleep(0.1)  # pace like real-time

            # Send end signal
            await ws.send(json.dumps({"event": "end"}))

            # Collect events for up to 5 seconds
            deadline = time.perf_counter() + 5.0
            while time.perf_counter() < deadline:
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=2.0)
                    msg = json.loads(raw)
                    ev = msg.get("event", "unknown")
                    events_received.append(ev)

                    if ev == "session.begin":
                        info(f"session.begin  (session_id={msg.get('session_id', '?')[:12]}...)")
                    elif ev == "vad.speech_start":
                        info("vad.speech_start ← VAD detected audio")
                    elif ev == "vad.speech_end":
                        info("vad.speech_end ← VAD silence detected")
                    elif ev == "transcript.partial":
                        info(f'transcript.partial: "{msg.get("text","")}"')
                    elif ev == "transcript.final":
                        text = msg.get("text", "")
                        info(f'transcript.final: "{text}"')
                        # Sine wave won't produce real text — any response means STT pipeline works
                    elif ev == "session.end":
                        ok(f"session.end  (billed: {msg.get('audio_duration_s', '?')}s audio)")
                        break
                    elif ev == "error":
                        is_fatal = msg.get("is_fatal", False)
                        msg_text = msg.get("message", "")
                        if is_fatal:
                            fail(f"Fatal STT error: {msg_text}")
                        else:
                            info(f"Non-fatal STT event: {msg_text}")
                        break
                except asyncio.TimeoutError:
                    break
                except websockets.exceptions.ConnectionClosedOK:
                    break

        if any(e in events_received for e in ("session.begin", "vad.speech_start", "transcript.partial", "transcript.final", "session.end")):
            ok(f"STT WebSocket pipeline working  |  events: {events_received}")
        else:
            fail(f"No meaningful STT events received: {events_received}")

    except Exception as e:
        fail(f"STT error: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────
async def main():
    print(f"\n{'='*60}")
    print(f"{BOLD}  Sarvam Model Smoke Tests{RESET}")
    print(f"{'='*60}")
    print(f"  API key: {'*'*24}{API_KEY[-4:]}")

    await test_llm()
    await test_tts()
    await test_stt()

    print(f"\n{'='*60}\n")


if __name__ == "__main__":
    asyncio.run(main())
