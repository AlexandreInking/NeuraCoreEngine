export type DeepSeekConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

export const DEFAULT_DEEPSEEK_CONFIG: DeepSeekConfig = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash-0731',
};

export type DeepSeekMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export function apiUrl(baseUrl: string, path: string) {
  return `${baseUrl.trim().replace(/\/+$/, '')}${path}`;
}

export async function deepSeekChat(
  config: DeepSeekConfig,
  messages: DeepSeekMessage[],
): Promise<string> {
  if (!config.apiKey.trim()) {
    throw new Error('DeepSeek API key is not configured.');
  }

  const response = await fetch(apiUrl(config.baseUrl, '/chat/completions'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model.trim() || DEFAULT_DEEPSEEK_CONFIG.model,
      messages,
    }),
  });
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(
      payload.error?.message ?? `DeepSeek request failed (${response.status}).`,
    );
  }
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error('DeepSeek returned an empty response.');
  return content;
}

export async function testDeepSeekConnection(config: DeepSeekConfig) {
  if (!config.apiKey.trim()) throw new Error('Enter a DeepSeek API key first.');
  const response = await fetch(apiUrl(config.baseUrl, '/models'), {
    headers: { Authorization: `Bearer ${config.apiKey.trim()}` },
  });
  if (!response.ok) {
    const payload = (await response.json()) as { error?: { message?: string } };
    throw new Error(
      payload.error?.message ?? `Connection failed (${response.status}).`,
    );
  }
}
