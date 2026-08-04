import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderManager } from '../src/llm/manager';
import { chatCompletion, defaultProvider, fetchWithTimeout } from '../src/llm/provider';

function hangingFetch() {
  const mock = vi.fn(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = (init?.signal ?? null) as AbortSignal | null;
        signal?.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted.', 'AbortError')),
        );
      }),
  );
  Object.defineProperty(globalThis, 'fetch', { value: mock, writable: true, configurable: true });
  return mock;
}

function mockStorage(initial: Record<string, string>) {
  const store = new Map(Object.entries(initial));
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    writable: true,
    configurable: true,
  });
  return store;
}

function mockFetch(status: number, body: unknown) {
  const mock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  Object.defineProperty(globalThis, 'fetch', { value: mock, writable: true, configurable: true });
  return mock;
}

const LEGACY_KEY = 'sk-test-legacy-deepseek-key-1234567890';

describe('llm/provider', () => {
  it('uses a real DeepSeek model name by default', () => {
    expect(defaultProvider('deepseek').model).toBe('deepseek-chat');
  });

  it('builds the chat completions request and parses the content', async () => {
    const fetchMock = mockFetch(200, {
      choices: [{ message: { content: 'respuesta del modelo' } }],
    });
    const provider = { ...defaultProvider('deepseek'), apiKey: 'sk-test' };
    const content = await chatCompletion(provider, [{ role: 'user', content: 'hola' }]);
    expect(content).toBe('respuesta del modelo');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer sk-test' });
  });

  it('throws a descriptive error on non-ok responses', async () => {
    mockFetch(400, { error: { message: 'Model Not Exist' } });
    await expect(
      chatCompletion({ ...defaultProvider('deepseek'), apiKey: 'sk-test' }, [{ role: 'user', content: 'x' }]),
    ).rejects.toThrow(/Model Not Exist/);
  });
});

describe('llm/manager — legacy merge and failover', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('merges the legacy DeepSeek key into an existing empty provider and generates', async () => {
    mockStorage({
      'neuracore-llm-providers': JSON.stringify({
        providers: [
          {
            id: 'deepseek-1',
            name: 'DeepSeek',
            kind: 'deepseek',
            apiKey: '',
            baseUrl: 'https://api.deepseek.com',
            model: 'deepseek-v4-flash-0731', // invalid legacy model → sanitized
          },
        ],
        activeId: 'deepseek-1',
        fallbackIds: [],
      }),
      'neuracore-deepseek': JSON.stringify({
        apiKey: LEGACY_KEY,
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-v4-flash-0731',
      }),
    });
    mockFetch(200, { choices: [{ message: { content: 'Hola, ¿cómo estás?' } }] });

    const manager = new ProviderManager();
    const provider = manager.activeProvider();
    expect(provider?.apiKey).toBe(LEGACY_KEY);
    expect(provider?.model).toBe('deepseek-chat'); // sanitized

    const result = await manager.generate([{ role: 'user', content: 'Hola' }]);
    expect(result.content).toBe('Hola, ¿cómo estás?');
    expect(result.usedFallback).toBe(false);
    expect(result.emergency).toBeUndefined();
  });

  it('falls back to the personality emergency response when every provider fails', async () => {
    mockStorage({}); // no providers, no legacy key
    mockFetch(500, { error: { message: 'boom' } });

    const manager = new ProviderManager();
    const result = await manager.generate([{ role: 'user', content: 'Hola' }], {
      traits: { honesty: 60, emotionality: 50, extraversion: 70, agreeableness: 60, conscientiousness: 60, openness: 60 },
    });
    expect(result.usedFallback).toBe(true);
    expect(result.emergency?.style).toBe('upbeat');
    expect(result.content).toContain('¡Ups!');
  });

  it('keeps a provider that already has a key untouched by the merge', async () => {
    mockStorage({
      'neuracore-llm-providers': JSON.stringify({
        providers: [
          { id: 'p1', name: 'DeepSeek', kind: 'deepseek', apiKey: 'sk-existing', baseUrl: 'https://api.deepseek.com', model: 'deepseek-reasoner' },
        ],
        activeId: 'p1',
        fallbackIds: [],
      }),
      'neuracore-deepseek': JSON.stringify({ apiKey: 'sk-legacy', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' }),
    });
    const manager = new ProviderManager();
    expect(manager.activeProvider()?.apiKey).toBe('sk-existing');
    expect(manager.activeProvider()?.model).toBe('deepseek-reasoner');
  });
});

describe('llm/timeouts — el chat nunca se cuelga', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('aborts a hanging fetch after the timeout', async () => {
    vi.useFakeTimers();
    hangingFetch();
    const promise = fetchWithTimeout('https://api.deepseek.com/models', {}, 1000);
    const assertion = expect(promise).rejects.toThrow(/timeout/);
    vi.advanceTimersByTime(1200);
    await assertion;
  });

  it('chatCompletion rejects with a descriptive timeout error', async () => {
    vi.useFakeTimers();
    hangingFetch();
    const promise = chatCompletion(
      { ...defaultProvider('deepseek'), apiKey: 'sk-test' },
      [{ role: 'user', content: 'hola' }],
      1000,
    );
    const assertion = expect(promise).rejects.toThrow(/timeout/);
    vi.advanceTimersByTime(1200);
    await assertion;
  });

  it('generate resolves to the emergency response when the LLM hangs', async () => {
    vi.useFakeTimers();
    mockStorage({});
    hangingFetch();
    const manager = new ProviderManager();
    const promise = manager.generate([{ role: 'user', content: 'hola' }], {
      traits: { honesty: 60, emotionality: 50, extraversion: 70, agreeableness: 60, conscientiousness: 60, openness: 60 },
    });
    const assertion = expect(promise).resolves.toMatchObject({
      usedFallback: true,
      emergency: { style: 'upbeat' },
    });
    await vi.advanceTimersByTimeAsync(26_000);
    await assertion;
  });
});
