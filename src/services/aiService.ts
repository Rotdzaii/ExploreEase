const HF_EMBEDDING_MODEL = 'sentence-transformers/all-MiniLM-L6-v2';
const HF_EMBEDDING_ENDPOINT = `https://api-inference.huggingface.co/pipeline/feature-extraction/${HF_EMBEDDING_MODEL}`;
const EMBEDDING_DIMENSION = 384;
const EMBEDDING_TIMEOUT_MS = 18_000;

type HuggingFaceErrorPayload = {
  error?: string;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isNumberArray = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every(isFiniteNumber);

const toNumberMatrix = (value: unknown): number[][] | null => {
  if (isNumberArray(value)) return [value];

  if (!Array.isArray(value) || value.length === 0) return null;

  if (value.every(isNumberArray)) {
    return value as number[][];
  }

  // Hugging Face can return nested arrays for batched inputs, e.g. [[[...]]].
  if (value.length === 1) {
    return toNumberMatrix(value[0]);
  }

  return null;
};

const l2Normalize = (vector: number[]) => {
  const norm = Math.sqrt(vector.reduce((acc, cur) => acc + cur * cur, 0));
  if (!Number.isFinite(norm) || norm <= 0) return vector;
  return vector.map((value) => value / norm);
};

const meanPoolToVector = (matrix: number[][]): number[] => {
  if (matrix.length === 0) {
    throw new Error('Embedding response is empty.');
  }

  const dimension = matrix[0]?.length ?? 0;
  if (dimension !== EMBEDDING_DIMENSION) {
    throw new Error(`Unexpected embedding dimension: ${dimension}. Expected ${EMBEDDING_DIMENSION}.`);
  }

  const sums = new Array<number>(EMBEDDING_DIMENSION).fill(0);
  let validRows = 0;

  for (const row of matrix) {
    if (!Array.isArray(row) || row.length !== EMBEDDING_DIMENSION || !row.every(isFiniteNumber)) continue;

    validRows += 1;
    for (let i = 0; i < EMBEDDING_DIMENSION; i += 1) {
      sums[i] += row[i];
    }
  }

  if (validRows === 0) {
    throw new Error('No valid embedding rows in provider response.');
  }

  return sums.map((value) => value / validRows);
};

const createDeterministicFallbackEmbedding = (text: string): number[] => {
  const output = new Array<number>(EMBEDDING_DIMENSION).fill(0);
  const normalized = text.trim().toLowerCase();

  if (!normalized) return output;

  for (let i = 0; i < normalized.length; i += 1) {
    const code = normalized.charCodeAt(i);
    const slot = (code * 31 + i * 17) % EMBEDDING_DIMENSION;
    const altSlot = (slot * 13 + 7) % EMBEDDING_DIMENSION;

    output[slot] += ((code % 89) + 1) / 100;
    output[altSlot] -= ((code % 53) + 1) / 200;
  }

  return l2Normalize(output);
};

const parseEmbeddingPayload = (payload: unknown): number[] => {
  const matrix = toNumberMatrix(payload);
  if (!matrix) {
    throw new Error('Unable to parse embedding payload from provider.');
  }

  return l2Normalize(meanPoolToVector(matrix));
};

export async function generateEmbedding(text: string): Promise<number[]> {
  const queryText = String(text ?? '').trim();
  if (!queryText) {
    throw new Error('Text is required to generate embedding.');
  }

  const token = process.env.EXPO_PUBLIC_HF_TOKEN?.trim();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, EMBEDDING_TIMEOUT_MS);

  try {
    const response = await fetch(HF_EMBEDDING_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        inputs: queryText,
        options: {
          wait_for_model: true,
          use_cache: true,
        },
      }),
      signal: abortController.signal,
    });

    const payload = (await response.json().catch(() => null)) as unknown;

    if (!response.ok) {
      const providerMessage =
        typeof (payload as HuggingFaceErrorPayload | null)?.error === 'string'
          ? (payload as HuggingFaceErrorPayload).error
          : `Hugging Face request failed with status ${response.status}.`;
      throw new Error(providerMessage);
    }

    return parseEmbeddingPayload(payload);
  } catch (err: any) {
    console.warn('generateEmbedding fallback activated:', err?.message ?? err);
    return createDeterministicFallbackEmbedding(queryText);
  } finally {
    clearTimeout(timeout);
  }
}
