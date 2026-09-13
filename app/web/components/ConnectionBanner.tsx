"use client";

import React from "react";
import styles from "./ConnectionBanner.module.css";

interface ConnectionBannerProps {
  visible: boolean;
  message?: string;
}

export function ConnectionBanner({
  visible,
  message = "Connection lost — reconnecting…",
}: ConnectionBannerProps) {
  if (!visible) return null;

  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <span className={styles.spinner} />
      <span className={styles.text}>{message}</span>
    </div>
  );
}
