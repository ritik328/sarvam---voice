/**
 * AudioWorkletProcessor — captures mono PCM at the native sample rate and
 * downsamples to 16 kHz for Saaras realtime STT.
 *
 * Emits Int16Array frames of exactly FRAME_SIZE samples to the main thread.
 */
class AudioCaptureProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [];
  }

  constructor() {
    super();
    // Target sample rate for Saaras STT
    this._targetRate = 16000;
    // ~100 ms at 16 kHz = 1600 samples
    this._frameSize = 1600;
    // Resample buffer (float32)
    this._resampleBuffer = [];
    this._inputRate = 0; // set on first process()
    this._ratio = 1;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0]; // mono (channel 0)

    if (this._inputRate === 0) {
      this._inputRate = sampleRate; // global from AudioWorkletGlobalScope
      this._ratio = this._inputRate / this._targetRate;
    }

    // Simple linear downsampling
    for (let i = 0; i < channelData.length; i += this._ratio) {
      const idx = Math.floor(i);
      if (idx < channelData.length) {
        this._resampleBuffer.push(channelData[idx]);
      }
    }

    // Emit complete frames
    while (this._resampleBuffer.length >= this._frameSize) {
      const frame = this._resampleBuffer.splice(0, this._frameSize);
      // Convert float32 [-1,1] to Int16
      const pcm16 = new Int16Array(this._frameSize);
      for (let i = 0; i < this._frameSize; i++) {
        const s = Math.max(-1, Math.min(1, frame[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    }

    return true; // keep processor alive
  }
}

registerProcessor("audio-capture-processor", AudioCaptureProcessor);
