import { describe, expect, it } from 'vitest';
import { normalizeQuestion, scrubPii } from './pii';

describe('scrubPii', () => {
  it('removes emails and phone numbers', () => {
    const scrubbed = scrubPii('Email ada@example.com or call (907) 555-0100 today.');
    expect(scrubbed).not.toContain('ada@example.com');
    expect(scrubbed).not.toContain('555-0100');
    expect(scrubbed).toContain('[redacted]');
  });
});

describe('normalizeQuestion', () => {
  it('collapses case and punctuation', () => {
    expect(normalizeQuestion('  What, is   the Rate? ')).toBe('what is the rate');
  });
});
