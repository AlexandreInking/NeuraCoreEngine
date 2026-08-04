import type { CognitiveState } from './cognition/types';
import {
  EKMAN_LABELS,
  EMOTION_COLORS,
  EMOTION_LABELS,
  type EmotionLabel,
} from './cognition/types';

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function EmotionalAura({ cognition }: { cognition: CognitiveState }) {
  const color = EMOTION_COLORS[cognition.emotions.dominantEmotion];
  const intensity = Math.max(0.15, cognition.emotions.intensity);
  const arousal = Math.abs(cognition.emotions.arousal);
  return (
    <div className="affect-aura-wrap">
      <div
        className="affect-aura"
        style={{
          background: `radial-gradient(circle, ${color}55, transparent 70%)`,
          boxShadow: `0 0 ${30 + arousal * 60}px ${color}66`,
          opacity: 0.55 + intensity * 0.45,
        }}
        aria-hidden="true"
      />
      <div className="affect-aura-core" style={{ background: color }}>
        <span>{EMOTION_LABELS[cognition.emotions.dominantEmotion]}</span>
        <strong>{Math.round(cognition.emotions.intensity * 100)}%</strong>
      </div>
    </div>
  );
}

export default function AffectEnginePage({
  cognition,
  onStimulus,
  onTick,
}: {
  cognition: CognitiveState | null;
  onStimulus: (
    kind: 'positive' | 'negative' | 'intense_negative' | 'neutral',
  ) => void;
  onTick: () => void;
}) {
  const state = cognition;

  return (
    <section className="page" aria-labelledby="affect-page-title">
      <div className="page-heading">
        <div>
          <p className="eyebrow">AFFECTIVE STATE</p>
          <h2 id="affect-page-title">Affect Engine</h2>
          <p className="page-description">
            Estado emocional VAD en tiempo real: rueda de Plutchik, emociones de
            Ekman, marcadores somáticos y alineación corazón-mente.
          </p>
        </div>
        <span className="page-version">v0.1.0-alpha</span>
      </div>

      {!state ? (
        <article className="empty-state">
          <div className="empty-icon">
            <span className="empty-icon-text">Ψ</span>
          </div>
          <h3>Waiting for the cognition engine</h3>
          <p>Envía un mensaje en Chats para activar el estado afectivo.</p>
        </article>
      ) : (
        <AffectEngineBody
          state={state}
          onStimulus={onStimulus}
          onTick={onTick}
        />
      )}
    </section>
  );
}

