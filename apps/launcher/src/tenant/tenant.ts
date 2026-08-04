import { createJwt, verifyJwt, type JwtPayload } from './auth';

export type Tenant = {
  id: string;
  name: string;
  role: 'admin' | 'agent' | 'readonly';
  apiKey: string;
  allowedModels: string[];
  createdAt: number;
};

const STORAGE_KEY = 'neuracore-tenants';
const SECRET_KEY = 'neuracore-jwt-secret';

export class TenantStore {
  private tenants: Tenant[];

  constructor() {
    this.tenants = this.read();
    if (!this.tenants.length) {
      this.tenants = [
        {
          id: 'default',
          name: 'Default',
          role: 'admin',
          apiKey: 'dev-key',
          allowedModels: ['deepseek-chat'],
          createdAt: Date.now(),
        },
      ];
      this.save();
    }
  }

  private read(): Tenant[] {
    try {
      const raw = globalThis.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as Tenant[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private save() {
    try {
      globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.tenants));
    } catch {
      // storage unavailable
    }
  }

  secret(): string {
    try {
      const existing = globalThis.localStorage.getItem(SECRET_KEY);
      if (existing) return existing;
      const generated = Array.from({ length: 32 }, () =>
        Math.floor(Math.random() * 36).toString(36),
      ).join('');
      globalThis.localStorage.setItem(SECRET_KEY, generated);
      return generated;
    } catch {
      return 'insecure-fallback-secret';
    }
  }

  tenantsList() {
    return [...this.tenants];
  }

  addTenant(name: string, role: Tenant['role']): Tenant {
    const tenant: Tenant = {
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name,
      role,
      apiKey: `key-${Array.from({ length: 16 }, () =>
        Math.floor(Math.random() * 36).toString(36),
      ).join('')}`,
      allowedModels: ['deepseek-chat'],
      createdAt: Date.now(),
    };
    this.tenants = [...this.tenants, tenant];
    this.save();
    return tenant;
  }

  removeTenant(id: string) {
    if (id === 'default') return;
    this.tenants = this.tenants.filter((tenant) => tenant.id !== id);
    this.save();
  }

  async createToken(tenantId: string, ttlHours: number): Promise<string | null> {
    const tenant = this.tenants.find((item) => item.id === tenantId);
    if (!tenant) return null;
    const now = Math.floor(Date.now() / 1000);
    const payload: JwtPayload = {
      sub: tenant.id,
      role: tenant.role,
      iat: now,
      exp: now + ttlHours * 3600,
    };
    return createJwt(payload, this.secret());
  }

  async verifyToken(token: string): Promise<JwtPayload | null> {
    return verifyJwt(token, this.secret());
  }
}

let tenantStore: TenantStore | null = null;

export function tenantsFor(): TenantStore {
  if (!tenantStore) tenantStore = new TenantStore();
  return tenantStore;
}
