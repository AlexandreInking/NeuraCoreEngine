import { useEffect, useRef, useState } from 'react';
import { AudioProsodyAnalyzer, waveformData, type AudioStatus } from './audio';
import type { ProsodyFeatures } from './types';

/**
 * Live microphone panel (hito 6.3): pitch/energy/cadence in real time,
 * feeding the VAD simulator through `onFeatures`.
 */
export function VadLivePanel({
  onFeatures,
}: {
  onFeatures: (features: ProsodyFeatures | null) => void;
}) {
  const analyzerRef = useRef<AudioProsodyAnalyzer | null>(null);
  const [status, setStatus] = useState<AudioStatus>({ state: 'idle' });
  const [features, setFeatures] = useState<ProsodyFeatures | null>(null);
  const [wave, setWave] = useState<number[]>(new Array<number>(48).fill(0));

  const running = status.state === 'running';

  const start = async () => {
    const analyzer = new AudioProsodyAnalyzer();
    analyzerRef.current = analyzer;
    await analyzer.start((next) => {
      setFeatures(next);
      onFeatures(next);
    });
    setStatus(analyzer.status);
    if (analyzer.status.state === 'error') {
      onFeatures(null);
    }
  };

  const stop = () => {
    analyzerRef.current?.stop();
    analyzerRef.current = null;
    setStatus({ state: 'idle' });
    setFeatures(null);
    onFeatures(null);
  };

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      const analyser = analyzerRef.current?.getAnalyser();
      if (analyser) setWave(waveformData(analyser, 48));
    }, 150);
    return () => clearInterval(timer);
  }, [running]);

  useEffect(() => () => analyzerRef.current?.stop(), []);

  return (
    <section className="l1-section vad-live-panel">
      <div className="cognitive-section-heading">
        <span className="section-kicker">PROSODIA EN VIVO</span>
        <span className="panel-caption">
          {running ? 'CAPTURANDO MICRÓFONO' : status.state === 'error' ? 'ERROR' : 'MICRÓFONO'}
        </span>
      </div>
      <div className="vad-engine-row">
        {running ? (
          <button className="button-ghost" type="button" onClick={stop}>
            Detener micrófono
          </button>
        ) : (
          <button className="button-primary" type="button" onClick={() => void start()}>
            Usar micrófono
          </button>
        )}
        {status.state === 'error' ? <p className="l1-error" role="alert">{status.message}</p> : null}
      </div>
      {running ? (
        <div className="vad-live-readout">
          <div className="vad-wave" aria-hidden="true">
            {wave.map((value, index) => (
              <span
                key={index}
                style={{ height: `${Math.max(8, value * 100)}%`, opacity: 0.4 + value * 0.6 }}
              />
            ))}
          </div>
          <div className="vad-prosody-values">
            <span>
              <strong>{features?.pitchHz ?? '—'}</strong> Hz pitch
            </span>
            <span>
              <strong>{features?.energyDb ?? '—'}</strong> dB energía
            </span>
            <span>
              <strong>{features?.speechRate ?? '—'}</strong> syll/s cadencia
            </span>
          </div>
          <p className="l1-note">
            La prosodia alimenta el simulador 3D como estímulo ΔVAD en cada tick.
          </p>
        </div>
      ) : (
        <p className="memory-search-empty">
          Activa el micrófono para extraer pitch (YIN), energía (RMS) y cadencia, y ver el
          VAD reaccionar a tu voz.
        </p>
      )}
    </section>
  );
}
