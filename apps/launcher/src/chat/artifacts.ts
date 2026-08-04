export type ChartType = 'bar' | 'line';

export type ChartSpec = {
  title?: string;
  type?: ChartType;
  labels?: string[];
  /** Single series, or multiple series (each an array of numbers). */
  values?: number[] | number[][];
  seriesNames?: string[];
};

export type ArtifactKind =
  'chart' | 'code' | 'note' | 'table' | 'diagram' | 'image';

export type ArtifactContent =
  | { kind: 'chart'; spec: ChartSpec }
  | { kind: 'code'; language: string; code: string }
  | { kind: 'note'; text: string }
  | { kind: 'table'; markdown: string }
  | { kind: 'diagram'; source: string }
  | { kind: 'image'; url: string; caption?: string };

export type ArtifactWindow = {
  id: string;
  kind: ArtifactKind;
  title: string;
  x: number; // -1 = auto-place
  y: number;
  w: number;
  h: number;
  z: number;
  minimized: boolean;
  content: ArtifactContent;
  createdAt: string;
};

export type ChatWindowState = {
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  minimized: boolean;
};

const FENCED_BLOCK = /```([a-zA-Z0-9_:-]*)\s*\n([\s\S]*?)```/g;

export type ParsedArtifact = {
  marker: string;
  window: Omit<ArtifactWindow, 'x' | 'y' | 'z' | 'minimized' | 'createdAt'>;
};

function marker(kind: ArtifactKind, id: string, title: string) {
  return `[art:${kind}:${id}|${escapeMarker(title)}]`;
}

function extractTitle(payload: string, fallback: string) {
  try {
    const parsed = JSON.parse(payload) as { title?: unknown };
    if (typeof parsed.title === 'string' && parsed.title.trim()) {
      return parsed.title.trim();
    }
  } catch {
    // fall through
  }
  const firstLine = payload.trim().split('\n')[0]?.trim() ?? '';
  return firstLine.slice(0, 60) || fallback;
}

function isNumberArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'number' && Number.isFinite(item))
  );
}

export function parseChartSpec(raw: string): ChartSpec | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const spec = parsed as Record<string, unknown>;
    const type = spec.type === 'line' ? 'line' : 'bar';
    const labels = Array.isArray(spec.labels)
      ? spec.labels.filter((item): item is string => typeof item === 'string')
      : [];
    const values = spec.values;
    let series: number[][] = [];
    if (isNumberArray(values)) {
      series = [values];
    } else if (Array.isArray(values) && values.every(isNumberArray)) {
      series = values as number[][];
    }
    const seriesNames = Array.isArray(spec.seriesNames)
      ? spec.seriesNames.filter(
          (item): item is string => typeof item === 'string',
        )
      : [];
    return {
      title: typeof spec.title === 'string' ? spec.title : undefined,
      type,
      labels,
      values: series.length > 1 ? series : (series[0] ?? []),
      seriesNames,
    };
  } catch {
    return null;
  }
}

/**
 * Extract fenced blocks from a model response into artifact windows and
 * replace each block with an inline `[art:<kind>:<title>]` marker.
 */
export function parseArtifacts(content: string): {
  text: string;
  artifacts: ParsedArtifact[];
} {
  const artifacts: ParsedArtifact[] = [];
  let text = content;
  let match: RegExpExecArray | null;
  let index = 0;

  FENCED_BLOCK.lastIndex = 0;
  while ((match = FENCED_BLOCK.exec(content)) !== null) {
    const language = (match[1] || '').trim().toLowerCase();
    const payload = match[2];
    const id = `artifact-${index}-${Date.now()}`;

    let parsed: ParsedArtifact | null = null;

    if (language.startsWith('chart')) {
      const spec = parseChartSpec(payload);
      if (spec) {
        parsed = {
          marker: marker('chart', id, spec.title ?? 'Chart'),
          window: {
            id,
            kind: 'chart',
            title: spec.title ?? 'Chart',
            w: 380,
            h: 300,
            content: { kind: 'chart', spec },
          },
        };
      }
    } else if (language === 'note' || language === 'card') {
      const title = extractTitle(payload, 'Note');
      parsed = {
        marker: marker('note', id, title),
        window: {
          id,
          kind: 'note',
          title,
          w: 320,
          h: 220,
          content: { kind: 'note', text: payload.trim() },
        },
      };
    } else if (language === 'table') {
      const title = extractTitle(payload, 'Table');
      parsed = {
        marker: marker('table', id, title),
        window: {
          id,
          kind: 'table',
          title,
          w: 360,
          h: 260,
          content: { kind: 'table', markdown: payload.trim() },
        },
      };
    } else if (language === 'mermaid' || language === 'graph') {
      const title = extractTitle(payload, 'Diagram');
      parsed = {
        marker: marker('diagram', id, title),
        window: {
          id,
          kind: 'diagram',
          title,
          w: 400,
          h: 320,
          content: { kind: 'diagram', source: payload.trim() },
        },
      };
    } else if (language === 'image' || language === 'img') {
      const title = extractTitle(payload, 'Image');
      parsed = {
        marker: marker('image', id, title),
        window: {
          id,
          kind: 'image',
          title,
          w: 360,
          h: 280,
          content: { kind: 'image', url: payload.trim(), caption: title },
        },
      };
    } else {
      // Any other fenced block becomes a code window.
      const languageLabel = language || 'code';
      parsed = {
        marker: marker('code', id, languageLabel),
        window: {
          id,
          kind: 'code',
          title: `${languageLabel} · block`,
          w: 400,
          h: 300,
          content: { kind: 'code', language: languageLabel, code: payload },
        },
      };
    }

    if (parsed) {
      artifacts.push(parsed);
      text = text.replace(match[0], parsed.marker);
      index += 1;
    }
  }

  return { text, artifacts };
}

/** Rendered inline marker: `[art:<kind>:<id>|<title>]` → chip. */
export type ArtifactMarker = {
  kind: ArtifactKind;
  id: string;
  title: string;
};

export function parseMarker(marker: string): ArtifactMarker | null {
  const match = /^\[art:([a-z]+):([^|\]]+)\|([^\]]*)\]$/.exec(marker.trim());
  if (!match) return null;
  return {
    kind: match[1] as ArtifactKind,
    id: match[2],
    title: unescapeMarker(match[3]),
  };
}

export const ARTIFACT_ICONS: Record<ArtifactKind, string> = {
  chart: '📊',
  code: '💻',
  note: '🗒️',
  table: '📋',
  diagram: '🔀',
  image: '🖼️',
};

export function defaultChatWindowState(
  desktopW: number,
  desktopH: number,
): ChatWindowState {
  return {
    x: 24,
    y: 24,
    w: Math.max(340, Math.min(460, Math.round(desktopW * 0.34))),
    h: Math.max(360, Math.round(desktopH * 0.78)),
    z: 10,
    minimized: false,
  };
}

export function autoPlaceArtifact(
  window: Omit<ArtifactWindow, 'x' | 'y' | 'z' | 'minimized' | 'createdAt'>,
  index: number,
  chatX: number,
  chatY: number,
): ArtifactWindow {
  const cascade = 36;
  const baseX = chatX + 120 + (index % 3) * cascade;
  const baseY = chatY + 60 + (index % 3) * cascade;
  return {
    ...window,
    x: baseX,
    y: baseY,
    z: 20 + index,
    minimized: false,
    createdAt: new Date().toISOString(),
  };
}

function escapeMarker(value: string) {
  return value.replace(/[[\]\n:|]/g, ' ').trim();
}

function unescapeMarker(value: string) {
  return value.trim();
}
