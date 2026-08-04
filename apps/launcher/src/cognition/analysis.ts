import { deepSeekChat, type DeepSeekConfig } from './deepseek';
import { clamp01, clamp11 } from './defaults';
import type { MessageAnalysis, PlutchikEmotions } from './types';

const NEGATIVE_WORDS = [
  'enojad',
  'enfad',
  'furios',
  'ira',
  'triste',
  'deprimid',
  'ansios',
  'asustad',
  'miedo',
  'temer',
  'odio',
  'frustrad',
  'dolido',
  'sufro',
  'llor',
  'solit',
  'abandon',
  'traicion',
  'perdí',
  'perdi',
  'perder',
  'roto',
  'rota',
  'fracas',
  'muert',
  'fallec',
  'enferm',
  'terrible',
  'horrible',
];

const POSITIVE_WORDS = [
  'feliz',
  'alegr',
  'content',
  'genial',
  'excelente',
  'maravillos',
  'increíble',
  'increible',
  'amor',
  'quiero',
  'amo',
  'agradec',
  'gracias',
  'éxito',
  'exito',
  'logré',
  'logre',
  'gané',
  'gane',
  'triunf',
  'bien',
  'bueno',
  'mejor',
  'felicitaciones',
  'emocionad',
  'esperanz',
  'orgullos',
];

const AROUSAL_WORDS = [
  'urgente',
  'ahora',
  'ya mismo',
  'rápido',
  'rapido',
  'inmediato',
  'corre',
  'grita',
  'salió',
  'salio',
  'atac',
  'peligro',
  'emergencia',
  'grit',
  'alerta',
  'ansios',
  'nervios',
];

const TOPIC_STOPWORDS = new Set([
  'que',
  'que?',
  'el',
  'la',
  'los',
  'las',
  'de',
  'del',
  'y',
  'o',
  'u',
  'a',
  'al',
  'en',
  'con',
  'por',
  'para',
  'mi',
  'me',
  'te',
  'se',
  'un',
  'una',
  'es',
  'está',
  'esta',
  'estoy',
  'muy',
  'pero',
  'porque',
  'como',
  'cómo',
  'cuando',
  'cuánto',
  'todo',
  'toda',
  'nada',
  'algo',
  'tengo',
  'quiero',
  'puedo',
  'hacer',
  'hace',
  'hago',
  'no',
  'si',
  'sí',
  'bien',
  'mal',
  'mas',
  'más',
  'menos',
]);

function countHits(text: string, words: string[]) {
  const lower = text.toLowerCase();
  return words.reduce(
    (count, word) => (lower.includes(word) ? count + 1 : count),
    0,
  );
}

/** Deterministic fallback used when no DeepSeek key is configured or the call fails. */
export function heuristicAnalysis(message: string): MessageAnalysis {
  const text = message.toLowerCase();
  const negative = countHits(text, NEGATIVE_WORDS);
  const positive = countHits(text, POSITIVE_WORDS);
  const arousalHits = countHits(text, AROUSAL_WORDS);

  const rawValence = (positive - negative) / Math.max(1, positive + negative);
  const intensity = clamp01(
    Math.min(1, (positive + negative) * 0.28) +
      Math.min(0.5, arousalHits * 0.16),
  );

  const valence = clamp11(rawValence * intensity * 2);
  const arousal = clamp11(
    Math.min(1, arousalHits * 0.4 + intensity * 0.4) * 2 - 1,
  );
  const dominance = clamp11((rawValence > 0 ? 0.25 : -0.15) + intensity * 0.4);

  const emotions: Partial<PlutchikEmotions> = {};
  if (negative > 0) {
    emotions.anger = clamp01(
      (negative / (negative + positive + 1)) * 0.9 * (arousal > 0 ? 1 : 0.35),
    );
    emotions.sadness = clamp01(
      (negative / (negative + positive + 1)) * 0.9 * (arousal < 0.2 ? 1 : 0.45),
    );
    emotions.fear = clamp01(arousalHits * 0.3);
  }
  if (positive > 0) {
    emotions.joy = clamp01((positive / (negative + positive + 1)) * 0.95);
    emotions.trust = clamp01((positive / (negative + positive + 1)) * 0.5);
  }
  if (arousalHits > 0) emotions.anticipation = clamp01(arousalHits * 0.3);
  if (message.includes('?') || message.includes('¿')) {
    emotions.surprise = clamp01((emotions.surprise ?? 0) + 0.2);
  }

  const topics = extractTopics(message);

  return {
    valence,
    arousal,
    dominance,
    emotions,
    intention: negative > positive ? 'emotional_support' : 'conversation',
    topics,
    traumaRisk: clamp01(
      negative * 0.4 + (hasTraumaMarkers(message) ? 0.35 : 0),
    ),
    fromModel: false,
  };
}

