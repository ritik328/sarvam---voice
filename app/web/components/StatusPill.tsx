"use client";

import React from "react";
import { VoiceState } from "../hooks/useVoiceSession";
import styles from "./StatusPill.module.css";

interface StatusPillProps {
  state: VoiceState;
  isConnected: boolean;
  isMuted?: boolean;
}

const STATE_CONFIG: Record<
  VoiceState,
  { label: string; color: string; dotColor: string }
> = {
  IDLE: {
    label: "Ready",
    color: "var(--text-2)",
    dotColor: "var(--text-2)",
  },
  CONNECTING: {
    label: "Connecting…",
    color: "var(--think)",
    dotColor: "var(--think)",
  },
  LISTENING: {
    label: "Listening",
    color: "var(--user)",
    dotColor: "var(--ok)",
  },
  USER_SPEAKING: {
    label: "Hearing you…",
    color: "var(--user)",
    dotColor: "var(--user)",
  },
  PROCESSING: {
    label: "Thinking…",
    color: "var(--think)",
    dotColor: "var(--think)",
  },
  ASSISTANT_SPEAKING: {
    label: "Speaking",
    color: "var(--ai)",
    dotColor: "var(--ai)",
  },
  INTERRUPTED: {
    label: "Interrupted",
    color: "var(--error)",
    dotColor: "var(--error)",
  },
  PAUSED: {
    label: "Paused",
    color: "var(--warn)",
    dotColor: "var(--warn)",
  },
  RECONNECTING: {
    label: "Reconnecting…",
    color: "var(--warn)",
    dotColor: "var(--warn)",
  },
  ERROR: {
    label: "Attention needed",
    color: "var(--error)",
    dotColor: "var(--error)",
  },
};

export function StatusPill({ state, isConnected, isMuted }: StatusPillProps) {
  const config = STATE_CONFIG[state] || STATE_CONFIG.IDLE;
  const displayLabel = isMuted ? "Microphone Muted" : config.label;
  const activeDotColor = isMuted ? "var(--warn)" : config.dotColor;

  return (
    <div
      className={styles.pill}
      role="status"
      aria-label={`Voice session status: ${displayLabel}`}
    >
      <span
        className={styles.dot}
        style={{
          backgroundColor: activeDotColor,
          boxShadow: `0 0 8px ${activeDotColor}`,
        }}
      />
      <span className={styles.label} style={{ color: config.color }}>
        {displayLabel}
      </span>

      {/* Screen reader live announcement */}
      <span className={styles.srOnly} aria-live="polite">
        {displayLabel}
      </span>
    </div>
  );
}
