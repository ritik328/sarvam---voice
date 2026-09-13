"use client";

import React, { useEffect, useRef } from "react";
import { VoiceState } from "../hooks/useVoiceSession";
import styles from "./VoiceVisualizer.module.css";

interface VoiceVisualizerProps {
  state: VoiceState;
  getMicAnalyser: () => AnalyserNode | null;
  getPlayerAnalyser: () => AnalyserNode | null;
  onStageClick?: () => void;
}

export function VoiceVisualizer({
  state,
  getMicAnalyser,
  getPlayerAnalyser,
  onStageClick,
}: VoiceVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number | null>(null);

  const isSpeaking = state === "ASSISTANT_SPEAKING";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 120;
    let height = 72;

    function resize() {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      width = Math.round(rect.width) || 120;
      height = Math.round(rect.height) || 72;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx?.setTransform(1, 0, 0, 1, 0, 0);
      ctx?.scale(dpr, dpr);
    }

    const resizeObserver = new ResizeObserver(() => {
      resize();
    });
    resizeObserver.observe(canvas);
    window.addEventListener("resize", resize);
    resize();

    let time = 0;
    let alpha = isSpeaking ? 1.0 : 0.0;
    const freqData = new Uint8Array(64);

    const render = () => {
      // Smooth alpha fade: 1.0 only when LLM is actively speaking
      const targetAlpha = state === "ASSISTANT_SPEAKING" ? 1.0 : 0.0;
      alpha += (targetAlpha - alpha) * 0.12;

      ctx.clearRect(0, 0, width, height);

      // Render ONLY the 3D Iridescent Harmonic Orb when the assistant is speaking
      if (alpha > 0.01) {
        time += 0.038;

        // Extract real audio frequency energy from the assistant player analyser
        let audioEnergy = 0;
        const playerAnalyser = getPlayerAnalyser();
        if (playerAnalyser) {
          playerAnalyser.getByteFrequencyData(freqData);
          let sum = 0;
          for (let i = 0; i < 32; i++) {
            sum += freqData[i];
          }
          audioEnergy = (sum / 32) / 255;
        }

        ctx.save();
        ctx.globalAlpha = Math.min(1.0, Math.max(0.0, alpha));

        const centerX = width / 2;
        const centerY = height / 2;
        const baseRadius = Math.min(width, height) * 0.35;
        const orbRadius = baseRadius * (1 + audioEnergy * 0.28);
        const rings = 26;

        for (let r = 0; r < rings; r++) {
          const ringAngle = (r / rings) * Math.PI;
          const currentRingR = orbRadius * Math.sin(ringAngle);
          const yOffset = orbRadius * Math.cos(ringAngle) * 0.78;

          ctx.beginPath();
          const segments = 64;
          for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * Math.PI * 2;

            const deform =
              Math.sin(theta * 6 + time * 3.0 + r * 0.35) *
              Math.cos(ringAngle * 4 - time * 2.0) *
              (orbRadius * (0.16 + audioEnergy * 0.18));

            const rad = currentRingR + deform;
            const x = centerX + Math.cos(theta + time * 0.6) * rad;
            const y = centerY + yOffset + Math.sin(theta + time * 0.6) * (rad * 0.38);

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();

          const tVal = r / rings;
          let rColor: number, gColor: number, bColor: number;
          if (tVal < 0.5) {
            rColor = 249;
            gColor = Math.round(115 * (1 - tVal * 2));
            bColor = Math.round(220 * (tVal * 2));
          } else {
            rColor = Math.round(139 + 97 * (tVal - 0.5) * 2);
            gColor = 92;
            bColor = 246;
          }

          ctx.strokeStyle = `rgba(${rColor}, ${gColor}, ${bColor}, ${0.38 + Math.sin(time + r) * 0.2})`;
          ctx.lineWidth = 1.3;
          ctx.stroke();
        }

        ctx.restore();
      }

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", resize);
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
      }
    };
  }, [state, getMicAnalyser, getPlayerAnalyser, isSpeaking]);

  return (
    <div
      className={`${styles.visualizerStage} ${isSpeaking ? styles.visualizerStageSpeaking : ""}`}
      onClick={onStageClick}
      title={isSpeaking ? "Assistant Speaking Visualizer (Click to interact)" : undefined}
      role="img"
      aria-label="Assistant Speaking Visualizer"
    >
      <canvas id="voiceVisualizer" ref={canvasRef} className={styles.voiceVisualizer} />
    </div>
  );
}
