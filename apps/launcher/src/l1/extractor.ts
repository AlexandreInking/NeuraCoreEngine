import { deepSeekChat, type DeepSeekConfig } from '../cognition/deepseek';
import { heuristicAnalysis } from '../cognition/analysis';

export type SpoTriplet = {
  subject: string;
  predicate: string;
  object: string;
  certainty: number;
};

const EXTRACTION_PROMPT = `Extrae hechos atómicos de este texto en formato JSON (solo el array, sin texto adicional):
[{"subject":"...","predicate":"...","object":"...","certainty":0.0-1.0}]
Reglas: sujeto y objeto son entidades concretas, el predicado es una relación corta, certainty refleja confianza.
Texto:`;

export async function extractSpo(
  text: string,
  config: DeepSeekConfig | null,
): Promise<{ triplets: SpoTriplet[]; fromModel: boolean }> {
  if (config?.apiKey.trim()) {
    try {
      const raw = await deepSeekChat(config, [
        { role: 'system', content: EXTRACTION_PROMPT },
        { role: 'user', content: text },
      ]);
      const parsed: unknown = JSON.parse(extractJson(raw));
      if (Array.isArray(parsed)) {
        const triplets = parsed
          .map((item) => normalizeTriplet(item))
          .filter((item): item is SpoTriplet => item !== null);
        if (triplets.length) {
          return { triplets: triplets.slice(0, 12), fromModel: true };
        }
      }
    } catch {
      // fall through to heuristic
    }
  }
  return { triplets: heuristicSpo(text), fromModel: false };
}

function normalizeTriplet(value: unknown): SpoTriplet | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const subject = typeof item.subject === 'string' ? item.subject.trim() : '';
  const predicate =
    typeof item.predicate === 'string' ? item.predicate.trim() : '';
  const object = typeof item.object === 'string' ? item.object.trim() : '';
  const certainty =
    typeof item.certainty === 'number' && Number.isFinite(item.certainty)
      ? Math.max(0, Math.min(1, item.certainty))
      : 0.5;
  if (!subject || !predicate || !object) return null;
  return { subject, predicate, object, certainty };
}

/** Deterministic fallback: sentence-level facts derived from topic analysis. */
function heuristicSpo(text: string): SpoTriplet[] {
  const analysis = heuristicAnalysis(text);
  const sentences = text
    .split(/[.;!?¡¿\n]+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 8)
    .slice(0, 4);

  if (!sentences.length) return [];

  const baseSubject = analysis.topics[0] ?? 'el usuario';
  const triplets: SpoTriplet[] = sentences.map((sentence, index) => ({
    subject:
      index === 0 ? baseSubject : sentence.split(/\s+/).slice(0, 2).join(' '),
    predicate: index === 0 ? 'expresa' : 'menciona',
    object: sentence.slice(0, 140),
    certainty: Math.max(0.5, 0.75 - analysis.traumaRisk * 0.2),
  }));
  return triplets;
}

function extractJson(raw: string) {
  const trimmed = raw.trim();
  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  const objectStart = trimmed.indexOf('{');
  const objectEnd = trimmed.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    return `[${trimmed.slice(objectStart, objectEnd + 1)}]`;
  }
  return trimmed;
}
