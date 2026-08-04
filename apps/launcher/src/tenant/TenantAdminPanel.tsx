import { useState } from 'react';
import {
  tenantsFor,
  appendAudit,
  readAudit,
  namespacesOf,
  type Tenant,
} from './index';

/**
 * Tenant & API keys admin (hito 9.1-9.3): tenants, JWT tokens, audit log
 * and namespace isolation view.
 */
export function TenantAdminPanel() {
  const store = tenantsFor();
  const [tenants, setTenants] = useState<Tenant[]>(store.tenantsList());
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<Tenant['role']>('agent');
  const [ttlHours, setTtlHours] = useState(24);
  const [token, setToken] = useState('');
  const [tokenResult, setTokenResult] = useState('');
  const [verifyInput, setVerifyInput] = useState('');
  const [verifyResult, setVerifyResult] = useState('');
  const [audit, setAudit] = useState(readAudit());

  const refreshAudit = () => setAudit(readAudit());

  const addTenant = () => {
    if (!newName.trim()) return;
    const tenant = store.addTenant(newName.trim(), newRole);
    setTenants(store.tenantsList());
    appendAudit({
      tenantId: tenant.id,
      action: 'tenant.create',
      target: tenant.id,
      actor: 'admin',
      ok: true,
    });
    refreshAudit();
    setNewName('');
  };

  const removeTenant = (id: string) => {
    store.removeTenant(id);
    setTenants(store.tenantsList());
    appendAudit({
      tenantId: id,
      action: 'tenant.delete',
      target: id,
      actor: 'admin',
      ok: true,
    });
    refreshAudit();
  };

  const issueToken = async (tenantId: string) => {
    const created = await store.createToken(tenantId, ttlHours);
    if (created) {
      setToken(created);
      setTokenResult(`Token para ${tenantId} (${ttlHours}h):`);
      appendAudit({
        tenantId,
        action: 'token.issue',
        target: tenantId,
        actor: 'admin',
        ok: true,
      });
      refreshAudit();
    }
  };

  const verify = async () => {
    const payload = await store.verifyToken(verifyInput.trim());
    if (payload) {
      setVerifyResult(
        `Válido · tenant ${payload.sub} · rol ${payload.role} · expira ${new Date(payload.exp * 1000).toLocaleString()}`,
      );
      appendAudit({
        tenantId: payload.sub,
        action: 'token.verify',
        target: payload.sub,
        actor: 'admin',
        ok: true,
      });
    } else {
      setVerifyResult('Token inválido o expirado.');
      appendAudit({ tenantId: 'unknown', action: 'token.verify', target: 'unknown', actor: 'admin', ok: false });
    }
    refreshAudit();
  };

  return (
    <article className="surface settings-card">
      <div className="surface-header">
        <div>
          <span className="section-kicker">TENANTS & API KEYS</span>
          <h3>Multi-tenant (JWT HS256)</h3>
        </div>
        <span className="surface-badge">ISOLATION</span>
      </div>
      <p className="surface-copy">
        Cada tenant tiene su propio espacio de memoria (namespacing L0-L3) y sus tokens JWT firmados
        con HMAC-SHA256. El secret se genera una vez y se guarda en el dispositivo.
      </p>

      <div className="l1-actions settings-actions">
        <input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="Nombre del tenant…"
          aria-label="Nombre del tenant"
        />
        <select
          className="l2-status-select"
          value={newRole}
          onChange={(event) => setNewRole(event.target.value as Tenant['role'])}
          aria-label="Rol"
        >
          <option value="admin">admin</option>
          <option value="agent">agent</option>
          <option value="readonly">readonly</option>
        </select>
        <button className="button-primary" type="button" onClick={addTenant}>
          Crear tenant
        </button>
      </div>

      <div className="l3-snapshots">
        {tenants.map((tenant) => (
          <div className="l3-test-record provider-row" key={tenant.id}>
            <div className="provider-info">
              <strong>{tenant.name}</strong>
              <small>
                {tenant.id} · {tenant.role} · key {tenant.apiKey.slice(0, 8)}…
              </small>
            </div>
            <span className="surface-badge">namespaces: {namespacesOf(tenant.id).length}</span>
            <button className="memory-action" type="button" onClick={() => void issueToken(tenant.id)}>
              Token ({ttlHours}h)
            </button>
            {tenant.id !== 'default' ? (
              <button
                className="memory-action memory-action-danger"
                type="button"
                onClick={() => removeTenant(tenant.id)}
              >
                ×
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <label className="vad-slider">
        <span>TTL de tokens</span>
        <input
          type="range"
          min={1}
          max={168}
          step={1}
          value={ttlHours}
          onChange={(event) => setTtlHours(Number(event.target.value))}
        />
        <code>{ttlHours}h</code>
      </label>

      {token ? (
        <div className="l3-test-output">
          <span className="panel-caption">{tokenResult}</span>
          <pre className="l2-drilldown-raw" style={{ maxHeight: 90 }}>{token}</pre>
        </div>
      ) : null}

      <div className="l1-actions settings-actions">
        <input
          value={verifyInput}
          onChange={(event) => setVerifyInput(event.target.value)}
          placeholder="Pega un token JWT…"
          aria-label="Token a verificar"
        />
        <button className="memory-action" type="button" onClick={() => void verify()}>
          Verificar token
        </button>
      </div>
      {verifyResult ? <p className="l1-note" role="status">{verifyResult}</p> : null}

      <div className="l3-subheading">Auditoría</div>
      <div className="l1-logs">
        {audit.slice(-10).reverse().map((entry, index) => (
          <small key={index} className={`l1-log-line ${entry.ok ? '' : 'muted'}`}>
            {new Date(entry.at).toLocaleTimeString()} · {entry.tenantId} · {entry.action} ·{' '}
            {entry.target} · {entry.ok ? 'ok' : 'FAIL'}
          </small>
        ))}
      </div>
    </article>
  );
}
