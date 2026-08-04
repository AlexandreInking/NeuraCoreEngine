import {
  chatCompletion,
  testProviderConnection,
  defaultProvider,
  type LlmMessage,
  type LlmResult,
  type ProviderConfig,
  type ProviderKind,
} from './provider';
import { personalityFallback, type EmergencyResponse } from './recovery';
import type { TraitProfile } from '../cognition/types';

type PersistedProviders = {
  providers: ProviderConfig[];
  activeId: string;
  fallbackIds: string[];
};

const STORAGE_KEY = 'neuracore-llm-providers';
const LEGACY_DEEPSEEK_KEY = 'neuracore-deepseek';

/** Real DeepSeek API model names (fallback-safe). */
const SAFE_DEEPSEEK_MODELS = new Set(['deepseek-chat', 'deepseek-reasoner']);

function sanitizeDeepSeekModel(model: string): string {
  return SAFE_DEEPSEEK_MODELS.has(model.trim()) ? model.trim() : 'deepseek-chat';
}

export type GenerateOptions = {
  onProviderAttempt?: (providerId: string, index: number) => void;
  traits?: TraitProfile | null;
};

export class ProviderManager {
  private data: PersistedProviders;

  constructor() {
    this.data = this.read();
    // Guarantee at least one provider (legacy DeepSeek config is merged in).
    if (!this.data.providers.length) {
      const deepseek = defaultProvider('deepseek');
      deepseek.model = sanitizeDeepSeekModel(deepseek.model);
      this.data.providers = [deepseek];
      this.data.activeId = deepseek.id;
    }
    this.mergeLegacyDeepSeek();
    this.save();
  }

  /**
   * Merge the legacy `neuracore-deepseek` config into any deepseek provider
   * whose key is empty. Runs on construction AND before every generate, so a
   * key saved after the provider list existed is still picked up.
   */
  private mergeLegacyDeepSeek() {
    try {
      const raw = globalThis.localStorage.getItem(LEGACY_DEEPSEEK_KEY);
      if (!raw) return;
      const legacy = JSON.parse(raw) as {
        apiKey?: string;
        baseUrl?: string;
        model?: string;
      };
      if (typeof legacy.apiKey !== 'string' || !legacy.apiKey.trim()) return;
      const legacyKey = legacy.apiKey;
      let changed = false;
      this.data.providers = this.data.providers.map((provider) => {
        if (provider.kind !== 'deepseek' || provider.apiKey.trim()) return provider;
        changed = true;
        return {
          ...provider,
          apiKey: legacyKey,
          baseUrl:
            typeof legacy.baseUrl === 'string' && legacy.baseUrl.trim()
              ? legacy.baseUrl
              : provider.baseUrl,
          model: sanitizeDeepSeekModel(
            typeof legacy.model === 'string' && legacy.model.trim()
              ? legacy.model
              : provider.model,
          ),
        };
      });
      if (changed) this.save();
    } catch {
      // storage unavailable or malformed — keep current providers
    }
  }

  private read(): PersistedProviders {
    try {
      const raw = globalThis.localStorage.getItem(STORAGE_KEY);
      if (!raw) return { providers: [], activeId: '', fallbackIds: [] };
      const parsed = JSON.parse(raw) as Partial<PersistedProviders>;
      return {
        providers: Array.isArray(parsed.providers) ? parsed.providers : [],
        activeId: typeof parsed.activeId === 'string' ? parsed.activeId : '',
        fallbackIds: Array.isArray(parsed.fallbackIds) ? parsed.fallbackIds : [],
      };
    } catch {
      return { providers: [], activeId: '', fallbackIds: [] };
    }
  }

  private save() {
    try {
      globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // storage unavailable
    }
  }

  providers() {
    return [...this.data.providers];
  }

  activeProvider(): ProviderConfig | null {
    return this.data.providers.find((provider) => provider.id === this.data.activeId) ?? null;
  }

  addProvider(kind: ProviderKind): ProviderConfig {
    const provider = defaultProvider(kind);
    this.data.providers = [...this.data.providers, provider];
    if (!this.data.activeId) this.data.activeId = provider.id;
    this.save();
    return provider;
  }

  updateProvider(provider: ProviderConfig) {
    this.data.providers = this.data.providers.map((item) =>
      item.id === provider.id ? provider : item,
    );
    this.save();
  }

  removeProvider(id: string) {
    this.data.providers = this.data.providers.filter((provider) => provider.id !== id);
    if (this.data.activeId === id) {
      this.data.activeId = this.data.providers[0]?.id ?? '';
    }
    this.data.fallbackIds = this.data.fallbackIds.filter((item) => item !== id);
    this.save();
  }

  setActive(id: string) {
    if (this.data.providers.some((provider) => provider.id === id)) {
      this.data.activeId = id;
      this.save();
    }
  }

  setFallbackOrder(ids: string[]) {
    this.data.fallbackIds = ids.filter((id) =>
      this.data.providers.some((provider) => provider.id === id),
    );
    this.save();
  }

  fallbackIds() {
    return [...this.data.fallbackIds];
  }

  async testActive(): Promise<void> {
    const active = this.activeProvider();
    if (!active) throw new Error('No hay proveedor activo.');
    await testProviderConnection(active);
  }

  /**
   * Generate with automatic failover: try the active provider, then each
   * fallback in order; if all fail, respond from personality (cap 18).
   */
  async generate(
    messages: LlmMessage[],
    options: GenerateOptions = {},
  ): Promise<LlmResult & { usedFallback: boolean; emergency?: EmergencyResponse }> {
    this.mergeLegacyDeepSeek();
    const active = this.activeProvider();
    const ordered: ProviderConfig[] = [];
    if (active) ordered.push(active);
    for (const id of this.data.fallbackIds) {
      const fallback = this.data.providers.find((provider) => provider.id === id);
      if (fallback && fallback.id !== active?.id) ordered.push(fallback);
    }

    const started = Date.now();
    for (let index = 0; index < ordered.length; index += 1) {
      const provider = ordered[index];
      options.onProviderAttempt?.(provider.id, index);
      try {
        const content = await chatCompletion(provider, messages);
        return {
          content,
          providerId: provider.id,
          model: provider.model,
          latencyMs: Date.now() - started,
          usedFallback: index > 0,
        };
      } catch {
        // try next provider
      }
    }

    // All providers failed → personality-based emergency response.
    const emergency = personalityFallback(options.traits ?? null);
    return {
      content: emergency.content,
      providerId: '',
      model: 'emergency',
      latencyMs: Date.now() - started,
      usedFallback: true,
      emergency,
    };
  }
}

let manager: ProviderManager | null = null;

export function providerManager(): ProviderManager {
  if (!manager) manager = new ProviderManager();
  return manager;
}
