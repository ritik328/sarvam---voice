"use client";

import React, { useEffect, useRef, useState } from "react";
import { TranscriptTurn } from "../hooks/useVoiceSession";
import styles from "./TranscriptFeed.module.css";

interface TranscriptFeedProps {
  turns: TranscriptTurn[];
  partialTranscript: string;
  assistantText: string;
  isAssistantSpeaking: boolean;
}

export function TranscriptFeed({
  turns,
  partialTranscript,
  assistantText,
  isAssistantSpeaking,
}: TranscriptFeedProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const userScrolledUpRef = useRef(false);
  const scrollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [copied, setCopied] = useState(false);

  const hasContent =
    turns.length > 0 || partialTranscript.length > 0 || assistantText.length > 0;

  // Auto-scroll handler
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 60;

    if (!isNearBottom) {
      userScrolledUpRef.current = true;
      setShowScrollBottom(true);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = setTimeout(() => {
        userScrolledUpRef.current = false;
      }, 3500);
    } else {
      userScrolledUpRef.current = false;
      setShowScrollBottom(false);
    }
  };

  const scrollToBottom = () => {
    if (!containerRef.current) return;
    containerRef.current.scrollTo({
      top: containerRef.current.scrollHeight,
      behavior: "smooth",
    });
    userScrolledUpRef.current = false;
    setShowScrollBottom(false);
  };

  // Scroll to bottom when new turns or streaming chunks arrive, unless user scrolled up
  useEffect(() => {
    if (!userScrolledUpRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [turns, partialTranscript, assistantText]);

  const copyConversation = async () => {
    const lines = turns.map(
      (t) => `${t.role === "user" ? "You" : "Sarvam"}: ${t.text}`
    );
    if (partialTranscript) lines.push(`You: ${partialTranscript}`);
    if (assistantText) lines.push(`Sarvam: ${assistantText}`);

    try {
      await navigator.clipboard.writeText(lines.join("\n\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <section className={styles.wrapper} aria-label="Conversation transcript">
      {/* Fade overlay on top for smooth scroll boundary */}
      <div className={styles.fadeOverlay} aria-hidden="true" />

      {/* Main scrollable feed */}
      <div
        ref={containerRef}
        className={styles.feedContainer}
        onScroll={handleScroll}
      >
        {!hasContent ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyHint}>Tap the orb and just ask</p>
          </div>
        ) : (
          <div className={styles.turnsList}>
            {turns.map((turn) => (
              <div
                key={turn.id}
                className={styles.turnRow}
                data-role={turn.role}
                data-interrupted={turn.isInterrupted}
              >
                <div className={styles.turnHeader}>
                  <span
                    className={styles.roleLabel}
                    style={{
                      color:
                        turn.role === "user" ? "var(--user)" : "var(--ai)",
                    }}
                  >
                    {turn.role === "user" ? "You" : "Sarvam"}
                  </span>
                  <span className={styles.timestamp}>
                    {new Date(turn.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p
                  className={`${styles.turnText} ${
                    turn.isInterrupted ? styles.interruptedText : ""
                  }`}
                >
                  {turn.text}
                </p>
              </div>
            ))}

            {/* In-progress User turn (partial transcript) */}
            {partialTranscript && (
              <div className={styles.turnRow} data-role="user">
                <div className={styles.turnHeader}>
                  <span
                    className={styles.roleLabel}
                    style={{ color: "var(--user)" }}
                  >
                    You
                  </span>
                </div>
                <p className={styles.partialText}>{partialTranscript}</p>
              </div>
            )}

            {/* In-progress Assistant turn (streaming text) */}
            {assistantText && (
              <div className={styles.turnRow} data-role="assistant">
                <div className={styles.turnHeader}>
                  <span
                    className={styles.roleLabel}
                    style={{ color: "var(--ai)" }}
                  >
                    Sarvam
                  </span>
                </div>
                <p className={styles.turnText}>
                  {assistantText}
                  {isAssistantSpeaking && <span className={styles.typingCursor} />}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* "↓ latest" pill button when user scrolls up */}
      {showScrollBottom && (
        <button
          className={styles.scrollLatestBtn}
          onClick={scrollToBottom}
          aria-label="Scroll to latest message"
        >
          ↓ latest
        </button>
      )}

      {/* Copy transcript action */}
      {hasContent && (
        <button
          className={styles.copyBtn}
          onClick={copyConversation}
          aria-label="Copy transcript to clipboard"
          title="Copy full transcript"
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      )}
    </section>
  );
}
