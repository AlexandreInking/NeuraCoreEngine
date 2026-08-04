import { TRAIT_KEYS, TRAIT_LABELS } from './cognition/types';
import type { CognitiveState } from './cognition/types';
import { EMOTION_LABELS } from './cognition/types';
import type { EmotionLabel } from './cognition/types';

function formatTime(timestamp: number) {
  if (!timestamp) return null;
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function headlineMetrics(state: CognitiveState) {
  const conscious = state.personality.conscious;
  const personality = Math.round(
    TRAIT_KEYS.reduce((sum, key) => sum + conscious[key], 0) /
      TRAIT_KEYS.length,
  );
  const morality = state.personality.moral.conscious.goodness;
  const emotions = Math.round(state.emotions.intensity * 100);
  const consciousness = Math.round(state.introspection.selfAwareness * 100);
  const subconscious = Math.round(
    Math.min(
      1,
      state.personality.conflictLevel * 0.65 +
        Math.min(
          1,
          state.memory.units.filter((unit) => unit.isRepressed).length / 5,
        ) *
          0.45,
    ) * 100,
  );
  return [
    { label: 'Personality', value: personality },
    { label: 'Morality', value: morality },
    { label: 'Emotions', value: emotions },
    { label: 'Consciousness', value: consciousness },
    { label: 'Subconscious', value: subconscious },
  ];
}

function memoryLayers(state: CognitiveState) {
  const units = state.memory.units;
  const clusters = new Set(units.flatMap((unit) => unit.keywords)).size;
  const integration = Math.round((1 - state.personality.conflictLevel) * 100);
  return [
    {
      code: 'L0',
      title: 'Raw Logs',
      note: `${state.memory.workingMemory.length} messages in working memory`,
      value: Math.round((state.memory.workingMemory.length / 7) * 100),
    },
    {
      code: 'L1',
      title: 'Atomic Facts',
      note: `${units.length} memory unit${units.length === 1 ? '' : 's'} stored`,
      value: Math.min(100, units.length * 8),
    },
    {
      code: 'L2',
      title: 'Scenario Nodes',
      note: `${clusters} semantic cluster${clusters === 1 ? '' : 's'}`,
      value: Math.min(100, clusters * 18),
    },
    {
      code: 'L3',
      title: 'Core Persona',
      note: `Integration ${integration}%`,
      value: integration,
    },
  ];
}

function plutchikEntries(state: CognitiveState) {
  return (
    Object.entries(state.emotions.plutchik) as Array<[EmotionLabel, number]>
  ).sort((a, b) => b[1] - a[1]);
}

export default function CognitivePanel({
  cognition,
}: {
  cognition: CognitiveState | null;
}) {
  if (!cognition) {
    return (
      <aside className="cognitive-panel" aria-label="Shared cognitive summary">
        <div className="cognitive-panel-header">
          <div>
            <span className="section-kicker">SHARED STATE</span>
            <h3>Cognitive summary</h3>
          </div>
        </div>
        <p className="cognitive-note">Waiting for the cognition engine…</p>
      </aside>
    );
  }

  const metrics = headlineMetrics(cognition);
  const layers = memoryLayers(cognition);
  const emotions = cognition.emotions;
  const dominant = EMOTION_LABELS[emotions.dominantEmotion];
  const topPlutchik = plutchikEntries(cognition).slice(0, 4);
  const lastDream =
    cognition.memory.dreamLogs[cognition.memory.dreamLogs.length - 1];

  return (
    <aside className="cognitive-panel" aria-label="Shared cognitive summary">
      <div className="cognitive-panel-header">
        <div>
          <span className="section-kicker">SHARED STATE</span>
          <h3>Cognitive summary</h3>
        </div>
        <span className="surface-badge cognitive-live">LIVE</span>
      </div>
      <p className="cognitive-note">
        Estado compartido por todos los chats. Dominante:{' '}
        <strong className="cognitive-dominant">{dominant}</strong> con
        intensidad {Math.round(emotions.intensity * 100)}%.
      </p>

      <div className="cognitive-metrics">
        {metrics.map((metric) => (
          <div className="cognitive-metric" key={metric.label}>
            <div>
              <span>{metric.label}</span>
              <strong>{metric.value}%</strong>
            </div>
            <div
              className="cognitive-bar"
              role="progressbar"
              aria-label={`${metric.label} state`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={metric.value}
            >
              <span style={{ width: `${metric.value}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="cognitive-section-block">
        <div className="cognitive-section-heading">
          <span className="section-kicker">
            HEXACO CONSCIENTE / SUBCONSCIENTE
          </span>
          <span className="panel-caption">C / S</span>
        </div>
        {TRAIT_KEYS.map((trait) => {
          const conscious = cognition.personality.conscious[trait];
          const subconscious = cognition.personality.subconscious[trait];
          const conflicted = Math.abs(conscious - subconscious) > 30;
          return (
            <div className="hexaco-row" key={trait}>
              <span className="hexaco-label" title={TRAIT_LABELS[trait]}>
                {TRAIT_LABELS[trait]}
                {conflicted ? <i title="Conflicto interno">⚠</i> : null}
              </span>
              <div className="hexaco-bars" aria-hidden="true">
                <span
                  className="hexaco-conscious"
                  style={{ width: `${conscious}%` }}
                />
                <span
                  className="hexaco-subconscious"
                  style={{ width: `${subconscious}%` }}
                />
              </div>
              <span className="hexaco-values">
                {conscious}/{subconscious}
              </span>
            </div>
          );
        })}
      </div>

      <div className="cognitive-section-block">
        <div className="cognitive-section-heading">
          <span className="section-kicker">ESTADO VAD</span>
          <span className="panel-caption">PLUTCHIK</span>
        </div>
        {(
          [
            ['Valencia', emotions.valence],
            ['Arousal', emotions.arousal],
            ['Dominancia', emotions.dominance],
          ] as const
        ).map(([label, value]) => {
          const percent = Math.round(((value + 1) / 2) * 100);
          return (
            <div className="cognitive-metric vad-row" key={label}>
              <div>
                <span>{label}</span>
                <strong>
                  {value >= 0 ? '+' : ''}
                  {value.toFixed(2)}
                </strong>
              </div>
              <div className="cognitive-bar" aria-hidden="true">
                <span style={{ width: `${percent}%` }} />
              </div>
            </div>
          );
        })}
        <div className="plutchik-grid">
          {topPlutchik.map(([emotion, value]) => (
            <div className="plutchik-chip" key={emotion}>
              <span>{EMOTION_LABELS[emotion]}</span>
              <strong>{Math.round(value * 100)}%</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="memory-layer-summary">
        <div className="cognitive-section-heading">
          <span className="section-kicker">MEMORY LAYERS</span>
          <span className="panel-caption">L0 → L3</span>
        </div>
        {layers.map((layer) => (
          <div className="memory-layer" key={layer.code}>
            <span className="memory-layer-code">{layer.code}</span>
            <div className="memory-layer-copy">
              <strong>{layer.title}</strong>
              <small>{layer.note}</small>
              <div className="cognitive-bar memory-bar" aria-hidden="true">
                <span style={{ width: `${layer.value}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {lastDream ? (
        <div className="dream-line">
          <span className="section-kicker">ÚLTIMO SUEÑO</span>
          <p>
            {formatTime(lastDream.timestamp)} · {lastDream.consolidatedCount}{' '}
            memorias consolidadas
          </p>
          <small>{lastDream.insights[0]}</small>
        </div>
      ) : null}
    </aside>
  );
}
