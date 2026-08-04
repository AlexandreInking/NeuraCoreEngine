import type { PredictedIntent } from './analyzer';
import { textSimilarity } from './analyzer';

const MAX_CACHE = 20;

/** In-memory intention cache (cap 2): short-lived, keyed by text prefix. */
export class IntentionCache {
  private entries: Array<{ key: string; intent: PredictedIntent }> = [];

  get(text: string): PredictedIntent | null {
    const normalized = text.trim().toLowerCase();
    if (normalized.length < 4) return null;
    for (const entry of this.entries) {
      if (textSimilarity(normalized, entry.key) > 0.85) return entry.intent;
    }
    return null;
  }

  set(text: string, intent: PredictedIntent) {
    this.entries = [
      { key: text.trim().toLowerCase(), intent },
      ...this.entries.filter(
        (entry) => textSimilarity(text.trim().toLowerCase(), entry.key) < 0.85,
      ),
    ].slice(0, MAX_CACHE);
  }

  clear() {
    this.entries = [];
  }
}
