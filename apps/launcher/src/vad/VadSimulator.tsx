import { useEffect, useRef, useState } from 'react';
import {
  vadStep,
  EkfVadEngine,
  vadQuadrant,
  uiHexFor,
  prosodyToStimulus,
  QUADRANT_PRESETS,
  DEFAULT_EKF_CONFIG,
  DEFAULT_VAD_CONFIG,
  type ProsodyFeatures,
  type VadState,
} from './index';
import { VadSphere3D } from './VadSphere3D';

const AUTO_TICK_MS = 500;

function VadReadout({ vad, label }: { vad: VadState; label: string }) {
  const quadrant = QUADRANT_PRESETS[vadQuadrant(vad)];
  const hex = uiHexFor(vad);
  return (
    <div className="vad-readout">
      <span className="vad-quadrant-label">{label}</span>
      <span className="vad-quadrant-tag" style={{ background: hex }}>
        {quadrant.label}
      </span>
      <code>
        V {vad.valence.toFixed(2)} · A {vad.arousal.toFixed(2)} · D{' '}
        {vad.dominance.toFixed(2)}
      </code>
    </div>
  );
}

/**
 * Affect Engine simulator (hito 6.1/6.2/6.5): stimulus sliders, manual &
 * auto ticks (500ms), EKF toggle with two spheres (plain vs EKF) and Q/R.
 */
export function VadSimulator({ liveProsody }: { liveProsody?: ProsodyFeatures | null }) {
  const [plain, setPlain] = useState<VadState>({ valence: 0, arousal: 0, dominance: 0 });
  const [stimulus, setStimulus] = useState({ dV: 0, dA: 0, dD: 0 });
  const [gamma, setGamma] = useState(DEFAULT_VAD_CONFIG.gamma);
  const [autoTick, setAutoTick] = useState(false);
  const [ekfMode, setEkfMode] = useState(false);
  const [q, setQ] = useState(DEFAULT_EKF_CONFIG.q);
  const [r, setR] = useState(DEFAULT_EKF_CONFIG.r);
  const ekfRef = useRef<EkfVadEngine | null>(null);
  const [ekfState, setEkfState] = useState<VadState>({ valence: 0, arousal: 0, dominance: 0 });
  const [, setTick] = useState(0);

  const config = { ...DEFAULT_VAD_CONFIG, gamma, noiseSigma: 0.005 };

  // Rebuild the EKF engine when its tuning changes (demo keeps filter state).
  useEffect(() => {
    ekfRef.current = new EkfVadEngine(config, { q, r });
    setEkfState(ekfRef.current.state());
  }, [gamma, q, r, config]);

  const applyTick = (delta: Partial<VadState>) => {
    const prosodyStimulus = liveProsody ? prosodyToStimulus(liveProsody) : {};
    const merged = {
      valence: stimulus.dV + (delta.valence ?? 0) + (prosodyStimulus.valence ?? 0),
      arousal: stimulus.dA + (delta.arousal ?? 0) + (prosodyStimulus.arousal ?? 0),
      dominance: stimulus.dD + (delta.dominance ?? 0) + (prosodyStimulus.dominance ?? 0),
    };
    setPlain((current) => vadStep(current, config, merged, AUTO_TICK_MS / 1000));
    if (ekfRef.current) {
      ekfRef.current.fuse({ kind: 'manual', delta: merged }, AUTO_TICK_MS / 1000);
      setEkfState(ekfRef.current.state());
    }
  };

  useEffect(() => {
    if (!autoTick) return;
    const timer = setInterval(() => applyTick({}), AUTO_TICK_MS);
    return () => clearInterval(timer);
  }, [autoTick, stimulus, gamma, q, r, config]);

  const manualTick = () => {
    applyTick({});
    setTick((value) => value + 1);
  };

  const reset = () => {
    setPlain({ valence: 0, arousal: 0, dominance: 0 });
    ekfRef.current = new EkfVadEngine(config, { q, r });
    setEkfState({ valence: 0, arousal: 0, dominance: 0 });
  };
  const slider = (
    label: string,
    key: 'dV' | 'dA' | 'dD',
  ) => (
    <label className="vad-slider">
      <span>Δ{label}</span>
      <input
        type="range"
        min={-1}
        max={1}
        step={0.05}
        value={stimulus[key]}
        onChange={(event) =>
          setStimulus((current) => ({ ...current, [key]: Number(event.target.value) }))
        }
      />
      <code>{stimulus[key].toFixed(2)}</code>
    </label>
  );

  return (
    <div className="vad-simulator">
      <div className="vad-sim-controls">
        <div className="vad-slider-group">
          {slider('V', 'dV')}
          {slider('A', 'dA')}
          {slider('D', 'dD')}
        </div>
        <label className="vad-slider">
          <span>γ (inercia)</span>
          <input
            type="range"
            min={0.01}
            max={0.99}
            step={0.01}
            value={gamma}
            onChange={(event) => setGamma(Number(event.target.value))}
          />
          <code>{gamma.toFixed(2)}</code>
        </label>
        <div className="vad-sim-actions">
          <button className="button-primary" type="button" onClick={manualTick}>
            Tick manual
          </button>
          <label className="vad-toggle">
            <input
              type="checkbox"
              checked={autoTick}
              onChange={(event) => setAutoTick(event.target.checked)}
            />
            <span className="vad-toggle-track" aria-hidden="true" />
            Auto-tick {AUTO_TICK_MS}ms
          </label>
          <label className="vad-toggle">
            <input
              type="checkbox"
              checked={ekfMode}
              onChange={(event) => setEkfMode(event.target.checked)}
            />
            <span className="vad-toggle-track" aria-hidden="true" />
            Modo EKF
          </label>
          <button className="memory-action" type="button" onClick={reset}>
            Reset
          </button>
        </div>
        {ekfMode ? (
          <div className="vad-ekf-sliders">
            <label className="vad-slider">
              <span>Q (ruido proceso)</span>
              <input
                type="range"
                min={0.0001}
                max={0.02}
                step={0.0001}
                value={q}
                onChange={(event) => setQ(Number(event.target.value))}
              />
              <code>{q.toFixed(4)}</code>
            </label>
            <label className="vad-slider">
              <span>R (ruido medición)</span>
              <input
                type="range"
                min={0.005}
                max={0.5}
                step={0.005}
                value={r}
                onChange={(event) => setR(Number(event.target.value))}
              />
              <code>{r.toFixed(3)}</code>
            </label>
          </div>
        ) : null}
      </div>

      <div className={`vad-spheres ${ekfMode ? 'dual' : ''}`}>
        <div className="vad-sphere-cell">
          <VadSphere3D vad={plain} color={uiHexFor(plain)} intensity={Math.abs(plain.valence) * 0.5 + 0.6} />
          <VadReadout vad={plain} label="VAD" />
        </div>
        {ekfMode ? (
          <div className="vad-sphere-cell">
            <VadSphere3D vad={ekfState} color={uiHexFor(ekfState)} intensity={Math.abs(ekfState.valence) * 0.5 + 0.6} />
            <VadReadout vad={ekfState} label="VAD + EKF" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