function AffectEngineBody({
  state,
  onStimulus,
  onTick,
}: {
  state: CognitiveState;
  onStimulus: (
    kind: 'positive' | 'negative' | 'intense_negative' | 'neutral',
  ) => void;
  onTick: () => void;
}) {
  const emotions = state.emotions;
  return (
    <>
      <div className="affect-simulator">
        <div>
          <span className="section-kicker">STIMULUS SIMULATOR</span>
          <p className="affect-simulator-note">
            Aplica un estímulo externo para ver cómo evoluciona el estado
            emocional y la personalidad.
          </p>
        </div>
        <div className="affect-simulator-actions">
          <button
            className="button-primary"
            type="button"
            onClick={() => onStimulus('positive')}
          >
            Positive
          </button>
          <button
            className="button-ghost"
            type="button"
            onClick={() => onStimulus('negative')}
          >
            Negative
          </button>
          <button
            className="button-ghost"
            type="button"
            onClick={() => onStimulus('intense_negative')}
          >
            Intense
          </button>
          <button
            className="button-ghost"
            type="button"
            onClick={() => onStimulus('neutral')}
          >
            Neutral
          </button>
          <button
            className="button-ghost"
            type="button"
            onClick={onTick}
            title="Aplica una hora de decaimiento hacia el baseline"
          >
            Tick decay
          </button>
        </div>
      </div>

      <div className="affect-grid">
        <article className="surface affect-card affect-card-aura">
          <div className="surface-header">
            <div>
              <span className="section-kicker">ESTADO ACTUAL</span>
              <h3>Dominante emocional</h3>
            </div>
            <span className="surface-badge cognitive-live">LIVE</span>
          </div>
          <EmotionalAura cognition={state} />
        </article>

        <article className="surface affect-card">
          <div className="surface-header">
            <div>
              <span className="section-kicker">VAD VECTOR</span>
              <h3>Valencia · Arousal · Dominancia</h3>
            </div>
            <span className="surface-badge">BASELINE</span>
          </div>
          <div className="vad-triple">
            {(
              [
                ['Valencia', emotions.valence],
                ['Arousal', emotions.arousal],
                ['Dominancia', emotions.dominance],
              ] as const
            ).map(([label, value]) => {
              const percent = Math.round(((value + 1) / 2) * 100);
              return (
                <div className="vad-axis" key={label}>
                  <div>
                    <span>{label}</span>
                    <strong>
                      {value >= 0 ? '+' : ''}
                      {value.toFixed(2)}
                    </strong>
                  </div>
                  <div className="vad-track">
                    <span
                      className="vad-track-fill"
                      style={{
                        width: `${percent}%`,
                        background: `linear-gradient(90deg, ${value < 0 ? '#dc2626' : '#10b981'}, #70a1ff)`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="plutchik-wheel">
            <span className="section-kicker">RUEDA DE PLUTCHIK</span>
            {(
              Object.entries(emotions.plutchik) as Array<[EmotionLabel, number]>
            ).map(([emotion, value]) => (
              <div className="plutchik-row" key={emotion}>
                <span>{EMOTION_LABELS[emotion]}</span>
                <div className="cognitive-bar" aria-hidden="true">
                  <span
                    style={{
                      width: `${Math.round(value * 100)}%`,
                      background: EMOTION_COLORS[emotion],
                    }}
                  />
                </div>
                <strong>{Math.round(value * 100)}%</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="surface affect-card">
          <div className="surface-header">
            <div>
              <span className="section-kicker">EKMAN · DIMENSIONES</span>
              <h3>Inteligencia emocional</h3>
            </div>
            <span className="surface-badge">GOLEMAN</span>
          </div>
          <div className="ekman-grid">
            {(
              Object.keys(EKMAN_LABELS) as Array<keyof typeof EKMAN_LABELS>
            ).map((key) => {
              const value = emotions.ekman[key];
              return (
                <div className="cognitive-metric" key={key}>
                  <div>
                    <span>{EKMAN_LABELS[key]}</span>
                    <strong>{Math.round(value * 100)}%</strong>
                  </div>
                  <div className="cognitive-bar" aria-hidden="true">
                    <span style={{ width: `${Math.round(value * 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="cognitive-section-block">
            <div className="cognitive-section-heading">
              <span className="section-kicker">COMPETENCIAS</span>
              <span className="panel-caption">
                CONTAGIO {Math.round(emotions.contagionSusceptibility * 100)}%
              </span>
            </div>
            {(
              [
                ['Autoconciencia', emotions.intelligence.selfAwareness],
                ['Autorregulación', emotions.intelligence.selfRegulation],
                ['Empatía', emotions.intelligence.empathy],
                ['Habilidades sociales', emotions.intelligence.socialSkills],
              ] as const
            ).map(([label, value]) => (
              <div className="cognitive-metric" key={label}>
                <div>
                  <span>{label}</span>
                  <strong>{Math.round(value * 100)}%</strong>
                </div>
                <div className="cognitive-bar" aria-hidden="true">
                  <span style={{ width: `${Math.round(value * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="surface affect-card">
          <div className="surface-header">
            <div>
              <span className="section-kicker">DAMASIO</span>
              <h3>Marcadores somáticos</h3>
            </div>
            <span className="surface-badge">
              {emotions.somaticMarkers.length} ACTIVOS
            </span>
          </div>
          {emotions.somaticMarkers.length ? (
            <div className="somatic-list">
              {emotions.somaticMarkers.map((marker) => (
                <div className="somatic-marker" key={marker.id}>
                  <div className="somatic-marker-head">
                    <strong>{marker.trigger}</strong>
                    <span
                      style={{
                        color: marker.valence >= 0 ? 'var(--green)' : '#f87171',
                      }}
                    >
                      {marker.valence >= 0 ? '+' : ''}
                      {marker.valence.toFixed(2)}
                    </span>
                  </div>
                  <div className="cognitive-bar" aria-hidden="true">
                    <span
                      style={{
                        width: `${Math.round(marker.strength * 100)}%`,
                        background:
                          marker.valence >= 0 ? 'var(--green)' : '#f87171',
                      }}
                    />
                  </div>
                  <small>
                    fuerza {Math.round(marker.strength * 100)}% · reforzado{' '}
                    {marker.reinforcementCount}× ·{' '}
                    {formatTime(marker.createdAt)}
                  </small>
                </div>
              ))}
            </div>
          ) : (
            <p className="affect-empty">
              Los marcadores somáticos se crean cuando una experiencia tiene
              alto impacto emocional y se refuerzan con cada recuerdo.
            </p>
          )}
        </article>

        <article className="surface affect-card affect-card-wide">
          <div className="surface-header">
            <div>
              <span className="section-kicker">HISTORIA EMOCIONAL</span>
              <h3>Valencia reciente</h3>
            </div>
            <span className="surface-badge">ÚLTIMAS 48</span>
          </div>
          {emotions.history.length ? (
            <div className="history-spark">
              {emotions.history.map((entry) => {
                const height = Math.max(4, Math.abs(entry.valence) * 80);
                return (
                  <span
                    key={entry.timestamp}
                    className="history-bar"
                    title={`${EMOTION_LABELS[entry.dominantEmotion]} ${formatTime(entry.timestamp)}`}
                    style={{
                      height: `${height}%`,
                      background:
                        entry.valence >= 0 ? 'var(--green)' : '#f87171',
                    }}
                  />
                );
              })}
            </div>
          ) : (
            <p className="affect-empty">
              La historia emocional se irá llenando con cada mensaje o estímulo.
            </p>
          )}
          <p className="affect-empty">
            Inercia γ={emotions.emotionalInertiaGamma} · regulación{' '}
            {Math.round(emotions.regulationEffectiveness * 100)}%
          </p>
        </article>
      </div>
    </>
  );
}