function hasTraumaMarkers(text: string) {
  return /muert|fallec|suicid|abuso|violen|atropell|accidente|hospital/.test(
    text,
  );
}

function extractTopics(message: string): string[] {
  const lower = message.toLowerCase().replace(/[.,;:!?¿¡()"']/g, ' ');
  const words = lower.split(/\s+/).filter((word) => word.length >= 4);
  const counts = new Map<string, number>();
  for (const word of words) {
    if (TOPIC_STOPWORDS.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([word]) => word);
}

const ANALYSIS_PROMPT = `Analiza el mensaje del usuario y responde SOLO con JSON válido, sin texto adicional, con esta forma:
{
  "valence": numero entre -1 y 1 (valencia emocional),
  "arousal": numero entre 0 y 1 (activación),
  "dominance": numero entre -1 y 1,
  "emotions": {"joy": 0-1, "trust": 0-1, "fear": 0-1, "surprise": 0-1, "sadness": 0-1, "disgust": 0-1, "anger": 0-1, "anticipation": 0-1},
  "intention": "pregunta | conversacion | comando | emocional | confesion",
  "topics": ["tema1", "tema2"],
  "traumaRisk": numero entre 0 y 1 (riesgo de contenido traumático o de crisis emocional)
}`;

/**
 * Analyse a user message with DeepSeek when configured; falls back to the
 * deterministic heuristic on any failure.
 */
export async function analyzeMessage(
  message: string,
  config: DeepSeekConfig | null,
): Promise<MessageAnalysis> {
  if (!config?.apiKey.trim()) {
    return heuristicAnalysis(message);
  }

  try {
    const raw = await deepSeekChat(config, [
      { role: 'system', content: ANALYSIS_PROMPT },
      { role: 'user', content: message },
    ]);
    const parsed: unknown = JSON.parse(extractJson(raw));
    if (!parsed || typeof parsed !== 'object') {
      return heuristicAnalysis(message);
    }
    const value = parsed as Record<string, unknown>;
    const emotions =
      typeof value.emotions === 'object' && value.emotions !== null
        ? (value.emotions as Partial<PlutchikEmotions>)
        : {};
    return {
      valence: clamp11(toNumber(value.valence, 0)),
      arousal: clamp01(toNumber(value.arousal, 0.3)),
      dominance: clamp11(toNumber(value.dominance, 0)),
      emotions: sanitizeEmotions(emotions),
      intention:
        typeof value.intention === 'string' ? value.intention : 'conversacion',
      topics: Array.isArray(value.topics)
        ? value.topics
            .filter((item): item is string => typeof item === 'string')
            .slice(0, 5)
        : extractTopics(message),
      traumaRisk: clamp01(toNumber(value.traumaRisk, 0)),
      fromModel: true,
    };
  } catch {
    return heuristicAnalysis(message);
  }
}

function sanitizeEmotions(emotions: Partial<PlutchikEmotions>) {
  const result: Partial<PlutchikEmotions> = {};
  const keys: Array<keyof PlutchikEmotions> = [
    'joy',
    'trust',
    'fear',
    'surprise',
    'sadness',
    'disgust',
    'anger',
    'anticipation',
  ];
  for (const key of keys) {
    const value = emotions[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      result[key] = clamp01(value);
    }
  }
  return result;
}

function extractJson(raw: string) {
  const trimmed = raw.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

function toNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
