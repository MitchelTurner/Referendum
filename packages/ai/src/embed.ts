/** Local feature-hashing embeddings. Production vendor is selected with EMBEDDING_PROVIDER. */
export const EMBEDDING_DIMENSIONS = 1024;

function hashToken(token: string): number {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash | 0;
}

export function embedText(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  const tokens = text.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2);
  for (const token of tokens) {
    const hash = hashToken(token);
    const index = Math.abs(hash) % EMBEDDING_DIMENSIONS;
    const sign = hash % 2 === 0 ? 1 : -1;
    vector[index] = (vector[index] ?? 0) + sign * (1 + Math.min(token.length, 12) / 12);
  }
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm);
  if (norm === 0) return vector;
  return vector.map((value) => value / norm);
}

export function vectorLiteral(values: number[]): string {
  return `[${values.map((value) => Number(value.toFixed(6))).join(',')}]`;
}
