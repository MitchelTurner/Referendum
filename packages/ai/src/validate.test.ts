import { describe, expect, it } from 'vitest';
import type { Excerpt } from './schemas';
import { validateAskOutput } from './validate';

const excerpts: Excerpt[] = [
  { index: 0, text: 'The rate is 84 cents per foot.', pageId: 'p1', documentTitle: 'Staff report', pageNumber: 1 },
];

describe('validateAskOutput', () => {
  it('accepts a quote that appears in the excerpt', () => {
    const result = validateAskOutput(
      {
        answer: 'The rate is 84 cents per foot. [1]',
        citations: [{ excerptIndex: 0, quote: '84 cents per foot' }],
        answered: true,
      },
      excerpts,
    );
    expect(result.ok).toBe(true);
  });

  it('rejects a citation that is not a substring or an invalid index', () => {
    const badQuote = validateAskOutput(
      {
        answer: 'No.',
        citations: [{ excerptIndex: 0, quote: 'one dollar' }],
        answered: true,
      },
      excerpts,
    );
    expect(badQuote.ok).toBe(false);
    const badIndex = validateAskOutput(
      {
        answer: 'No.',
        citations: [{ excerptIndex: 3, quote: '84 cents' }],
        answered: true,
      },
      excerpts,
    );
    expect(badIndex.ok).toBe(false);
  });
});
