import type { AskOutput, Excerpt } from './schemas';

const STOP = new Set([
  'what', 'when', 'where', 'which', 'who', 'whom', 'why', 'how', 'does', 'do', 'did', 'is', 'are',
  'was', 'were', 'the', 'a', 'an', 'of', 'to', 'for', 'and', 'or', 'in', 'on', 'at', 'by', 'with',
  'from', 'that', 'this', 'it', 'be', 'as', 'about', 'into', 'would', 'could', 'should',
]);

function contentTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !STOP.has(token));
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function localAnswer(question: string, excerpts: Excerpt[]): AskOutput {
  const tokens = contentTokens(question);
  const scored = excerpts.map((excerpt) => {
    const hay = excerpt.text.toLowerCase();
    const matched = tokens.filter((token) => hay.includes(token));
    return { excerpt, matched };
  });
  scored.sort((a, b) => b.matched.length - a.matched.length);
  const best = scored[0];
  const strong =
    !!best &&
    (best.matched.length >= 2 || best.matched.some((token) => token.length >= 7));
  if (!best || !strong) {
    return {
      answer: 'The packet excerpts do not contain an answer to that question.',
      citations: [],
      answered: false,
    };
  }
  const picked = scored.filter((row) => row.matched.length > 0).slice(0, 2);
  const citations: AskOutput['citations'] = [];
  const parts: string[] = [];
  for (const row of picked) {
    const chosen =
      sentences(row.excerpt.text).find((sentence) =>
        row.matched.some((token) => sentence.toLowerCase().includes(token)),
      ) ?? row.excerpt.text.slice(0, 240);
    const quote = chosen.length > 280 ? chosen.slice(0, 280) : chosen;
    if (!row.excerpt.text.includes(quote)) continue;
    const marker = citations.length + 1;
    citations.push({ excerptIndex: row.excerpt.index, quote });
    parts.push(`${quote.replace(/\s+/g, ' ')} [${marker}]`);
  }
  if (citations.length === 0) {
    return {
      answer: 'The packet excerpts do not contain an answer to that question.',
      citations: [],
      answered: false,
    };
  }
  return {
    answer: parts.slice(0, 4).join(' '),
    citations,
    answered: true,
  };
}
