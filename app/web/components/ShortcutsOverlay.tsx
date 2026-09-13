"use client";

import React from "react";
import styles from "./ShortcutsOverlay.module.css";

interface ShortcutsOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { key: "Space", desc: "Start / Stop speaking turn" },
  { key: "Esc", desc: "Interrupt assistant speech immediately" },
  { key: "M", desc: "Mute / Unmute microphone" },
  { key: "T", desc: "Toggle transcript auto-scroll" },
  { key: "?", desc: "Show / Hide this keyboard guide" },
];

export function ShortcutsOverlay({ isOpen, onClose }: ShortcutsOverlayProps) {
  if (!isOpen) return null;

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
    >
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 id="shortcuts-title" className={styles.title}>
            Keyboard Shortcuts
          </h2>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close shortcuts"
          >
            ✕
          </button>
        </div>

        <ul className={styles.list}>
          {SHORTCUTS.map((sc) => (
            <li key={sc.key} className={styles.item}>
              <kbd className={styles.key}>{sc.key}</kbd>
              <span className={styles.desc}>{sc.desc}</span>
            </li>
          ))}
        </ul>

        <p className={styles.footerNote}>
          Press <kbd className={styles.inlineKbd}>?</kbd> anytime to toggle this menu.
        </p>
      </div>
    </div>
  );
}
