/**
 * AudioCaptureManager
 *
 * Manages microphone access, AudioContext, and AudioWorklet (with ScriptProcessor fallback).
 * Emits ~100ms frames of 16 kHz mono Linear16 PCM as base64 strings
 * via the onAudioChunk callback.
 */
export class AudioCaptureManager {
  private audioContext: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private _active = false;

  /** Called with base64-encoded raw PCM bytes (~100ms frames) */
  onAudioChunk: ((base64: string) => void) | null = null;

  get isActive(): boolean {
    return this._active;
  }

  /**
   * Request microphone, create AudioContext, load worklet, start capture.
   * Must be called from a user gesture event handler (for autoplay unlock).
   */
  async start(): Promise<void> {
    if (this._active) return;

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "Microphone access is not supported in this browser or requires a secure context (open http://localhost:3000)."
      );
    }

    // 1. Request microphone with fallback for overconstrained audio hardware
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: { ideal: 16000 },
        },
      });
    } catch (err: unknown) {
      const e = err as { name?: string };
      if (
        e?.name === "NotAllowedError" ||
        e?.name === "PermissionDeniedError" ||
        e?.name === "NotFoundError" ||
        e?.name === "DevicesNotFoundError"
      ) {
        throw err;
      }
      // OverconstrainedError or unsupported constraint fallback
      console.warn("Detailed constraints failed, retrying with basic audio: true", err);
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }

    const AudioContextClass =
      window.AudioContext ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((window as any).webkitAudioContext as typeof AudioContext);

    this.audioContext = new AudioContextClass();

    // Resume context (needed for autoplay policy)
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 128;
    this.analyser.smoothingTimeConstant = 0.8;
    this.sourceNode.connect(this.analyser);

    // 2. Try AudioWorklet first, with ScriptProcessor fallback
    let workletInitialized = false;
    try {
      if (this.audioContext.audioWorklet) {
        await this.audioContext.audioWorklet.addModule("/audio-processor.worklet.js");
        this.workletNode = new AudioWorkletNode(
          this.audioContext,
          "audio-capture-processor"
        );

        this.workletNode.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
          if (!this._active) return;
          this.emitPcmBuffer(e.data);
        };

        this.sourceNode.connect(this.workletNode);
        workletInitialized = true;
      }
    } catch (workletErr) {
      console.warn("AudioWorklet failed, falling back to ScriptProcessorNode", workletErr);
    }

    if (!workletInitialized) {
      // Fallback: ScriptProcessorNode downsampler
      const inputRate = this.audioContext.sampleRate;
      const targetRate = 16000;
      const ratio = inputRate / targetRate;
      const frameSize = 1600; // ~100ms at 16kHz
      const resampleBuffer: number[] = [];

      this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
      this.scriptProcessor.onaudioprocess = (e: AudioProcessingEvent) => {
        if (!this._active) return;
        const channelData = e.inputBuffer.getChannelData(0);

        for (let i = 0; i < channelData.length; i += ratio) {
          const idx = Math.floor(i);
          if (idx < channelData.length) {
            resampleBuffer.push(channelData[idx]);
          }
        }

        while (resampleBuffer.length >= frameSize) {
          const frame = resampleBuffer.splice(0, frameSize);
          const pcm16 = new Int16Array(frameSize);
          for (let i = 0; i < frameSize; i++) {
            const s = Math.max(-1, Math.min(1, frame[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
          this.emitPcmBuffer(pcm16.buffer);
        }
      };

      this.sourceNode.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.audioContext.destination);
    }

    this._active = true;
  }

  private emitPcmBuffer(buffer: ArrayBuffer): void {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const len = bytes.byteLength;
    const chunkSize = 1024;
    for (let i = 0; i < len; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, len)));
    }
    const base64 = btoa(binary);
    this.onAudioChunk?.(base64);
  }

  private analyser: AnalyserNode | null = null;
  private _isMuted = false;

  get isMuted(): boolean {
    return this._isMuted;
  }

  setMuted(muted: boolean): void {
    this._isMuted = muted;
    if (this.stream) {
      this.stream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  /**
   * Quick RMS level reader (0.0 to 1.0)
   */
  getAudioLevel(): number {
    if (!this.analyser || this._isMuted) return 0;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const normalized = (data[i] - 128) / 128;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / data.length);
    return Math.min(1, rms * 3); // Amplify slightly for responsive visual feedback
  }

  /** Stop capture and clean up all resources. */
  async stop(): Promise<void> {
    this._active = false;

    this.workletNode?.disconnect();
    this.scriptProcessor?.disconnect();
    this.sourceNode?.disconnect();
    this.analyser?.disconnect();

    this.stream?.getTracks().forEach((t) => t.stop());

    if (this.audioContext && this.audioContext.state !== "closed") {
      await this.audioContext.close();
    }

    this.workletNode = null;
    this.scriptProcessor = null;
    this.sourceNode = null;
    this.analyser = null;
    this.stream = null;
    this.audioContext = null;
  }

  /**
   * Resume the AudioContext if it was suspended.
   */
  async resumeContext(): Promise<void> {
    if (this.audioContext?.state === "suspended") {
      await this.audioContext.resume();
    }
  }
}


