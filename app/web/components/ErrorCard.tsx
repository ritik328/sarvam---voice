"use client";

import React, { useState } from "react";
import styles from "./ErrorCard.module.css";

interface ErrorCardProps {
  message: string;
  detail?: string | null;
  onRetry: () => void;
  onDismiss?: () => void;
}

export function ErrorCard({
  message,
  detail,
  onRetry,
  onDismiss,
}: ErrorCardProps) {
  const [showDetail, setShowDetail] = useState(false);

  return (
    <div className={styles.card} role="alert">
      <div className={styles.topRow}>
        <div className={styles.msgContainer}>
          <span className={styles.icon}>⚠</span>
          <p className={styles.message}>{message}</p>
        </div>
        <button
          className={styles.retryBtn}
          onClick={onRetry}
          aria-label="Retry voice connection"
        >
          Retry
        </button>
      </div>

      {detail && (
        <div className={styles.detailSection}>
          <button
            className={styles.toggleDetailBtn}
            onClick={() => setShowDetail(!showDetail)}
            aria-expanded={showDetail}
          >
            {showDetail ? "Hide technical details ▲" : "What happened? ▼"}
          </button>
          {showDetail && (
            <pre className={styles.detailBox}>
              <code>{detail}</code>
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
