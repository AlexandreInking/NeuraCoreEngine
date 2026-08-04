import { useState } from 'react';
import {
  evaluateProactiveProbability,
  selectProactiveType,
  generateProactiveContent,
  typeLabel,
  type ProactiveAction,
  type ProactiveTraits,
} from './index';

const DEFAULT_TRAITS: ProactiveTraits = {
  extraversion: 65,
  openness: 80,
  agreeableness: 75,
  belongingness: 70,
};

/**
 * Proactive behavior evaluator (cap 16): personality + time-since-last-
 * interaction → probability → action type → message (LLM or heuristic).
 */
export function ProactivePanel() {
  const [traits, setTraits] = useState<ProactiveTraits>(DEFAULT_TRAITS);
  const [minutes, setMinutes] = useState(45);
  const [result, setResult] = useState<{
    probability: number;
    type: string;
  } | null>(null);
  const [action, setAction] = useState<ProactiveAction | null>(null);
  const [busy, setBusy] = useState(false);

  const slider = (
    label: string,
    key: keyof ProactiveTraits,
  ) => (
    <label className="vad-slider">
      <span>{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={traits[key]}
        onChange={(event) =>
          setTraits((current) => ({ ...current, [key]: Number(event.target.value) }))
        }
      />
      <code>{traits[key]}</code>
    </label>
  );

  const evaluate = () => {
    const probability = evaluateProactiveProbability({ traits, minutesSinceLastInteraction: minutes });
    const type = selectProactiveType(traits);
    setResult({ probability, type });
    setAction(null);
  };

  const generate = async () => {
    if (!result) return;
    setBusy(true);
    const generated = await generateProactiveContent(
      result.type as Parameters<typeof generateProactiveContent>[0],
      traits,
    );
    setAction({
      type: result.type as ProactiveAction['type'],
      content: generated.content,
      motivation: `Influencia de ${traits.extraversion >= 60 ? 'extraversión' : traits.openness >= 60 ? 'apertura' : 'amabilidad'}`,
      confidence: Math.round(result.probability * 100) / 100,
      generatedBy: generated.generatedBy,
    });
    setBusy(false);
  };

  return (
    <section className="l1-section">
      <div className="cognitive-section-heading">
        <span className="section-kicker">COMPORTAMIENTO PROACTIVO</span>
        <span className="panel-caption">CAP 16 · PERSONALIDAD × TIEMPO</span>
      </div>
      <div className="vad-slider-group">
        {slider('Extraversión', 'extraversion')}
        {slider('Apertura', 'openness')}
        {slider('Amabilidad', 'agreeableness')}
        {slider('Pertenencia (Maslow)', 'belongingness')}
      </div>
      <label className="vad-slider">
        <span>Minutos sin interacción</span>
        <input
          type="range"
          min={0}
          max={120}
          step={5}
          value={minutes}
          onChange={(event) => setMinutes(Number(event.target.value))}
        />
        <code>{minutes}min</code>
      </label>
      <div className="l1-actions">
        <button className="button-primary" type="button" onClick={evaluate}>
          Evaluar
        </button>
        <button
          className="memory-action"
          type="button"
          onClick={() => void generate()}
          disabled={!result || busy}
        >
          {busy ? 'Generando…' : 'Generar mensaje proactivo'}
        </button>
      </div>
      {result ? (
        <p className="l1-note" role="status">
          Probabilidad de interacción: <strong>{Math.round(result.probability * 100)}%</strong>{' '}
          {result.probability >= 0.6 ? '· ¿iniciar?' : '· mantener silencio'} · tipo:{' '}
          {typeLabel(result.type as Parameters<typeof typeLabel>[0])}
        </p>
      ) : null}
      {action ? (
        <div className="l3-test-output">
          <span className="panel-caption">
            MENSAJE PROACTIVO · {action.generatedBy.toUpperCase()} · conf {action.confidence}
          </span>
          <p>{action.content}</p>
          <small>{action.motivation}</small>
        </div>
      ) : null}
    </section>
  );
}
