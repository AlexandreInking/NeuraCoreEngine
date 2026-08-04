import { env, pipeline } from '@huggingface/transformers';

// Local ONNX inference in the webview: no Docker, no external embedding API.
// The quantized all-MiniLM-L6-v2 model (384 dims) is downloaded on first use
// and cached by the browser.

let extractorPromise: ReturnType<typeof createExtractor> | null = null;

function createExtractor() {
  env.allowLocalModels = true;
  return pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
}

function getExtractor() {
  if (!extractorPromise) extractorPromise = createExtractor();
  return extractorPromise;
}

export const EMBEDDING_DIMENSION = 384;

export type EmbeddingStatus =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ready' }
  | { state: 'error'; message: string };

let status: EmbeddingStatus = { state: 'idle' };

export function embeddingStatus(): EmbeddingStatus {
  return status;
}

export function setEmbeddingStatus(next: EmbeddingStatus) {
  status = next;
}

/** Embed texts (mean-pooled, L2-normalized). Falls back to null on failure. */
export async function embedTexts(
  texts: string[],
): Promise<Float32Array[] | null> {
  const cleaned = texts.map((text) => text.trim()).filter(Boolean);
  if (!cleaned.length) return [];
  try {
    if (status.state !== 'ready') setEmbeddingStatus({ state: 'loading' });
    const extractor = await getExtractor();
    const output = await extractor(cleaned, {
      pooling: 'mean',
      normalize: true,
    });
    const data = output.data as Float32Array;
    const dim = (output.dims[output.dims.length - 1] ?? 0) as number;
    if (!dim) throw new Error('Embedding output has no dimension.');
    setEmbeddingStatus({ state: 'ready' });
    return cleaned.map((_, index) =>
      data.slice(index * dim, (index + 1) * dim),
    );
  } catch (error) {
    setEmbeddingStatus({
      state: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export function embedText(text: string): Promise<Float32Array[] | null> {
  return embedTexts([text]);
}
