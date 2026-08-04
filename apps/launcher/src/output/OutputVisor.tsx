import { useState } from 'react';
import { validatePayload, payloadBytes } from './schema';
import type { NeuraCoreOutputPayload } from './payload';

/**
 * SDK payload viewer (hito 8.2): validation badge, byte size, copy and
 * per-section collapse.
 */
export function OutputVisor({ payload }: { payload: NeuraCoreOutputPayload }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const validation = validatePayload(payload);
  const bytes = payloadBytes(payload);

  const toggle = (key: string) =>
    setCollapsed((current) => ({ ...current, [key]: !current[key] }));

  const section = (key: keyof NeuraCoreOutputPayload, content: string) => {
    const isCollapsed = collapsed[key];
    return (
      <div className="output-section" key={key}>
        <button
          type="button"
          className="output-section-toggle"
          onClick={() => toggle(key)}
        >
          <span>{isCollapsed ? '▸' : '▾'}</span> {key}
          <code>{bytes > 0 ? '' : ''}</code>
        </button>
        {!isCollapsed ? <pre>{content}</pre> : null}
      </div>
    );
  };

  const pretty = (value: unknown) => JSON.stringify(value, null, 2);

  return (
    <div className="output-visor">
      <div className="l1-actions">
        <span
          className={`surface-badge ${validation.valid ? 'surface-badge-ready' : ''}`}
        >
          {validation.valid ? 'SCHEMA OK' : 'SCHEMA INVALID'}
        </span>
        <span className="surface-badge">{bytes} bytes</span>
        <button
          className="memory-action"
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(pretty(payload));
          }}
        >
          Copiar JSON
        </button>
      </div>
      {!validation.valid ? (
        <ul className="output-errors">
          {validation.errors.slice(0, 6).map((error, index) => (
            <li key={index}>{typeof error === 'string' ? error : error.message}</li>
          ))}
        </ul>
      ) : null}
      {section('affectState', pretty(payload.affectState))}
      {section('memoryTrace', pretty(payload.memoryTrace))}
      {section('cognitiveOutput', pretty(payload.cognitiveOutput))}
      {section('behavioralTriggers', pretty(payload.behavioralTriggers))}
    </div>
  );
}
