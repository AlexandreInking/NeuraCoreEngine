export type ProviderKind = 'deepseek' | 'openai' | 'azure' | 'openai-compatible';

export type ProviderConfig = {
  id: string;
  name: string;
  kind: ProviderKind;
  apiKey: string;
  baseUrl: string;
  model: string;
};

export type LlmMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type LlmResult = {
  content: string;
  providerId: string;
  model: string;
  latencyMs: number;
};

export const PROVIDER_KIND_LABELS: Record<ProviderKind, string> = {
  deepseek: 'DeepSeek',
  openai: 'OpenAI',
  azure: 'Azure OpenAI',
  'openai-compatible': 'OpenAI-compatible',
};

export const DEFAULT_PROVIDER_BASES: Record<ProviderKind, string> = {
  deepseek: 'https://api.deepseek.com',
  openai: 'https://api.openai.com/v1',
  azure: 'https://YOUR_RESOURCE.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT',
  'openai-compatible': 'http://localhost:11434/v1',
};

export function defaultProvider(kind: ProviderKind): ProviderConfig {
  return {
    id: `${kind}-${Date.now().toString(36)}`,
    name: PROVIDER_KIND_LABELS[kind],
    kind,
    apiKey: '',
    baseUrl: DEFAULT_PROVIDER_BASES[kind],
    model: kind === 'deepseek' ? 'deepseek-chat' : 'gpt-4o-mini',
  };
}

export function providerUrl(baseUrl: string) {
  return `${baseUrl.trim().replace(/\/+$/, '')}`;
}

export const DEFAULT_LLM_TIMEOUT_MS = 15_000;
export const DEFAULT_TEST_TIMEOUT_MS = 5_000;

function timeoutError(label: string, timeoutMs: number): Error {
  return new Error(`${label}: timeout tras ${Math.round(timeoutMs / 1000)}s`);
}

/** fetch con AbortController: garantiza que ninguna llamada al LLM cuelgue el chat. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw timeoutError(url, timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Open (streaming-less) chat completion against any /chat/completions API. */
export async function chatCompletion(
  provider: ProviderConfig,
  messages: LlmMessage[],
  timeoutMs = DEFAULT_LLM_TIMEOUT_MS,
): Promise<string> {
  if (!provider.apiKey.trim()) {
    throw new Error(`${provider.name}: API key no configurada.`);
  }
  const response = await fetchWithTimeout(
    `${providerUrl(provider.baseUrl)}/chat/completions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${provider.apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: provider.model.trim(),
        messages,
      }),
    },
    timeoutMs,
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(
      payload?.error?.message ?? `${provider.name} failed (${response.status}).`,
    );
  }
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content ?? '';
  if (!content) throw new Error(`${provider.name}: respuesta vacía.`);
  return content;
}

export async function testProviderConnection(provider: ProviderConfig): Promise<void> {
  if (!provider.apiKey.trim()) throw new Error('Enter an API key first.');
  const response = await fetchWithTimeout(
    `${providerUrl(provider.baseUrl)}/models`,
    { headers: { Authorization: `Bearer ${provider.apiKey.trim()}` } },
    DEFAULT_TEST_TIMEOUT_MS,
  );
  if (!response.ok) {
    throw new Error(`${provider.name} connection failed (${response.status}).`);
  }
}
