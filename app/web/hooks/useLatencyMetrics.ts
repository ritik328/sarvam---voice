/**
 * useLatencyMetrics
 *
 * Client-side TTFAR (Time To First Audible Response) measurement.
 * Uses performance.now() — monotonic, no cross-machine clock issues.
 *
 * TTFAR = firstAudioTime - speechEndTime (both measured client-side)
 */

import { useCallback, useRef, useState } from "react";

export interface LatencyMetrics {
  speechStartTime: number | null;
  speechEndTime: number | null;
  firstTranscriptTime: number | null;
  finalTranscriptTime: number | null;
  firstAssistantTextTime: number | null;
  firstAudioTime: number | null;
  /** TTFAR in ms, null until both speechEnd and firstAudio are set */
  ttfar: number | null;
}

const EMPTY_METRICS: LatencyMetrics = {
  speechStartTime: null,
  speechEndTime: null,
  firstTranscriptTime: null,
  finalTranscriptTime: null,
  firstAssistantTextTime: null,
  firstAudioTime: null,
  ttfar: null,
};

export function useLatencyMetrics() {
  const [metrics, setMetrics] = useState<LatencyMetrics>(EMPTY_METRICS);
  const ref = useRef<LatencyMetrics>(EMPTY_METRICS);

  const update = useCallback((patch: Partial<LatencyMetrics>) => {
    const next = { ...ref.current, ...patch };
    // Compute TTFAR when we have both speechEnd and firstAudio
    if (next.speechEndTime !== null && next.firstAudioTime !== null && next.ttfar === null) {
      next.ttfar = Math.round(next.firstAudioTime - next.speechEndTime);
      console.info(`[TTFAR] ${next.ttfar}ms`, next);
    }
    ref.current = next;
    setMetrics(next);
  }, []);

  const markSpeechStart = useCallback(() => {
    update({ speechStartTime: performance.now() });
  }, [update]);

  const markSpeechEnd = useCallback(() => {
    update({ speechEndTime: performance.now() });
  }, [update]);

  const markFirstTranscript = useCallback(() => {
    if (ref.current.firstTranscriptTime === null) {
      update({ firstTranscriptTime: performance.now() });
    }
  }, [update]);

  const markFinalTranscript = useCallback(() => {
    if (ref.current.finalTranscriptTime === null) {
      update({ finalTranscriptTime: performance.now() });
    }
  }, [update]);

  const markFirstAssistantText = useCallback(() => {
    if (ref.current.firstAssistantTextTime === null) {
      update({ firstAssistantTextTime: performance.now() });
    }
  }, [update]);

  const markFirstAudio = useCallback(() => {
    if (ref.current.firstAudioTime === null) {
      update({ firstAudioTime: performance.now() });
    }
  }, [update]);

  const reset = useCallback(() => {
    ref.current = EMPTY_METRICS;
    setMetrics(EMPTY_METRICS);
  }, []);

  return {
    metrics,
    markSpeechStart,
    markSpeechEnd,
    markFirstTranscript,
    markFinalTranscript,
    markFirstAssistantText,
    markFirstAudio,
    reset,
  };
}
