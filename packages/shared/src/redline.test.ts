import { describe, expect, it } from 'vitest';
import { sectionDiff } from './redline';

describe('sectionDiff', () => {
  it('diffs insertions and deletions inside a section', () => {
    const diff = sectionDiff(
      'Section 1\nThe rate is 50 cents.\n',
      'Section 1\nThe rate is 84 cents.\n',
    );
    const ops = diff[0]?.ops ?? [];
    expect(ops.some((op) => op.type === 'del' && op.text.includes('50'))).toBe(true);
    expect(ops.some((op) => op.type === 'ins' && op.text.includes('84'))).toBe(true);
    expect(ops.some((op) => op.type === 'eq' && op.text.includes('The rate is'))).toBe(true);
  });
});
