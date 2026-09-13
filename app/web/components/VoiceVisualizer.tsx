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

    let width = window.innerWidth;
    let height = window.innerHeight;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;
      if (canvas) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx?.scale(dpr, dpr);
      }
    }

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
         MODE A: EDGE-TO-EDGE SEAMLESS SILK WAVE (LISTENING MODE)
         Spans from x = 0 all the way to x = width across the screen.
         ------------------------------------------------------------- */
      if (morphBlend > 0.01) {
        ctx.save();
        ctx.globalAlpha = morphBlend;

        const centerY = height * 0.44;
        const strandCount = 36;
        const step = 8;
        const boost = 1 + audioEnergy * 1.6;

        for (let s = 0; s < strandCount; s++) {
          const offset = s / strandCount;
          const phase = time * 1.7 + offset * Math.PI * 2;

          ctx.beginPath();
          for (let x = 0; x <= width; x += step) {
            const nx = x / width;
            const env = Math.pow(Math.sin(nx * Math.PI), 0.7);

            const w1 = Math.sin(nx * 5.2 + phase) * (44 * boost);
            const w2 = Math.cos(nx * 8.4 - time * 2.2 + s * 0.18) * (26 * boost);
            const w3 = Math.sin(nx * 13.0 + time * 1.1) * (14 * boost);

            const y = centerY + (w1 + w2 + w3) * env + (offset - 0.5) * 60;

            if (x === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }

          const grad = ctx.createLinearGradient(0, centerY - 60, width, centerY + 60);
          grad.addColorStop(0.0, `rgba(139, 92, 246, ${0.15 + offset * 0.4})`);
          grad.addColorStop(0.3, `rgba(236, 72, 153, ${0.45 + offset * 0.45})`);
          grad.addColorStop(0.7, `rgba(6, 182, 212, ${0.35 + offset * 0.4})`);
          grad.addColorStop(1.0, `rgba(139, 92, 246, ${0.2 + offset * 0.3})`);

          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }

        ctx.restore();
      }

      /* -------------------------------------------------------------
         MODE B: 3D IRIDESCENT HARMONIC ORB (ANSWERING MODE)
         Undulating organic spherical filament rings in center.
         ------------------------------------------------------------- */
      const orbAlpha = 1.0 - morphBlend;
      if (orbAlpha > 0.01) {
        ctx.save();
        ctx.globalAlpha = orbAlpha;

        const centerX = width / 2;
        const centerY = height * 0.44;
        const baseRadius = Math.min(width, height) * 0.16;
        const orbRadius = baseRadius * (1 + audioEnergy * 0.3);
        const rings = 30;

        for (let r = 0; r < rings; r++) {
          const ringAngle = (r / rings) * Math.PI;
          const currentRingR = orbRadius * Math.sin(ringAngle);
          const yOffset = orbRadius * Math.cos(ringAngle) * 0.88;

          ctx.beginPath();
          const segments = 80;
          for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * Math.PI * 2;

            const deform =
              Math.sin(theta * 6 + time * 3.0 + r * 0.35) *
              Math.cos(ringAngle * 4 - time * 2.0) *
              (orbRadius * (0.18 + audioEnergy * 0.2));

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

          ctx.strokeStyle = `rgba(${rColor}, ${gColor}, ${bColor}, ${0.35 + Math.sin(time + r) * 0.2})`;
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }

        ctx.restore();
      }

      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);

    return () => {
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
      title="Click anywhere on visualizer stage to interact"
    >
      <canvas id="voiceVisualizer" ref={canvasRef} className={styles.voiceVisualizer} />
    </div>
  );
}
