import type { EkfConfig, VadAxis, VadConfig, VadSource, VadState } from './types';
import { clamp11, gaussianNoise, stimulusOf } from './core';

type AxisFilter = { p: number; x: number };

/**
 * Extended Kalman Filter (hito 6.5) — one scalar filter per VAD axis.
 * Dynamics: exponential decay toward baseline (F = e^(−γ·Δt)).
 * Measurements: audio prosody and lexical analysis are fused sequentially,
 * so the filter trusts whichever source has the lower R (measurement noise).
 */
export class EkfVadEngine {
  private filters: Record<VadAxis, AxisFilter> = {
    valence: { p: 1, x: 0 },
    arousal: { p: 1, x: 0 },
    dominance: { p: 1, x: 0 },
  };

  constructor(
    private readonly config: VadConfig,
    private readonly ekf: EkfConfig,
  ) {}

  state(): VadState {
    return {
      valence: this.filters.valence.x,
      arousal: this.filters.arousal.x,
      dominance: this.filters.dominance.x,
    };
  }

  /** Prediction step: decay toward baseline with process noise. */
  predict(dtSeconds: number): VadState {
    const factor = Math.exp(-this.config.gamma * dtSeconds);
    for (const axis of ['valence', 'arousal', 'dominance'] as const) {
      const filter = this.filters[axis];
      const target = this.config.baseline[axis];
      filter.x = target + (filter.x - target) * factor;
      filter.p = factor * filter.p * factor + this.ekf.q;
    }
    return this.state();
  }

  /** Update step with a measurement z for one axis (R = ekf.r). */
  update(axis: VadAxis, z: number): VadState {
    const filter = this.filters[axis];
    const h = 1;
    const s = h * filter.p * h + this.ekf.r; // innovation covariance
    const k = (filter.p * h) / s; // Kalman gain
    filter.x = filter.x + k * (z - h * filter.x);
    filter.p = (1 - k * h) * filter.p;
    return this.state();
  }

  /** Fuse a stimulus source: first predict, then update each axis present. */
  fuse(source: VadSource, dtSeconds: number): VadState {
    this.predict(dtSeconds);
    const delta = stimulusOf(source);
    for (const axis of ['valence', 'arousal', 'dominance'] as const) {
      const value = delta[axis];
      if (value !== undefined) {
        this.update(axis, this.filters[axis].x + clamp11(value));
      }
    }
    return this.state();
  }

  /** Sequential fusion of two sources (audio + lexical), hito 6.5. */
  fuseTwo(sources: [VadSource, VadSource], dtSeconds: number): VadState {
    this.predict(dtSeconds);
    for (const source of sources) {
      const delta = stimulusOf(source);
      for (const axis of ['valence', 'arousal', 'dominance'] as const) {
        const value = delta[axis];
        if (value !== undefined) {
          this.update(axis, this.filters[axis].x + clamp11(value));
        }
      }
    }
    return this.state();
  }

  /** Add process noise to the state (optional jitter for realism). */
  addNoise(): VadState {
    for (const axis of ['valence', 'arousal', 'dominance'] as const) {
      const filter = this.filters[axis];
      filter.x = clamp11(filter.x + gaussianNoise(this.config.noiseSigma));
    }
    return this.state();
  }
}
