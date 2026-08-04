import { useMemo, useState } from 'react';
import {
  vadToSsml,
  vadQuadrant,
  QUADRANT_PRESETS,
  type VadState,
} from './index';

type SsmlEngine = 'web' | 'azure' | 'elevenlabs';

const ENGINE_LABELS: Record<SsmlEngine, string> = {
  web: 'Web Speech (nativo)',
  azure: 'Azure TTS (requiere key)',
  elevenlabs: 'ElevenLabs (requiere key)',
};

/**
 * SSML panel (hito 6.4): live SSML from the current VAD, engine selector
 * (Web Speech works offline; Azure/ElevenLabs are placeholders) and preview.
 */
export function SsmlPanel({ vad }: { vad: VadState }) {
  const [text, setText] = useState('¡Es un robo!');
  const [engine, setEngine] = useState<SsmlEngine>('web');
  const [status, setStatus] = useState('');
  const [speaking, setSpeaking] = useState(false);

  const quadrant = QUADRANT_PRESETS[vadQuadrant(vad)];
  const ssml = useMemo(() => vadToSsml(vad, text), [vad, text]);

  const speak = () => {
    if (engine !== 'web') {
      setStatus(`${ENGINE_LABELS[engine]}: configure la API key en Settings (placeholder).`);
      return;
    }
    if (!('speechSynthesis' in window)) {
      setStatus('Web Speech no está disponible en este entorno.');
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = Math.max(0.5, Math.min(2, quadrant.rate / 100));
    utterance.pitch = Math.max(0, Math.min(2, 1 + quadrant.pitch / 100));
    utterance.volume = Math.max(0, Math.min(1, 1 + quadrant.volume / 100));
    utterance.onstart = () => {
      setSpeaking(true);
      setStatus(`Reproduciendo con ${quadrant.label} (rate ${quadrant.rate}%, pitch ${quadrant.pitch >= 0 ? '+' : ''}${quadrant.pitch}%)…`);
    };
    utterance.onend = () => {
      setSpeaking(false);
      setStatus('Reproducción completada.');
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const stop = () => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setStatus('Detenido.');
  };

  return (
    <section className="l1-section vad-ssml-panel">
      <div className="cognitive-section-heading">
        <span className="section-kicker">SSML BUILDER</span>
        <span className="panel-caption">{quadrant.label.toUpperCase()}</span>
      </div>
      <textarea
        rows={2}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Texto a sintetizar…"
        aria-label="Texto para SSML"
      />
      <div className="vad-engine-row">
        <select
          className="l2-status-select"
          value={engine}
          onChange={(event) => setEngine(event.target.value as SsmlEngine)}
          aria-label="Motor de síntesis"
        >
          {(Object.keys(ENGINE_LABELS) as SsmlEngine[]).map((key) => (
            <option key={key} value={key}>
              {ENGINE_LABELS[key]}
            </option>
          ))}
        </select>
        <button className="button-primary" type="button" onClick={speak} disabled={!text.trim()}>
          {speaking ? 'Reproduciendo…' : 'Reproducir SSML'}
        </button>
        <button className="memory-action" type="button" onClick={stop} disabled={!speaking}>
          Detener
        </button>
      </div>
      {status ? <p className="l1-note" role="status">{status}</p> : null}
      <pre className="l2-mermaid-pre vad-ssml-pre">{ssml}</pre>
      <div className="l1-actions">
        <button
          className="memory-action"
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(ssml);
            setStatus('SSML copiado al portapapeles.');
          }}
        >
          Copiar SSML
        </button>
      </div>
    </section>
  );
}
