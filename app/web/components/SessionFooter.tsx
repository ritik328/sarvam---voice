"use client";

import React from "react";
import type { LatencyMetrics } from "../hooks/useLatencyMetrics";
import styles from "./SessionFooter.module.css";

interface SessionFooterProps {
  durationSeconds: number;
  turnsCount: number;
  ttfar: number | null;
  metrics: Partial<LatencyMetrics>;
  onOpenShortcuts: () => void;
  onOpenSettings: () => void;
}

export function SessionFooter({
  durationSeconds,
  turnsCount,
  ttfar,
  metrics,
  onOpenShortcuts,
  onOpenSettings,
}: SessionFooterProps) {
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins.toString().padStart(2, "0")}:${remainder
      .toString()
      .padStart(2, "0")}`;
  };

  const sttLatency =
    metrics.speechEndTime && metrics.finalTranscriptTime
      ? Math.round(metrics.finalTranscriptTime - metrics.speechEndTime)
      : metrics.speechStartTime && metrics.firstTranscriptTime
      ? Math.round(metrics.firstTranscriptTime - metrics.speechStartTime)
      : null;

  const llmLatency =
    metrics.finalTranscriptTime && metrics.firstAssistantTextTime
      ? Math.round(metrics.firstAssistantTextTime - metrics.finalTranscriptTime)
      : metrics.speechEndTime && metrics.firstAssistantTextTime
      ? Math.round(metrics.firstAssistantTextTime - metrics.speechEndTime)
      : null;

  return (
    <footer className={styles.footer} aria-label="Session metrics and settings">
      <div className={styles.leftGroup}>
        {/* Session Timer (tabular numbers) */}
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Time</span>
          <span className={`${styles.metaValue} tabular-nums`}>
            {formatTime(durationSeconds)}
          </span>
        </div>

        {/* Turn Counter */}
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Turns</span>
          <span className={`${styles.metaValue} tabular-nums`}>
            {turnsCount}
          </span>
        </div>

        {/* Latency Pill (TTFAR / STT / LLM) */}
        {ttfar !== null && (
          <div className={styles.latencyPill}>
            <span>
              TTFAR: <strong>{ttfar}ms</strong>
            </span>
            {sttLatency !== null && (
              <span className={styles.secondaryMetric}>
                STT: <strong>{sttLatency}ms</strong>
              </span>
            )}
            {llmLatency !== null && (
              <span className={styles.secondaryMetric}>
                LLM: <strong>{llmLatency}ms</strong>
              </span>
            )}
          </div>
        )}
      </div>

      <div className={styles.rightGroup}>
        {/* Shortcuts button */}
        <button
          className={styles.iconBtn}
          onClick={onOpenShortcuts}
          title="Keyboard shortcuts (?)"
          aria-label="Keyboard shortcuts"
        >
          ?
        </button>

        {/* Settings button */}
        <button
          className={styles.iconBtn}
          onClick={onOpenSettings}
          title="Preferences & Theme"
          aria-label="Preferences"
        >
          ⚙
        </button>
      </div>
    </footer>
  );
}
