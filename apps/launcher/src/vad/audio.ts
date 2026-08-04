import { YIN } from 'pitchfinder';
import type { ProsodyFeatures } from './types';

export type AudioStatus =
  | { state: 'idle' }
  | { state: 'starting' }
  | { state: 'running' }
  | { state: 'error'; message: string };

const SAMPLE_RATE = 44_100;
const REPORT_INTERVAL_MS = 120;

/**
 * Live prosody extraction (hito 6.3): pitch via YIN (pitchfinder),
 * energy via RMS in dB, cadence via zero-crossing rate mapped to syll/s.
 */
export class AudioProsodyAnalyzer {
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private detectPitch: ((buffer: Float32Array) => number | null) | null = null;
  private data: Float32Array<ArrayBuffer> | null = null;
  private rafId = 0;
  private lastReport = 0;
  private onFeatures: ((features: ProsodyFeatures) => void) | null = null;
  status: AudioStatus = { state: 'idle' };

  async start(onFeatures: (features: ProsodyFeatures) => void): Promise<void> {
    this.onFeatures = onFeatures;
    this.status = { state: 'starting' };
    try {
      this.context = new AudioContext({ sampleRate: SAMPLE_RATE });
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false },
      });
      const source = this.context.createMediaStreamSource(this.stream);
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.5;
      source.connect(this.analyser);
      this.data = new Float32Array(new ArrayBuffer(this.analyser.fftSize * 4));
      this.detectPitch = YIN({ sampleRate: SAMPLE_RATE }) as (
        buffer: Float32Array,
      ) => number | null;
      this.status = { state: 'running' };
      this.loop();
    } catch (error) {
      this.status = {
        state: 'error',
        message: error instanceof Error ? error.message : String(error),
      };
      this.stop();
    }
  }

  stop() {
    cancelAnimationFrame(this.rafId);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    void this.context?.close().catch(() => undefined);
    this.context = null;
    this.analyser = null;
    this.data = null;
    this.detectPitch = null;
    this.onFeatures = null;
    this.status = { state: 'idle' };
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  private loop = () => {
    this.rafId = requestAnimationFrame(this.loop);
    if (!this.analyser || !this.data) return;
    const now = performance.now();
    if (now - this.lastReport < REPORT_INTERVAL_MS) return;
    this.lastReport = now;
    this.analyser.getFloatTimeDomainData(this.data);
    const features = this.computeFeatures(this.data);
    this.onFeatures?.(features);
  };

  private computeFeatures(buffer: Float32Array): ProsodyFeatures {
    // Pitch (Hz) — null when unvoiced/too quiet.
    let pitchHz = 120;
    const pitch = this.detectPitch
      ? this.detectPitch(buffer as unknown as Float32Array<ArrayBuffer>)
      : null;
    if (pitch && pitch > 60 && pitch < 500) pitchHz = pitch;

    // RMS energy in dB (-30..0).
    let sumSquares = 0;
    let crossings = 0;
    for (let i = 1; i < buffer.length; i += 1) {
      const sample = buffer[i];
      sumSquares += sample * sample;
      if ((buffer[i - 1] < 0 && sample >= 0) || (buffer[i - 1] >= 0 && sample < 0)) {
        crossings += 1;
      }
    }
    const rms = Math.sqrt(sumSquares / buffer.length);
    const energyDb = rms > 0 ? 20 * Math.log10(rms) : -60;

    // Cadence: zero-crossing rate normalized to 0-10 syll/s (simulated mapping).
    const zcr = crossings / buffer.length;
    const speechRate = Math.max(0, Math.min(10, zcr * 140));

    return {
      pitchHz: Math.round(pitchHz),
      energyDb: Math.max(-30, Math.round(energyDb * 10) / 10),
      speechRate: Math.round(speechRate * 10) / 10,
    };
  }
}

/** Web Audio waveform visualization data (for the VAD panel). */
export function waveformData(analyzer: AnalyserNode | null, size = 96): number[] {
  if (!analyzer) return new Array<number>(size).fill(0);
  const data = new Uint8Array(analyzer.frequencyBinCount);
  analyzer.getByteFrequencyData(data);
  const step = Math.max(1, Math.floor(data.length / size));
  const out: number[] = [];
  for (let i = 0; i < size; i += 1) {
    out.push(data[i * step] / 255);
  }
  return out;
}
