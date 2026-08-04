export type PiiKind = 'email' | 'phone' | 'card' | 'iban' | 'ip' | 'gps';

export type PiiFinding = {
  kind: PiiKind;
  raw: string;
  masked: string;
  start: number;
};

const PATTERNS: Array<{ kind: PiiKind; regex: RegExp; masked: string }> = [
  {
    kind: 'card',
    regex: /\b(?:\d{4}[\s-]?){4}\b/g,
    masked: '[TARJETA]',
  },
  {
    kind: 'ip',
    regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    masked: '[IP]',
  },
  {
    kind: 'iban',
    regex: /\b(?:ES|PT|DE|FR|IT|GB|NL|BE)\d{2}[\sA-Z0-9]{15,30}\b/g,
    masked: '[IBAN]',
  },
  {
    kind: 'email',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    masked: '[EMAIL]',
  },
  {
    kind: 'gps',
    regex: /\b-?\d{1,3}(?:\.\d{2,6})?,\s*-?\d{1,3}(?:\.\d{2,6})?\b/g,
    masked: '[GPS]',
  },
  {
    kind: 'phone',
    regex: /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}(?![\d.])/g,
    masked: '[TEL]',
  },
];

/** Detect and mask PII before facts reach L1 (hito 9.4). */
export function scrubPii(text: string): { text: string; findings: PiiFinding[] } {
  const findings: PiiFinding[] = [];
  let scrubbed = text;
  for (const pattern of PATTERNS) {
    const matches = Array.from(scrubbed.matchAll(pattern.regex));
    for (const match of matches) {
      const raw = match[0];
      findings.push({
        kind: pattern.kind,
        raw,
        masked: pattern.masked,
        start: match.index ?? 0,
      });
    }
    scrubbed = scrubbed.replace(pattern.regex, pattern.masked);
  }
  return { text: scrubbed, findings };
}

export const PII_KIND_LABELS: Record<PiiKind, string> = {
  email: 'email',
  phone: 'teléfono',
  card: 'tarjeta',
  iban: 'IBAN',
  ip: 'IP',
  gps: 'GPS',
};
