import { describe, expect, it } from 'vitest';
import { govColor, tokens } from './tokens';

describe('tokens', () => {
  it('keeps magenta reserved for the hazard ramp', () => {
    expect(tokens.color.hazard).toBe('#A3157F');
    expect(tokens.color.paper).toBe('#FBFAF5');
  });

  it('resolves government color tokens', () => {
    expect(govColor('gov.saxman')).toBe('#8A6416');
    expect(govColor('gov.unknown')).toBe(tokens.color.ink);
  });
});
