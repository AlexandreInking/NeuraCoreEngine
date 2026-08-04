import { useEffect, useRef, useState } from 'react';
import { analyzeIntention, textSimilarity, type PredictedIntent } from './analyzer';
import { IntentionCache } from './cache';

export type IntentionStatus = 'idle' | 'analyzing' | 'ready';

const PAUSE_THRESHOLD_MS = 1990; // 1.99s per the NetNavi spec

export type IntentionCapture = {
  intention: PredictedIntent | null;
  status: IntentionStatus;
  onChange: (text: string) => void;
  /** Validates the cached intention against the sent text; null if invalid. */
  validateAndClear: (sentText: string) => PredictedIntent | null;
  cancel: () => void;
};

/**
 * Real-time intention capture (cap 2): after a 1.99s typing pause, classifies
 * the partial text locally and caches it; the cache is validated on send.
 */
export function useIntentionCapture(): IntentionCapture {
  const [intention, setIntention] = useState<PredictedIntent | null>(null);
  const [status, setStatus] = useState<IntentionStatus>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cacheRef = useRef<IntentionCache | null>(null);
  const lastTextRef = useRef('');

  if (!cacheRef.current) cacheRef.current = new IntentionCache();

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const onChange = (text: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    lastTextRef.current = text;
    const trimmed = text.trim();
    if (trimmed.length < 4) {
      setIntention(null);
      setStatus('idle');
      return;
    }
    const cached = cacheRef.current?.get(trimmed);
    if (cached) {
      setIntention(cached);
      setStatus('ready');
      return;
    }
    setStatus('analyzing');
    timerRef.current = setTimeout(() => {
      const predicted = analyzeIntention(trimmed);
      cacheRef.current?.set(trimmed, predicted);
      if (lastTextRef.current.trim() === trimmed) {
        setIntention(predicted);
        setStatus('ready');
      }
    }, PAUSE_THRESHOLD_MS);
  };

  const validateAndClear = (sentText: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const cached = intention;
    setIntention(null);
    setStatus('idle');
    if (!cached) return null;
    return textSimilarity(sentText.trim().toLowerCase(), cached.text.toLowerCase()) > 0.6
      ? cached
      : null;
  };

  const cancel = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIntention(null);
    setStatus('idle');
  };

  return { intention, status, onChange, validateAndClear, cancel };
}
