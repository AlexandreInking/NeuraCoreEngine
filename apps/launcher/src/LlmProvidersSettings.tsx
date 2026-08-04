import { useState } from 'react';
import {
  providerManager,
  PROVIDER_KIND_LABELS,
  type ProviderConfig,
  type ProviderKind,
} from './llm';

const KINDS: ProviderKind[] = ['deepseek', 'openai', 'azure', 'openai-compatible'];

/**
 * Agnostic LLM providers settings (document cap 3): multi-provider config,
 * active provider selection, fallback order and connection tests.
 */
export function LlmProvidersSettings() {
  const manager = providerManager();
  const [providers, setProviders] = useState<ProviderConfig[]>(manager.providers());
  const [activeId, setActiveId] = useState(manager.activeProvider()?.id ?? '');
  const [fallbacks, setFallbacks] = useState<string[]>(manager.fallbackIds());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProviderConfig | null>(null);
  const [newKind, setNewKind] = useState<ProviderKind>('openai');
  const [status, setStatus] = useState('');
  const [testing, setTesting] = useState('');

  const refresh = () => {
    setProviders(manager.providers());
    setActiveId(manager.activeProvider()?.id ?? '');
    setFallbacks(manager.fallbackIds());
  };

  const addProvider = () => {
    const provider = manager.addProvider(newKind);
    refresh();
    setEditingId(provider.id);
    setDraft(provider);
    setStatus(`Proveedor ${PROVIDER_KIND_LABELS[newKind]} añadido — configura sus credenciales.`);
  };

  const startEdit = (provider: ProviderConfig) => {
    setEditingId(provider.id);
    setDraft({ ...provider });
  };

  const saveEdit = () => {
    if (!draft) return;
    manager.updateProvider(draft);
    refresh();
    setEditingId(null);
    setDraft(null);
    setStatus('Proveedor guardado.');
  };

  const removeProvider = (id: string) => {
    if (!window.confirm('Eliminar este proveedor?')) return;
    manager.removeProvider(id);
    refresh();
    setStatus('Proveedor eliminado.');
  };

  const toggleFallback = (id: string) => {
    const next = fallbacks.includes(id)
      ? fallbacks.filter((item) => item !== id)
      : [...fallbacks, id];
    setFallbacks(next);
    manager.setFallbackOrder(next);
  };

  const testProvider = async (provider: ProviderConfig) => {
    setTesting(provider.id);
    setStatus('');
    try {
      await import('./llm/provider').then((mod) => mod.testProviderConnection(provider));
      setStatus(`${provider.name}: conexión OK ✓`);
    } catch (error) {
      setStatus(`${provider.name}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setTesting('');
    }
  };

  return (
    <article className="surface settings-card">
      <div className="surface-header">
        <div>
          <span className="section-kicker">LLM PROVIDERS</span>
          <h3>Modelos agnósticos</h3>
        </div>
        <span className="surface-badge">MULTI · FALLBACK</span>
      </div>
      <p className="surface-copy">
        Configura varios proveedores de chat compatibles con <code>/chat/completions</code>. El
        activo se usa primero; si falla, se prueba cada fallback en orden y, si todos fallan, el
        agente responde desde su personalidad.
      </p>

      <div className="l1-actions settings-actions">
        <select
          className="l2-status-select"
          value={newKind}
          onChange={(event) => setNewKind(event.target.value as ProviderKind)}
          aria-label="Tipo de proveedor"
        >
          {KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {PROVIDER_KIND_LABELS[kind]}
            </option>
          ))}
        </select>
        <button className="button-primary" type="button" onClick={addProvider}>
          Añadir proveedor
        </button>
      </div>

      <div className="l3-snapshots">
        {providers.map((provider) => (
          <div className="l3-test-record provider-row" key={provider.id}>
            {editingId === provider.id && draft ? (
              <div className="provider-edit">
                <label>
                  Nombre
                  <input
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  />
                </label>
                <label>
                  Base URL
                  <input
                    value={draft.baseUrl}
                    onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
                  />
                </label>
                <label>
                  Modelo
                  <input
                    value={draft.model}
                    onChange={(event) => setDraft({ ...draft, model: event.target.value })}
                  />
                </label>
                <label>
                  API key
                  <input
                    type="password"
                    value={draft.apiKey}
                    onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })}
                    placeholder="sk-…"
                  />
                </label>
                <div className="l1-actions">
                  <button className="button-primary" type="button" onClick={saveEdit}>
                    Guardar
                  </button>
                  <button className="memory-action" type="button" onClick={() => setEditingId(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="provider-info">
                  <strong>{provider.name}</strong>
                  <small>
                    {PROVIDER_KIND_LABELS[provider.kind]} · {provider.model} ·{' '}
                    {provider.apiKey ? 'key ✓' : 'sin key'}
                  </small>
                </div>
                <button
                  className={`memory-action ${activeId === provider.id ? 'provider-active' : ''}`}
                  type="button"
                  onClick={() => {
                    manager.setActive(provider.id);
                    refresh();
                  }}
                >
                  {activeId === provider.id ? 'ACTIVO' : 'Activar'}
                </button>
                <label className="l1-toggle l1-toggle-inline" title="Usar como fallback">
                  <input
                    type="checkbox"
                    checked={fallbacks.includes(provider.id)}
                    onChange={() => toggleFallback(provider.id)}
                  />
                  <span className="l1-toggle-track" aria-hidden="true" />
                  fallback
                </label>
                <button
                  className="memory-action"
                  type="button"
                  onClick={() => void testProvider(provider)}
                  disabled={testing === provider.id}
                >
                  {testing === provider.id ? 'Probando…' : 'Test'}
                </button>
                <button className="memory-action" type="button" onClick={() => startEdit(provider)}>
                  Editar
                </button>
                <button
                  className="memory-action memory-action-danger"
                  type="button"
                  onClick={() => removeProvider(provider.id)}
                >
                  ×
                </button>
              </>
            )}
          </div>
        ))}
      </div>
      {status ? <p className="l1-note" role="status">{status}</p> : null}
    </article>
  );
}
