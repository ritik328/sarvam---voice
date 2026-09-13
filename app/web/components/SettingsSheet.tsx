"use client";

import React from "react";
import styles from "./SettingsSheet.module.css";

interface SettingsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  theme: "dark" | "light";
  onThemeChange: (theme: "dark" | "light") => void;
  soundFeedback: boolean;
  onSoundFeedbackToggle: () => void;
  speaker: string;
  onSpeakerChange: (speaker: string) => void;
  pace: number;
  onPaceChange: (pace: number) => void;
}

export function SettingsSheet({
  isOpen,
  onClose,
  theme,
  onThemeChange,
  soundFeedback,
  onSoundFeedbackToggle,
  speaker,
  onSpeakerChange,
  pace,
  onPaceChange,
}: SettingsSheetProps) {
  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 id="settings-title" className={styles.title}>Preferences</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </div>

        <div className={styles.content}>
          {/* Theme setting */}
          <div className={styles.settingItem}>
            <div className={styles.settingLabel}>
              <span className={styles.settingName}>Appearance</span>
              <span className={styles.settingDesc}>Select light or dark interface theme</span>
            </div>
            <div className={styles.themePills}>
              <button
                className={`${styles.pillBtn} ${theme === "dark" ? styles.activePill : ""}`}
                onClick={() => onThemeChange("dark")}
              >
                Dark
              </button>
              <button
                className={`${styles.pillBtn} ${theme === "light" ? styles.activePill : ""}`}
                onClick={() => onThemeChange("light")}
              >
                Light
              </button>
            </div>
          </div>

          {/* Speaker setting */}
          <div className={styles.settingItem}>
            <div className={styles.settingLabel}>
              <span className={styles.settingName}>Sarvam Voice</span>
              <span className={styles.settingDesc}>Bulbul v3 TTS voice timbre</span>
            </div>
            <select
              className={styles.selectInput}
              value={speaker}
              onChange={(e) => onSpeakerChange(e.target.value)}
            >
              <option value="shubh">Shubh (Male / Clear)</option>
              <option value="meera">Meera (Female / Calm)</option>
            </select>
          </div>

          {/* Voice Pace setting */}
          <div className={styles.settingItem}>
            <div className={styles.settingLabel}>
              <span className={styles.settingName}>Speech Pace</span>
              <span className={styles.settingDesc}>{pace.toFixed(1)}x speed multiplier</span>
            </div>
            <div className={styles.paceButtons}>
              {[0.8, 1.0, 1.2].map((p) => (
                <button
                  key={p}
                  className={`${styles.paceBtn} ${pace === p ? styles.activePace : ""}`}
                  onClick={() => onPaceChange(p)}
                >
                  {p}x
                </button>
              ))}
            </div>
          </div>

          {/* Sound cue feedback */}
          <div className={styles.settingItem}>
            <div className={styles.settingLabel}>
              <span className={styles.settingName}>Sound Cues</span>
              <span className={styles.settingDesc}>Soft tick on turn completion</span>
            </div>
            <label className={styles.switch}>
              <input
                type="checkbox"
                checked={soundFeedback}
                onChange={onSoundFeedbackToggle}
                aria-label="Toggle sound feedback"
              />
              <span className={styles.slider} />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
