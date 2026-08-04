export type DeepSeekConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

export const DEFAULT_DEEPSEEK_CONFIG: DeepSeekConfig = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
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

export type StreamedReply = {
  content: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
};

/** Streaming chat completion: tokens are delivered one by one via `onToken`. */
export async function deepSeekChatStream(
  config: DeepSeekConfig,
  messages: DeepSeekMessage[],
  onToken: (token: string) => void,
): Promise<StreamedReply> {
  if (!config.apiKey.trim()) {
    throw new Error('DeepSeek API key is not configured.');
  }
  const startedAt = Date.now();
  const response = await fetch(apiUrl(config.baseUrl, '/chat/completions'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model.trim() || DEFAULT_DEEPSEEK_CONFIG.model,
      messages,
      stream: true,
    }),
  });
  if (!response.ok || !response.body) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(
      payload?.error?.message ??
        `DeepSeek request failed (${response.status}).`,
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const token = parsed.choices?.[0]?.delta?.content;
        if (token) {
          content += token;
          onToken(token);
        }
      } catch {
        // partial SSE line; keep reading
      }
    }
  }

  const latencyMs = Date.now() - startedAt;
  return {
    content,
    promptTokens: estimateTokens(messages.map((m) => m.content).join('\n')),
    completionTokens: estimateTokens(content),
    latencyMs,
  };
}

function estimateTokens(text: string) {
  // ~4 chars per token approximation for the metrics display.
  return Math.max(1, Math.round(text.length / 4));
}
