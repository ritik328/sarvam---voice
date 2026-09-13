/**
 * AudioPlayer
 *
 * Manages a Web Audio playback queue for streaming TTS audio chunks.
 * Each chunk is WAV bytes (base64) that get decoded and queued for
 * gapless sequential playback.
 *
 * Fires onFirstAudio() callback when the very first audio chunk plays
 * (used for TTFAR measurement).
 */
export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private _nextStartTime = 0;
  private _playing = false;
  private _cancelled = false;

  /** Fires when first audio sample starts playing */
  onFirstAudio: (() => void) | null = null;
  /** Fires when audio queue drains */
  onQueueEmpty: (() => void) | null = null;
  /** Fires when a chunk starts playing, providing its text and playback duration in ms */
  onChunkPlaybackStart: ((text: string, durationMs: number) => void) | null = null;

  private _isClosed = false;
  private _firstAudioFired = false;
  private _decodingCount = 0;
  private _activeNodes: AudioBufferSourceNode[] = [];
  private _playbackTimers: ReturnType<typeof setTimeout>[] = [];
  private analyser: AnalyserNode | null = null;
  private _drainTimer: ReturnType<typeof setTimeout> | null = null;

  get isPlaying(): boolean {
    return this._playing || this._decodingCount > 0 || this._activeNodes.length > 0;
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  getAudioLevel(): number {
    if (!this.analyser || !this._playing) return 0;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const normalized = (data[i] - 128) / 128;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / data.length);
    return Math.min(1, rms * 3.5);
  }

  /**
   * Ensure AudioContext is created and resumed.
   * Must be called from a user gesture to unlock autoplay.
   */
  async ensureContext(): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
    if (!this.analyser && this.audioContext) {
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.8;
      this.analyser.connect(this.audioContext.destination);
    }
  }

  /**
   * Decode and enqueue a WAV audio chunk (base64-encoded bytes).
   * Chunks play sequentially without gaps.
   * Schedules onChunkPlaybackStart at the exact start time of playback.
   */
  async enqueue(base64Audio: string, textChunk: string = ""): Promise<void> {
    if (this._cancelled || this._isClosed || !base64Audio) return;
    if (this._drainTimer) {
      clearTimeout(this._drainTimer);
      this._drainTimer = null;
    }
    await this.ensureContext();
    if (!this.audioContext || !this.analyser) return;

    // Capture context reference locally before any await
    const ctx = this.audioContext;

    this._decodingCount++;
    try {
      // Decode base64 → ArrayBuffer
      const binaryStr = atob(base64Audio);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      if (ctx.state === "closed") return;

      const audioBuffer = await ctx.decodeAudioData(bytes.buffer);

      // Re-check after the await — close() or interrupt may have run during decode
      if (
        this._cancelled ||
        this._isClosed ||
        this.audioContext !== ctx ||
        (ctx.state as string) === "closed" ||
        !this.analyser
      ) {
        return;
      }

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.analyser);

      // Schedule gapless playback
      const now = ctx.currentTime;
      const startAt = Math.max(now, this._nextStartTime);
      this._nextStartTime = startAt + audioBuffer.duration;

      source.start(startAt);
      this._playing = true;
      this._activeNodes.push(source);

      const delayMs = Math.max(0, (startAt - now) * 1000);
      const durationMs = audioBuffer.duration * 1000;

      // Fire first audio callback
      if (!this._firstAudioFired) {
        this._firstAudioFired = true;
        setTimeout(() => this.onFirstAudio?.(), delayMs);
      }

      // Schedule text reveal at the exact moment audio playback begins
      if (textChunk) {
        const timer = setTimeout(() => {
          if (!this._cancelled && !this._isClosed) {
            this.onChunkPlaybackStart?.(textChunk, durationMs);
          }
        }, delayMs);
        this._playbackTimers.push(timer);
      }

      source.onended = () => {
        this._activeNodes = this._activeNodes.filter((n) => n !== source);
        if (this._activeNodes.length === 0 && this._decodingCount === 0) {
          // Debounce: wait 150ms before declaring the queue empty
          // in case the next chunk is currently being decoded by decodeAudioData
          if (this._drainTimer) clearTimeout(this._drainTimer);
          this._drainTimer = setTimeout(() => {
            if (this._activeNodes.length === 0 && this._decodingCount === 0) {
              this._playing = false;
              this.onQueueEmpty?.();
            }
          }, 150);
        }
      };
    } catch (e) {
      // Only log if we weren't closed mid-decode (that's expected, not an error)
      if (this.audioContext === ctx) {
        console.error("AudioPlayer: decode error", e);
      }
    } finally {
      this._decodingCount--;
    }
  }

  /**
   * Cancel all queued and playing audio immediately.
   * Call this on interruption.
   */
  cancelAndFlush(): void {
    if (this._drainTimer) {
      clearTimeout(this._drainTimer);
      this._drainTimer = null;
    }
    for (const timer of this._playbackTimers) {
      clearTimeout(timer);
    }
    this._playbackTimers = [];

    this._cancelled = true;
    this._playing = false;
    this._nextStartTime = 0;

    for (const node of this._activeNodes) {
      try {
        node.stop();
        node.disconnect();
      } catch (_) {
        // Ignore already-stopped nodes
      }
    }
    this._activeNodes = [];

    // Reset for next turn
    setTimeout(() => {
      if (!this._isClosed) {
        this._cancelled = false;
        this._firstAudioFired = false;
        if (this.audioContext) {
          this._nextStartTime = this.audioContext.currentTime;
        }
      }
    }, 50);
  }

  /** Reset first-audio tracking for a new turn. */
  resetForNewTurn(): void {
    for (const timer of this._playbackTimers) {
      clearTimeout(timer);
    }
    this._playbackTimers = [];
    this._firstAudioFired = false;
    this._cancelled = false;
    if (this.audioContext) {
      this._nextStartTime = this.audioContext.currentTime;
    }
  }

  async close(): Promise<void> {
    this._isClosed = true;
    this._cancelled = true; // Blocks new enqueues immediately
    for (const timer of this._playbackTimers) {
      clearTimeout(timer);
    }
    this._playbackTimers = [];
    this.cancelAndFlush();
    this.analyser?.disconnect();
    this.analyser = null;
    if (this.audioContext && this.audioContext.state !== "closed") {
      await this.audioContext.close();
    }
    this.audioContext = null;
  }
}
