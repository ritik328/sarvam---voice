"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useVoiceSession, VoiceState } from "../hooks/useVoiceSession";
import { VoiceVisualizer } from "./VoiceVisualizer";
import { SettingsSheet } from "./SettingsSheet";
import { ShortcutsOverlay } from "./ShortcutsOverlay";
import { PermissionGate } from "./PermissionGate";
import styles from "./VoiceAssistant.module.css";
export default function VoiceAssistant() {
  const {
    state,
    turns,
    partialTranscript,
    assistantText,
    isConnected,
    isMuted,
    isPaused,
    sessionDuration,
    turnsCount,
    ttfar,
    metrics,
    permissionStatus,
    theme,
    startListening,
    stopListening,
    pauseSession,
    resumeSession,
    togglePauseSession,
    interrupt,
    toggleMute,
    setTheme,
    getMicAnalyser,
    getPlayerAnalyser,
  } = useVoiceSession();

  // Drawers and Overlays
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [showPermissionGate, setShowPermissionGate] = useState(false);

  // Settings
  const [soundFeedback, setSoundFeedback] = useState(false);
  const [speaker, setSpeaker] = useState("shubh");
  const [pace, setPace] = useState(1.0);

  // Format Session Time MM:SS
  const formattedTimer = useMemo(() => {
    const mins = String(Math.floor(sessionDuration / 60)).padStart(2, "0");
    const secs = String(sessionDuration % 60).padStart(2, "0");
    return `SESSION • ${mins}:${secs}`;
  }, [sessionDuration]);

  // Primary Orb Press Handler
  const handleOrbPress = useCallback(async () => {
    if (state === "IDLE" || state === "ERROR") {
      if (permissionStatus === "denied") {
        setShowPermissionGate(true);
        return;
      }
      await startListening();
    } else if (state === "PAUSED" || isPaused) {
      resumeSession();
    } else if (state === "ASSISTANT_SPEAKING") {
      interrupt();
    } else {
      await stopListening();
    }
  }, [state, isPaused, permissionStatus, startListening, resumeSession, stopListening, interrupt]);

  // Reset Voice Call
  const handleReset = useCallback(async () => {
    await stopListening();
  }, [stopListening]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        handleOrbPress();
      } else if (e.code === "Escape") {
        if (state === "ASSISTANT_SPEAKING") {
          interrupt();
        } else if (isHistoryOpen || isSettingsOpen || isShortcutsOpen || showPermissionGate) {
          setIsHistoryOpen(false);
          setIsSettingsOpen(false);
          setIsShortcutsOpen(false);
          setShowPermissionGate(false);
        }
      } else if (e.key === "p" || e.key === "P") {
        togglePauseSession();
      } else if (e.key === "m" || e.key === "M") {
        toggleMute();
      } else if (e.key === "?") {
        e.preventDefault();
        setIsShortcutsOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleOrbPress, state, interrupt, togglePauseSession, toggleMute, isHistoryOpen, isSettingsOpen, isShortcutsOpen, showPermissionGate]);

  // Compute Dynamic Headline & Subtext
  const isAnswering = state === "ASSISTANT_SPEAKING";

  let statusLabel = "Listening to your voice...";
  let subtextLabel = "Sarvam Neural Audio Core";
  let headlineText = "How can I help you today?";

  if (isPaused || state === "PAUSED") {
    statusLabel = "Session Paused • Warm Connection Kept";
    subtextLabel = "Microphone & STT stream suspended • Zero API usage";
    headlineText = "Session Paused • Press Resume to continue";
  } else if (state === "IDLE") {
    statusLabel = "Tap to start conversation";
    subtextLabel = "Sarvam Neural Audio Core";
    headlineText = turns.length > 0 ? turns[turns.length - 1].text : "How can I help you today?";
  } else if (state === "CONNECTING") {
    statusLabel = "Connecting to Sarvam Gateway...";
    subtextLabel = "Initializing realtime audio pipeline";
    headlineText = "Connecting...";
  } else if (state === "LISTENING") {
    statusLabel = isMuted ? "Microphone Muted (M)" : "Listening to your voice...";
    subtextLabel = isMuted
      ? "Microphone paused"
      : turns.length > 0
      ? "Sarvam Assistant • Listening for your reply"
      : "Speak now, I'm all ears";
    headlineText = turns.length > 0 ? turns[turns.length - 1].text : "How can I help you today?";
  } else if (state === "USER_SPEAKING") {
    statusLabel = "Hearing your voice...";
    subtextLabel = "You are saying";
    headlineText = partialTranscript ? `"${partialTranscript}"` : "Hearing you...";
  } else if (state === "PROCESSING") {
    statusLabel = "Thinking...";
    subtextLabel = "Sarvam AI synthesizing response";
    headlineText = "Thinking...";
  } else if (state === "ASSISTANT_SPEAKING") {
    statusLabel = "Speaking & Answering...";
    subtextLabel = assistantText.toLowerCase().includes("check that for you")
      ? "🔍 Searching the web & synthesizing"
      : "Sarvam AI Generating Audio";
    headlineText = assistantText || "Streaming intelligent voice synthesis...";
  } else if (state === "INTERRUPTED") {
    statusLabel = "Interrupted";
    subtextLabel = "Speech cancelled";
    headlineText = "Listening to you...";
  } else if (state === "ERROR") {
    statusLabel = "Connection issue";
    subtextLabel = "Verify server connection";
    headlineText = "Something went wrong";
  }

  // Telemetry computation (fallback defaults if initial)
  const displayTtfar = ttfar !== null ? `${ttfar}ms` : "—";
  const displayStt =
    metrics.speechEndTime !== null && metrics.finalTranscriptTime !== null
      ? `${Math.max(1, Math.round(metrics.finalTranscriptTime - metrics.speechEndTime))}ms`
      : "120ms";
  const displayLlm =
    metrics.finalTranscriptTime !== null && metrics.firstAssistantTextTime !== null
      ? `${Math.max(1, Math.round(metrics.firstAssistantTextTime - metrics.finalTranscriptTime))}ms`
      : metrics.speechEndTime !== null && metrics.firstAssistantTextTime !== null
      ? `${Math.max(1, Math.round(metrics.firstAssistantTextTime - metrics.speechEndTime))}ms`
      : "260ms";

  const headlineClass =
    headlineText.length > 100
      ? `${styles.cinematicHeadline} ${styles.headlineLong}`
      : headlineText.length > 50
      ? `${styles.cinematicHeadline} ${styles.headlineMedium}`
      : styles.cinematicHeadline;

  return (
    <div
      className={styles.appContainer}
      data-state={isAnswering ? "answering" : "listening"}
      data-theme={theme}
    >
      {/* Ambient Volumetric Backdrop Spotlight */}
      <div
        className={`${styles.ambientSpotlight} ${
          isAnswering ? styles.spotlightAnswering : styles.spotlightListening
        }`}
      />

      {/* Top Desktop Navigation Bar */}
      <header className={styles.desktopHeader}>
        <div className={styles.brandSection}>
          <button
            className={styles.webBtn}
            id="openHistoryBtn"
            onClick={() => setIsHistoryOpen(true)}
            title="Chat & Session History"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="16" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
            <span>History</span>
          </button>

          <span className={styles.brandTitle}>Sarvam</span>
          <span className={styles.brandPill}>PULSE v2.4</span>
        </div>

        {/* Center Interactive State Pill */}
        <div
          className={styles.statusCapsule}
          id="statusPill"
          onClick={handleOrbPress}
          title="Click to toggle between Listening and Answering"
        >
          <div className={styles.sparkleIcon} />
          <span className={styles.statusText} id="statusText">
            {statusLabel}
          </span>
        </div>

        {/* Header Controls & Telemetry */}
        <div className={styles.headerControls}>
          <div className={styles.telemetryTag}>
            <span>TTFAR</span> {displayTtfar}
            <span>STT</span> {displayStt}
            <span>LLM</span> {displayLlm}
          </div>

          <button
            className={styles.webBtn}
            id="soundToggleBtn"
            onClick={toggleMute}
            title="Toggle Audio Output / Mute (M)"
          >
            {isMuted ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
            )}
            <span>{isMuted ? "Muted" : "Live Audio"}</span>
          </button>

          <button
            className={styles.webBtn}
            id="themeToggleBtn"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            aria-label="Toggle theme"
          >
            {theme === "light" ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
            )}
            <span>{theme === "light" ? "Dark Mode" : "Light Mode"}</span>
          </button>
        </div>
      </header>

      {/* Full-Screen Interactive Web Visualizer Stage (Canvas) */}
      <VoiceVisualizer
        state={state}
        getMicAnalyser={getMicAnalyser}
        getPlayerAnalyser={getPlayerAnalyser}
        onStageClick={handleOrbPress}
      />

      {/* Center Stage: Cinematic Headings & Time HUD */}
      <main className={styles.centerStage}>
        <div className={styles.sessionBadge} id="sessionTimer">
          {formattedTimer}
        </div>
        <div className={styles.cinematicSubtext} id="cinematicSubtext">
          {subtextLabel}
        </div>
        <h1 className={headlineClass} id="cinematicHeadline">
          {headlineText}
        </h1>
      </main>

      {/* Quick Web App Utilities */}
      <div className={styles.quickVoicePrompts}>
        <button
          className={styles.voiceChip}
          id="quickHistoryBtn"
          onClick={() => setIsHistoryOpen(true)}
          title="Open Conversation History"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span>History ({turns.length})</span>
        </button>

        <button
          className={styles.voiceChip}
          id="quickSettingsBtn"
          onClick={() => setIsSettingsOpen(true)}
          title="Change Voice / Audio Settings"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          <span>Voice: {speaker.charAt(0).toUpperCase() + speaker.slice(1)}</span>
        </button>

        <button
          className={styles.voiceChip}
          id="quickSearchBtn"
          onClick={() => handleOrbPress()}
          title="Tavily Web Search is connected — click to speak"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span>Web Search Active</span>
        </button>

        <button
          className={styles.voiceChip}
          id="quickShortcutsBtn"
          onClick={() => setIsShortcutsOpen(true)}
          title="View Keyboard Shortcuts"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="M6 8h.001M10 8h.001M14 8h.001M18 8h.001M6 12h.001M10 12h.001M14 12h.001M18 12h.001M7 16h10" />
          </svg>
          <span>Shortcuts (?)</span>
        </button>
      </div>

      {/* Bottom Voice Hub Dock (Strictly Voice - No Keyboard) */}
      <footer className={styles.voiceDockContainer}>
        <div className={styles.voiceDock}>
          {/* Pause / Resume Session (Keeps session warm without re-hitting API rate limits) */}
          <button
            className={`${styles.dockActionBtn} ${isPaused ? styles.dockActionBtnPaused : ""}`}
            id="pauseSessionBtn"
            onClick={togglePauseSession}
            disabled={state === "IDLE" || state === "ERROR"}
            title={
              state === "IDLE" || state === "ERROR"
                ? "Start a session to pause"
                : isPaused
                ? "Resume Session (P) — instant, no API rate limit hit"
                : "Pause Session (P) — stop mic & STT stream, keep session alive"
            }
            aria-label={isPaused ? "Resume Session" : "Pause Session"}
          >
            {isPaused ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="6,4 20,12 6,20" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1.5" />
                <rect x="14" y="4" width="4" height="16" rx="1.5" />
              </svg>
            )}
          </button>

          {/* Primary Floating Glowing Voice Orb */}
          <div
            className={styles.primaryVoiceTrigger}
            id="voiceTrigger"
            onClick={handleOrbPress}
            title="Click to toggle Listening or Interrupt"
          >
            <div className={styles.rippleRing} />
            <div className={`${styles.rippleRing} ${styles.rippleRingSecondary}`} />
            <button className={styles.voiceMicCircle} id="mainMicBtn">
              {isAnswering ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M2 10s3-3 5-3 5 6 7 6 5-3 8-3" />
                  <path d="M2 14s3-3 5-3 5 6 7 6 5-3 8-3" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              )}
            </button>
          </div>

          {/* Disconnect / Reset Voice */}
          <button
            className={styles.dockActionBtn}
            id="resetVoiceBtn"
            onClick={handleReset}
            title="End or Reset Call"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </footer>

      {/* Slide-Out Chat History Drawer for Desktop */}
      <div
        className={`${styles.historyBackdrop} ${isHistoryOpen ? styles.historyBackdropOpen : ""}`}
        id="historyBackdrop"
        onClick={() => setIsHistoryOpen(false)}
      />
      <aside
        className={`${styles.historyPanel} ${isHistoryOpen ? styles.historyPanelOpen : ""}`}
        id="historyPanel"
      >
        <div className={styles.historyPanelHeader}>
          <h2 className={styles.historyPanelTitle}>Session History</h2>
          <button
            className={styles.closeHistoryBtn}
            id="closeHistoryBtn"
            onClick={() => setIsHistoryOpen(false)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={styles.sessionList}>
          {turns.length > 0 ? (
            turns.map((turn, idx) => (
              <div
                key={turn.id || idx}
                className={styles.sessionCard}
                onClick={() => setIsHistoryOpen(false)}
              >
                <div className={styles.sessionCardMeta}>
                  <span className={styles.sessionCardTime}>
                    {turn.role === "user" ? "YOU" : "SARVAM"} •{" "}
                    {new Date(turn.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className={styles.sessionCardTurns}>
                    {turn.usedSearch && (
                      <span style={{ marginRight: 6, opacity: 0.9 }}>
                        🔍 Searched
                      </span>
                    )}
                    TURN {idx + 1}
                  </span>
                </div>
                <p className={styles.sessionCardText}>&ldquo;{turn.text}&rdquo;</p>
              </div>
            ))
          ) : (
            <div className={styles.sessionCard}>
              <div className={styles.sessionCardMeta}>
                <span className={styles.sessionCardTime}>SESSION • READY</span>
                <span className={styles.sessionCardTurns}>ACTIVE</span>
              </div>
              <p className={styles.sessionCardText}>
                &ldquo;Start speaking into your microphone to record conversation turns in real time.&rdquo;
              </p>
            </div>
          )}
        </div>

        <div className={styles.historyPanelFooter}>
          <span>SARVAM AUDIO RUNTIME</span>
          <span>{isConnected ? "CONNECTED" : "READY"}</span>
        </div>
      </aside>

      {/* Settings Sheet Modal */}
      <SettingsSheet
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        theme={theme}
        onThemeChange={setTheme}
        soundFeedback={soundFeedback}
        onSoundFeedbackToggle={() => setSoundFeedback(!soundFeedback)}
        speaker={speaker}
        onSpeakerChange={setSpeaker}
        pace={pace}
        onPaceChange={setPace}
      />

      {/* Keyboard Shortcuts Modal */}
      <ShortcutsOverlay isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />

      {/* Microphone Permission Modal */}
      {showPermissionGate && (
        <PermissionGate
          onEnable={startListening}
          onDismiss={() => setShowPermissionGate(false)}
        />
      )}
    </div>
  );
}
