import { describe, expect, it } from 'vitest';
import { extractMotionsLocal } from './minutes';

describe('extractMotionsLocal', () => {
  it('flags speakers who are not on the roster and keeps vote confidence', () => {
    const drafts = extractMotionsLocal({
      segments: [
        { speaker: '[DEMO] Ada Clerk', startSec: 12, text: 'I move to adopt the demo ordinance.' },
        { speaker: '[DEMO] Ben Chair', startSec: 20, text: 'Second.' },
        { speaker: 'Unknown Person', startSec: 30, text: 'Yes' },
      ],
      items: [{ position: '8.a', title: 'Demo ordinance' }],
      roster: [
        { id: 'p1', fullName: '[DEMO] Ada Clerk' },
        { id: 'p2', fullName: '[DEMO] Ben Chair' },
      ],
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.flags.some((flag) => flag.includes('Unknown Person'))).toBe(true);
    expect(drafts[0]?.votes[0]?.confidence).toBeLessThan(0.8);
    expect(drafts[0]?.moverName).toBe('[DEMO] Ada Clerk');
  });
});
