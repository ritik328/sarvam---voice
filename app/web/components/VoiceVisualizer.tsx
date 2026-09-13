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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 190;
    let height = 76;

    function resize() {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      width = Math.round(rect.width) || 190;
      height = Math.round(rect.height) || 76;
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
    let morphBlend = state === "ASSISTANT_SPEAKING" ? 0.0 : 1.0;
    const freqData = new Uint8Array(64);

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      const isAnswering = state === "ASSISTANT_SPEAKING";
      time += isAnswering ? 0.038 : 0.022;

      // Smooth lerp transition: 1.0 = Wave (Listening), 0.0 = Orb (Answering)
      const targetBlend = isAnswering ? 0.0 : 1.0;
      morphBlend += (targetBlend - morphBlend) * 0.08;

      // Extract real audio level for dynamic energy
      let audioEnergy = 0;
      const activeAnalyser = isAnswering ? getPlayerAnalyser() : getMicAnalyser();
      if (activeAnalyser) {
        activeAnalyser.getByteFrequencyData(freqData);
        let sum = 0;
        for (let i = 0; i < 32; i++) {
          sum += freqData[i];
        }
        audioEnergy = (sum / 32) / 255; // 0.0 to 1.0
      }

      /* -------------------------------------------------------------
         MODE A: SILK WAVE (LISTENING MODE)
         Clean, sleek harmonic wave ribbons across the compact widget
         ------------------------------------------------------------- */
      if (morphBlend > 0.01) {
        ctx.save();
        ctx.globalAlpha = morphBlend;

        const centerY = height * 0.5;
        const strandCount = 24;
        const step = 4;
        const boost = 1 + audioEnergy * 1.3;

        for (let s = 0; s < strandCount; s++) {
          const offset = s / strandCount;
          const phase = time * 1.7 + offset * Math.PI * 2;

          ctx.beginPath();
          for (let x = 0; x <= width; x += step) {
            const nx = x / width;
            const env = Math.pow(Math.sin(nx * Math.PI), 0.8);

            const w1 = Math.sin(nx * 5.2 + phase) * (12 * boost);
            const w2 = Math.cos(nx * 8.4 - time * 2.2 + s * 0.18) * (7 * boost);
            const w3 = Math.sin(nx * 13.0 + time * 1.1) * (3.5 * boost);

            const y = centerY + (w1 + w2 + w3) * env + (offset - 0.5) * 14;

            if (x === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }

          const grad = ctx.createLinearGradient(0, centerY - 20, width, centerY + 20);
          grad.addColorStop(0.0, `rgba(139, 92, 246, ${0.15 + offset * 0.4})`);
          grad.addColorStop(0.3, `rgba(236, 72, 153, ${0.45 + offset * 0.45})`);
          grad.addColorStop(0.7, `rgba(6, 182, 212, ${0.35 + offset * 0.4})`);
          grad.addColorStop(1.0, `rgba(139, 92, 246, ${0.2 + offset * 0.3})`);

          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }

        ctx.restore();
      }

      /* -------------------------------------------------------------
         MODE B: COMPACT HARMONIC ORB (ANSWERING MODE)
         Mini iridescent filament orb centered right above session badge
         ------------------------------------------------------------- */
      const orbAlpha = 1.0 - morphBlend;
      if (orbAlpha > 0.01) {
        ctx.save();
        ctx.globalAlpha = orbAlpha;

        const centerX = width / 2;
        const centerY = height / 2;
        const baseRadius = Math.min(width, height) * 0.35;
        const orbRadius = baseRadius * (1 + audioEnergy * 0.25);
        const rings = 22;

        for (let r = 0; r < rings; r++) {
          const ringAngle = (r / rings) * Math.PI;
          const currentRingR = orbRadius * Math.sin(ringAngle);
          const yOffset = orbRadius * Math.cos(ringAngle) * 0.75;

          ctx.beginPath();
          const segments = 60;
          for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * Math.PI * 2;

            const deform =
              Math.sin(theta * 6 + time * 3.0 + r * 0.35) *
              Math.cos(ringAngle * 4 - time * 2.0) *
              (orbRadius * (0.15 + audioEnergy * 0.15));

            const rad = currentRingR + deform;
            const x = centerX + Math.cos(theta + time * 0.6) * rad;
            const y = centerY + yOffset + Math.sin(theta + time * 0.6) * (rad * 0.36);

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
  }, [state, getMicAnalyser, getPlayerAnalyser]);

  return (
    <div
      className={styles.visualizerStage}
      onClick={onStageClick}
      title="Voice Visualizer (Click to interact)"
      role="img"
      aria-label="Audio Visualizer"
    >
      <canvas id="voiceVisualizer" ref={canvasRef} className={styles.voiceVisualizer} />
    </div>
  );
}
