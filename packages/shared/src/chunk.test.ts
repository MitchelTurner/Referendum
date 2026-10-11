import { describe, expect, it } from 'vitest';
import { chunkPageText } from './chunk';

describe('chunkPageText', () => {
  it('keeps overlap and stays inside one page of text', () => {
    const words = Array.from({ length: 1000 }, (_, i) => `w${i}`);
    const chunks = chunkPageText(words.join(' '), 800, 100);
    expect(chunks.length).toBe(2);
    expect(chunks[0]?.split(' ').length).toBe(800);
    expect(chunks[1]?.startsWith('w700')).toBe(true);
    expect(chunks[1]?.endsWith('w999')).toBe(true);
  });

  it('does not merge two pages', () => {
    const a = chunkPageText('alpha page only', 800, 100);
    const b = chunkPageText('beta page only', 800, 100);
    expect(a).toEqual(['alpha page only']);
    expect(b).toEqual(['beta page only']);
    expect(a.join(' ')).not.toContain('beta');
  });
});
