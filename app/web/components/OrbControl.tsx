"use client";

import React, { useState } from "react";
import { VoiceState } from "../hooks/useVoiceSession";
import styles from "./OrbControl.module.css";

interface OrbControlProps {
  state: VoiceState;
  onPress: () => void;
  disabled?: boolean;
}

const STATE_COLORS: Record<VoiceState, string> = {
  IDLE: "var(--user)",
  CONNECTING: "var(--think)",
  LISTENING: "var(--user)",
  USER_SPEAKING: "var(--user)",
  PROCESSING: "var(--think)",
  ASSISTANT_SPEAKING: "var(--ai)",
  INTERRUPTED: "var(--error)",
  RECONNECTING: "var(--warn)",
  ERROR: "var(--error)",
};

const STATE_ARIA_LABELS: Record<VoiceState, string> = {
  IDLE: "Start speaking",
  CONNECTING: "Connecting, please wait",
  LISTENING: "Stop listening",
  USER_SPEAKING: "Stop speaking",
  PROCESSING: "Processing response",
  ASSISTANT_SPEAKING: "Interrupt assistant",
  INTERRUPTED: "Interrupted",
  RECONNECTING: "Reconnecting",
  ERROR: "Retry voice connection",
};

export function OrbControl({ state, onPress, disabled = false }: OrbControlProps) {
  const [isPressed, setIsPressed] = useState(false);
  const stateColor = STATE_COLORS[state] || STATE_COLORS.IDLE;
  const isSpeaking = state === "USER_SPEAKING";
  const isAssistant = state === "ASSISTANT_SPEAKING";
  const isConnecting = state === "CONNECTING";
  const isProcessing = state === "PROCESSING";
  const isInterrupted = state === "INTERRUPTED";
  const isError = state === "ERROR";

  const handlePointerDown = () => {
    if (!disabled && state !== "CONNECTING") {
      setIsPressed(true);
    }
  };

  const handlePointerUp = () => {
    setIsPressed(false);
  };

  return (
    <div className={styles.orbContainer} data-state={state}>
      {/* Ripple layer for interruptions or turn transitions */}
      {isInterrupted && <div className={styles.rippleEffect} />}

      {/* Halo radial gradient glow */}
      <div
        className={styles.halo}
        style={{
          backgroundColor: stateColor,
          opacity: isPressed ? 0.55 : isSpeaking ? 0.45 : isAssistant ? 0.4 : 0.25,
        }}
      />

      {/* Activity Ring */}
      <div
        className={styles.activityRing}
        style={{
          borderColor: stateColor,
          opacity: isConnecting ? 0.6 : isSpeaking || isAssistant ? 1 : 0.4,
        }}
        data-state={state}
      />

      {/* Core Button */}
      <button
        id="hero-orb-button"
        className={styles.coreButton}
        onClick={onPress}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        disabled={disabled || isConnecting}
        aria-label={STATE_ARIA_LABELS[state]}
        data-state={state}
        data-pressed={isPressed}
      >
        <div className={styles.innerSurface}>
          {isConnecting || isProcessing ? (
            /* Thinking / Connecting Spinner */
            <svg
              className={styles.spinnerIcon}
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                strokeOpacity="0.25"
                stroke="currentColor"
              />
              <path
                d="M12 2a10 10 0 0 1 10 10"
                stroke="currentColor"
                strokeLinecap="round"
              />
            </svg>
          ) : isAssistant ? (
            /* Interrupt / Stop Icon when assistant speaks */
            <svg
              width="30"
              height="30"
              viewBox="0 0 24 24"
              fill="currentColor"
              className={styles.stopIcon}
            >
              <rect x="6" y="6" width="12" height="12" rx="2.5" />
            </svg>
          ) : isSpeaking ? (
            /* Filled active mic when user is speaking */
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="currentColor"
              className={styles.filledMicIcon}
            >
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
              <path
                d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          ) : isError ? (
            /* Error Refresh Icon */
            <svg
              width="30"
              height="30"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
          ) : (
            /* Standard Outline Mic Icon */
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={styles.micIcon}
            >
              <rect x="9" y="2" width="6" height="12" rx="3" />
              <path d="M5 10a7 7 0 0 0 14 0" />
              <line x1="12" y1="19" x2="12" y2="22" />
              <line x1="8" y1="22" x2="16" y2="22" />
            </svg>
          )}
        </div>
      </button>
    </div>
  );
}
