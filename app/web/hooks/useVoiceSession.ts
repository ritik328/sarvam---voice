/**
 * useVoiceSession — Design Language "Pulse"
 *
 * Manages the entire 9-state voice session lifecycle:
 *   IDLE, CONNECTING, LISTENING, USER_SPEAKING, PROCESSING,
 *   ASSISTANT_SPEAKING, INTERRUPTED, RECONNECTING, ERROR.
 *
 * Exposes:
 *   - Current state & error details
 *   - Structured turns history with barge-in ('—') flags
 *   - Active partial & final transcript streaming
 *   - Audio analyzers for radial canvas visualizer
 *   - Controls (start, stop, interrupt, toggleMute)
 *   - Session duration timer & turn counter
 *   - Theme switcher (Dark / Light)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AudioCaptureManager } from "../audio/AudioCapture";
import { AudioPlayer } from "../audio/AudioPlayer";
import { useLatencyMetrics } from "./useLatencyMetrics";

export type VoiceState =
  | "IDLE"
  | "CONNECTING"
  | "LISTENING"
  | "USER_SPEAKING"
  | "PROCESSING"
  | "ASSISTANT_SPEAKING"
  | "INTERRUPTED"
  | "RECONNECTING"
  | "ERROR";

export interface TranscriptTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
  isInterrupted?: boolean;
  usedSearch?: boolean;
}

export interface VoiceSessionState {
  state: VoiceState;
  turns: TranscriptTurn[];
  partialTranscript: string;
  assistantText: string;
  errorMessage: string | null;
  errorDetail: string | null;
  isConnected: boolean;
  sessionId: string | null;
  isMuted: boolean;
  sessionDuration: number;
  permissionStatus: "prompt" | "granted" | "denied" | "unknown";
  theme: "dark" | "light";
}

const INITIAL_STATE: VoiceSessionState = {
  state: "IDLE",
  turns: [],
  partialTranscript: "",
  assistantText: "",
  errorMessage: null,
  errorDetail: null,
  isConnected: false,
  sessionId: null,
  isMuted: false,
  sessionDuration: 0,
  permissionStatus: "unknown",
  theme: "dark",
};

const BACKEND_HTTP = process.env.NEXT_PUBLIC_BACKEND_HTTP_URL ?? "http://localhost:8000";
const BACKEND_WS = process.env.NEXT_PUBLIC_BACKEND_WS_URL ?? "ws://localhost:8000";

export function useVoiceSession() {
  const [sessionState, setSessionState] = useState<VoiceSessionState>(INITIAL_STATE);
  const wsRef = useRef<WebSocket | null>(null);
  const captureRef = useRef<AudioCaptureManager | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const stateRef = useRef<VoiceState>("IDLE");
  const assistantTextRef = useRef<string>("");
  const fullAssistantTextRef = useRef<string>("");
  const revealTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const durationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const noMoreChunksRef = useRef<boolean>(false);
  const lastUsedSearchRef = useRef<boolean>(false);
  const latency = useLatencyMetrics();

  const clearRevealTimers = useCallback(() => {
    for (const timer of revealTimersRef.current) {
      clearTimeout(timer);
    }
    revealTimersRef.current = [];
  }, []);

  const revealChunkText = useCallback((text: string, durationMs: number) => {
    if (!text) return;

    // Ensure proper space separation between streaming chunks
    if (
      assistantTextRef.current &&
      !/\s$/.test(assistantTextRef.current) &&
      !/^\s/.test(text)
    ) {
      assistantTextRef.current += " ";
    }

    const tokens: string[] = text.match(/\S+\s*/g) || [text];
    if (tokens.length === 0) return;

    // Distribute words smoothly across playback duration
    const interval = Math.max(30, Math.floor(durationMs / tokens.length));

    tokens.forEach((token, index) => {
      const timer = setTimeout(() => {
        assistantTextRef.current += token;
        setSessionState((prev) => ({
          ...prev,
          assistantText: assistantTextRef.current,
        }));
      }, index * interval);
      revealTimersRef.current.push(timer);
    });
  }, []);

  const setVS = useCallback((patch: Partial<VoiceSessionState>) => {
    setSessionState((prev) => {
      const next = { ...prev, ...patch };
      if (patch.state !== undefined) {
        stateRef.current = patch.state;
      }
      return next;
    });
  }, []);

  const finalizeAssistantTurn = useCallback(() => {
    clearRevealTimers();
    let finalAssistantText = (assistantTextRef.current || fullAssistantTextRef.current).trim();
    // Normalize any squished punctuation between sentences (e.g. "GPT.You" -> "GPT. You")
    finalAssistantText = finalAssistantText.replace(/([.!?])([A-Za-z])/g, "$1 $2");

    if (finalAssistantText) {
      const turn: TranscriptTurn = {
        id: "turn-" + Date.now(),
        role: "assistant",
        text: finalAssistantText,
        timestamp: Date.now(),
        usedSearch: lastUsedSearchRef.current,
      };
      lastUsedSearchRef.current = false;
      setSessionState((prev) => ({
        ...prev,
        turns: [...prev.turns, turn],
        assistantText: "",
        state: "LISTENING",
      }));
      assistantTextRef.current = "";
      fullAssistantTextRef.current = "";
    } else {
      setVS({ state: "LISTENING", assistantText: "" });
    }
  }, [clearRevealTimers, setVS]);

  // Check initial permission status if available
  const checkPermission = useCallback(async (): Promise<"prompt" | "granted" | "denied"> => {
    try {
      if (typeof navigator !== "undefined" && navigator.permissions?.query) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const status = await navigator.permissions.query({ name: "microphone" as any });
        const res = status.state as "prompt" | "granted" | "denied";
        setVS({ permissionStatus: res });
        return res;
      }
    } catch {
      // permissions.query not supported everywhere
    }
    return "unknown" as unknown as "prompt";
  }, [setVS]);

  useEffect(() => {
    checkPermission();
  }, [checkPermission]);

  // Session duration timer
  useEffect(() => {
    const isActive = sessionState.state !== "IDLE" && sessionState.state !== "ERROR";
    if (isActive && !durationTimerRef.current) {
      durationTimerRef.current = setInterval(() => {
        setSessionState((prev) => ({
          ...prev,
          sessionDuration: prev.sessionDuration + 1,
        }));
      }, 1000);
    } else if (!isActive && durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    return () => {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
    };
  }, [sessionState.state]);

  // Audio level monitoring for RMS-based USER_SPEAKING trigger
  useEffect(() => {
    let animId: number;
    const checkMicLevel = () => {
      if (stateRef.current === "LISTENING" && captureRef.current) {
        const level = captureRef.current.getAudioLevel();
        if (level > 0.08) {
          latency.markSpeechStart();
          setVS({ state: "USER_SPEAKING" });
        }
      }
      animId = requestAnimationFrame(checkMicLevel);
    };
    animId = requestAnimationFrame(checkMicLevel);
    return () => cancelAnimationFrame(animId);
  }, [latency, setVS]);

  const finalizeTurnRef = useRef(finalizeAssistantTurn);
  finalizeTurnRef.current = finalizeAssistantTurn;

  const markFirstAudioRef = useRef(latency.markFirstAudio);
  markFirstAudioRef.current = latency.markFirstAudio;

  const revealChunkTextRef = useRef(revealChunkText);
  revealChunkTextRef.current = revealChunkText;

  // Initialize player on mount (run ONCE to prevent recreating player on state changes)
  useEffect(() => {
    const player = new AudioPlayer();
    playerRef.current = player;
    player.onFirstAudio = () => {
      markFirstAudioRef.current();
    };
    player.onChunkPlaybackStart = (text: string, durationMs: number) => {
      revealChunkTextRef.current(text, durationMs);
    };
    player.onQueueEmpty = () => {
      // Only transition to LISTENING when the backend has confirmed all chunks were sent
      // This prevents gaps between chunk 1 finishing and chunk 2 decoding from cutting off audio
      if (noMoreChunksRef.current && stateRef.current === "ASSISTANT_SPEAKING") {
        finalizeTurnRef.current();
        noMoreChunksRef.current = false;
      }
    };
    return () => {
      player.close();
      playerRef.current = null;
    };
  }, []);

  // Handle WebSocket messages
  const handleWsMessage = useCallback(
    async (event: MessageEvent) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }

      const ev = msg.event as string;

      switch (ev) {
        case "session.ready":
          setVS({
            state: "LISTENING",
            isConnected: true,
            errorMessage: null,
            errorDetail: null,
          });
          break;

        case "connection.status": {
          const status = msg.status as string;
          if (status === "speech_detected") {
            latency.markSpeechStart();
            clearRevealTimers();
            lastUsedSearchRef.current = false;
            assistantTextRef.current = "";
            fullAssistantTextRef.current = "";
            setVS({ state: "USER_SPEAKING", partialTranscript: "", assistantText: "" });
          } else if (status === "speech_ended") {
            latency.markSpeechEnd();
            setVS({ state: "PROCESSING" });
          }
          break;
        }

        case "transcript.partial":
          latency.markFirstTranscript();
          setVS({ partialTranscript: (msg.text as string) ?? "" });
          break;

        case "transcript.final": {
          latency.markFinalTranscript();
          const text = ((msg.text as string) ?? "").trim();
          if (text) {
            const userTurn: TranscriptTurn = {
              id: "turn-" + Date.now(),
              role: "user",
              text,
              timestamp: Date.now(),
            };
            setSessionState((prev) => ({
              ...prev,
              turns: [...prev.turns, userTurn],
              partialTranscript: "",
            }));
          } else {
            setVS({ partialTranscript: "" });
          }
          break;
        }

        case "assistant.text.partial": {
          latency.markFirstAssistantText();
          const chunk = ((msg.text as string) ?? "");
          fullAssistantTextRef.current += chunk;
          break;
        }

        case "assistant.text.final": {
          if (msg.used_search) {
            lastUsedSearchRef.current = true;
          }
          const chunksSent = (msg.chunks_sent as number) ?? 0;
          if (chunksSent === 0) {
            const text = ((msg.text as string) ?? fullAssistantTextRef.current).trim();
            if (text) {
              assistantTextRef.current = text;
              setVS({ assistantText: text });
              finalizeAssistantTurn();
            }
          }
          break;
        }

        case "assistant.speaking.start":
          noMoreChunksRef.current = false;
          // Section 8.3: Haptic feedback cue on mobile
          if (typeof navigator !== "undefined" && navigator.vibrate) {
            try { navigator.vibrate(10); } catch { /* Ignore */ }
          }
          setVS({ state: "ASSISTANT_SPEAKING" });
          playerRef.current?.resetForNewTurn();
          break;

        case "assistant.audio.chunk":
          if (msg.audio) {
            const chunkText = (msg.text as string) ?? "";
            await playerRef.current?.enqueue(msg.audio as string, chunkText);
          }
          break;

        case "assistant.speaking.stop":
          // Backend finished sending all audio chunks for this turn.
          // Let the audio queue drain naturally; AudioPlayer.onQueueEmpty will finalize the turn.
          noMoreChunksRef.current = true;
          break;

        case "assistant.interrupted": {
          noMoreChunksRef.current = false;
          clearRevealTimers();
          playerRef.current?.cancelAndFlush();
          // Mark last assistant turn or current text as interrupted with '—'
          const interruptedText = assistantTextRef.current.trim();
          if (interruptedText) {
            const interruptedTurn: TranscriptTurn = {
              id: "turn-" + Date.now(),
              role: "assistant",
              text: interruptedText + " —",
              timestamp: Date.now(),
              isInterrupted: true,
            };
            setSessionState((prev) => ({
              ...prev,
              turns: [...prev.turns, interruptedTurn],
              assistantText: "",
            }));
            assistantTextRef.current = "";
            fullAssistantTextRef.current = "";
          }

          // Section 7 & 8.4: Interrupted state ripple, then return to LISTENING
          setVS({ state: "INTERRUPTED" });
          setTimeout(() => {
            if (stateRef.current === "INTERRUPTED") {
              setVS({ state: "LISTENING" });
            }
          }, 300);
          latency.reset();
          break;
        }

        case "error": {
          const fatal = msg.fatal as boolean | undefined;
          const errMsg = (msg.message as string) ?? "Unknown server error";
          setVS({
            errorMessage: errMsg,
            errorDetail: JSON.stringify(msg, null, 2),
            state: fatal ? "ERROR" : stateRef.current,
          });
          break;
        }

        default:
          break;
      }
    },
    [latency, setVS]
  );

  /**
   * Start the voice session.
   * Direct user gesture required.
   */
  const startListening = useCallback(async () => {
    if (wsRef.current || stateRef.current !== "IDLE") return;

    setVS({ state: "CONNECTING", errorMessage: null, errorDetail: null });
    latency.reset();

    let capture: AudioCaptureManager | null = null;

    try {
      // 1. Ensure audio player context is unlocked
      await playerRef.current?.ensureContext();

      // 2. Request microphone immediately from click gesture
      capture = new AudioCaptureManager();
      captureRef.current = capture;
      await capture.start();
      setVS({ permissionStatus: "granted" });

      // 3. Create backend session
      const resp = await fetch(`${BACKEND_HTTP}/api/session`, {
        method: "POST",
      });
      if (!resp.ok) {
        throw new Error(`Backend session creation failed (HTTP ${resp.status}). Verify backend is running on port 8000.`);
      }
      const { session_id } = (await resp.json()) as { session_id: string };
      sessionIdRef.current = session_id;
      setVS({ sessionId: session_id });

      // 4. Open WebSocket
      const ws = new WebSocket(`${BACKEND_WS}/api/realtime/${session_id}`);
      wsRef.current = ws;

      // Pipe audio frames to backend
      capture.onAudioChunk = (base64: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ event: "audio.chunk", data: base64 }));
        }
      };

      ws.onopen = () => {
        ws.send(JSON.stringify({ event: "session.start" }));
      };

      ws.onmessage = handleWsMessage;

      ws.onerror = () => {
        setVS({
          state: "ERROR",
          errorMessage: "WebSocket connection error. Please verify backend is running on port 8000.",
          errorDetail: `Target URL: ${BACKEND_WS}/api/realtime/${session_id}`,
          isConnected: false,
        });
      };

      ws.onclose = () => {
        if (stateRef.current !== "IDLE" && stateRef.current !== "ERROR") {
          // If unexpected disconnect, show RECONNECTING briefly before IDLE
          setVS({ state: "RECONNECTING", isConnected: false });
          setTimeout(() => {
            setVS({ state: "IDLE" });
          }, 1500);
        } else {
          setVS({ state: "IDLE", isConnected: false });
        }
        wsRef.current = null;
      };
    } catch (e: unknown) {
      if (capture) {
        await capture.stop();
        captureRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      let userMsg = "Failed to start session.";
      let detailMsg = "";
      if (e instanceof Error) {
        detailMsg = `${e.name}: ${e.message}`;
        if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
          setVS({ permissionStatus: "denied" });
          userMsg =
            "Microphone permission blocked. Click the lock/settings icon next to http://localhost:3000 in your browser address bar to Allow Microphone, and verify Windows Settings > Privacy & security > Microphone is ON.";
        } else if (e.name === "NotFoundError" || e.name === "DevicesNotFoundError") {
          userMsg = "No microphone hardware detected. Please connect a microphone or headset and try again.";
        } else if (e.name === "NotReadableError" || e.name === "TrackStartError") {
          userMsg = "Microphone is in use by another application.";
        } else {
          userMsg = e.message || "Microphone initialization failed.";
        }
      }
      setVS({ state: "ERROR", errorMessage: userMsg, errorDetail: detailMsg });
    }
  }, [handleWsMessage, latency, setVS]);

  const stopListening = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event: "session.stop" }));
    }
    clearRevealTimers();
    await captureRef.current?.stop();
    captureRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
    playerRef.current?.cancelAndFlush();
    sessionIdRef.current = null;
    assistantTextRef.current = "";
    fullAssistantTextRef.current = "";
    setVS({
      state: "IDLE",
      isConnected: false,
      partialTranscript: "",
      assistantText: "",
      errorMessage: null,
      errorDetail: null,
    });
    latency.reset();
  }, [clearRevealTimers, latency, setVS]);

  const interrupt = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event: "user.interrupt" }));
    }
    clearRevealTimers();
    playerRef.current?.cancelAndFlush();
    const cutText = assistantTextRef.current.trim();
    if (cutText) {
      const turn: TranscriptTurn = {
        id: "turn-" + Date.now(),
        role: "assistant",
        text: cutText + " —",
        timestamp: Date.now(),
        isInterrupted: true,
      };
      setSessionState((prev) => ({
        ...prev,
        turns: [...prev.turns, turn],
        assistantText: "",
      }));
      assistantTextRef.current = "";
      fullAssistantTextRef.current = "";
    }
    setVS({ state: "INTERRUPTED" });
    setTimeout(() => {
      if (stateRef.current === "INTERRUPTED") {
        setVS({ state: "LISTENING" });
      }
    }, 300);
    latency.reset();
  }, [clearRevealTimers, latency, setVS]);

  const toggleMute = useCallback(() => {
    if (captureRef.current) {
      const nextMute = !sessionState.isMuted;
      captureRef.current.setMuted(nextMute);
      setVS({ isMuted: nextMute });
    }
  }, [sessionState.isMuted, setVS]);

  const setTheme = useCallback((theme: "dark" | "light") => {
    setVS({ theme });
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
    }
  }, [setVS]);

  const getMicAnalyser = useCallback((): AnalyserNode | null => {
    return captureRef.current?.getAnalyser() ?? null;
  }, []);

  const getPlayerAnalyser = useCallback((): AnalyserNode | null => {
    return playerRef.current?.getAnalyser() ?? null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      captureRef.current?.stop();
      wsRef.current?.close();
    };
  }, []);

  return {
    ...sessionState,
    ttfar: latency.metrics.ttfar,
    metrics: latency.metrics,
    turnsCount: sessionState.turns.length,
    startListening,
    stopListening,
    interrupt,
    toggleMute,
    setTheme,
    checkPermission,
    getMicAnalyser,
    getPlayerAnalyser,
  };
}
