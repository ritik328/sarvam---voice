"use client";

import React, { useState } from "react";
import styles from "./PermissionGate.module.css";

interface PermissionGateProps {
  onEnable: () => Promise<void>;
  onDismiss: () => void;
}

export function PermissionGate({ onEnable, onDismiss }: PermissionGateProps) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleEnableClick = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      await onEnable();
      onDismiss();
    } catch (e: unknown) {
      if (e instanceof Error) {
        if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") {
          setErrorMsg(
            "Microphone permission was blocked. Please click the lock or settings icon next to http://localhost:3000 in your browser address bar to allow microphone access, and make sure Windows Settings > Privacy & security > Microphone is ON."
          );
        } else if (e.name === "NotFoundError" || e.name === "DevicesNotFoundError") {
          setErrorMsg(
            "No microphone detected on your computer. Please plug in or connect a microphone/headset and try again."
          );
        } else {
          setErrorMsg(e.message || "Failed to initialize microphone.");
        }
      } else {
        setErrorMsg("Failed to enable microphone.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="perm-title">
      <div className={styles.card}>
        <div className={styles.iconCircle}>
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--user)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 10a7 7 0 0 0 14 0" />
            <line x1="12" y1="19" x2="12" y2="22" />
            <line x1="8" y1="22" x2="16" y2="22" />
          </svg>
        </div>

        <h2 id="perm-title" className={styles.title}>
          Enable Microphone Access
        </h2>

        <p className={styles.description}>
          Sarvam Voice Assistant processes speech in real time with ultra-low latency. We stream audio directly to Sarvam AI’s real-time STT engine. Audio is never stored on disk.
        </p>

        {errorMsg && (
          <div className={styles.alertBox} role="alert">
            <span className={styles.alertIcon}>⚠</span>
            <p className={styles.alertText}>{errorMsg}</p>
          </div>
        )}

        <div className={styles.actions}>
          <button
            className={styles.enableButton}
            onClick={handleEnableClick}
            disabled={loading}
          >
            {loading ? "Activating…" : "Enable Microphone & Start"}
          </button>
          <button className={styles.dismissButton} onClick={onDismiss}>
            Maybe Later
          </button>
        </div>
      </div>
    </div>
  );
}
