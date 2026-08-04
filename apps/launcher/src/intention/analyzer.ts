export type IntentionType = 'pregunta' | 'conversacion' | 'comando' | 'emocional';

export type PredictedIntent = {
  type: IntentionType;
  confidence: number; // 0-1
  urgency: number; // 0-1
  complexity: number; // 0-1
  topics: string[];
  text: string;
  timestamp: number;
};

const QUESTION_MARKERS = ['?', '¿', 'qué', 'quién', 'cómo', 'cuándo', 'dónde', 'por qué', 'cuál', 'cuánto'];
const COMMAND_MARKERS = [
  'haz', 'dame', 'busca', 'dime', 'muestra', 'quiero que', 'necesito que', 'crea', 'genera',
  'abre', 'envía', 'calcula', 'traduce', 'resume', 'explica', 'escribe', 'repite',
];
const EMOTIONAL_MARKERS = [
  'triste', 'enojado', 'feliz', 'ansioso', 'frustrado', 'asustado', 'contento', 'molesto',
  'deprimido', 'emocionado', 'preocupado', 'solo', 'asombrado', 'odio', 'amo', 'miedo',
];
const URGENCY_MARKERS = ['urgente', 'ahora', 'ya', 'rápido', 'inmediato', 'ya mismo', 'hoy'];
const STOPWORDS = new Set([
  'para', 'este', 'esta', 'estos', 'estas', 'con', 'que', 'una', 'uno', 'unas', 'unos',
  'los', 'las', 'del', 'al', 'por', 'pero', 'como', 'más', 'mas', 'muy', 'tiene', 'puede',
  'sobre', 'entre', 'hacia', 'desde', 'hasta', 'todo', 'toda', 'todos', 'todas', 'cosa',
]);

/** Ultra-fast local intention classification (Cerebras semantics, local-first). */
export function analyzeIntention(partialText: string): PredictedIntent {
  const text = partialText.trim().toLowerCase();
  const timestamp = Date.now();

  let type: IntentionType = 'conversacion';
  let evidence = 0;

  if (QUESTION_MARKERS.some((marker) => text.includes(marker))) {
    type = 'pregunta';
    evidence += 1;
  }
  if (COMMAND_MARKERS.some((marker) => text.includes(marker))) {
    type = 'comando';
    evidence += 1;
  }
  if (EMOTIONAL_MARKERS.some((marker) => text.includes(marker))) {
    type = 'emocional';
    evidence += 1;
  }
  // Emotional wins when clearly expressed; question beats command on '?'.
  if (type === 'comando' && text.includes('?')) type = 'pregunta';

  const confidence = Math.min(0.95, 0.5 + evidence * 0.2 + Math.min(0.2, text.length / 200));
  const urgency = Math.min(
    1,
    URGENCY_MARKERS.some((marker) => text.includes(marker)) ? 0.8 : 0.25,
  );
  const complexity = Math.min(1, text.length / 220);

  const tokens = text
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !STOPWORDS.has(token));
  const topics = [...new Set(tokens)].slice(0, 4);

  return { type, confidence, urgency, complexity, topics, text: partialText.trim(), timestamp };
}

export const INTENTION_LABELS: Record<IntentionType, string> = {
  pregunta: 'pregunta',
  conversacion: 'conversación',
  comando: 'comando',
  emocional: 'emocional',
};

/** Simple text similarity for cache validation (0-1). */
export function textSimilarity(a: string, b: string): number {
  const tokensA = new Set(a.toLowerCase().split(/\s+/));
  const tokensB = new Set(b.toLowerCase().split(/\s+/));
  if (!tokensA.size || !tokensB.size) return 0;
  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) overlap += 1;
  }
  return overlap / Math.max(tokensA.size, tokensB.size);
}
