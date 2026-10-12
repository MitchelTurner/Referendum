import { describe, expect, it } from 'vitest';
import { can } from './policy';

describe('policy', () => {
  it('lets a clerk configure and publish, and not a deputy configure', () => {
    expect(can({ role: 'CLERK', action: 'government.configure' })).toBe(true);
    expect(can({ role: 'DEPUTY_CLERK', action: 'government.configure' })).toBe(false);
    expect(can({ role: 'DEPUTY_CLERK', action: 'item.publish' })).toBe(true);
  });

  it('limits staff edits to their own items', () => {
    expect(can({ role: 'STAFF', action: 'item.edit', ownsResource: false })).toBe(false);
    expect(can({ role: 'STAFF', action: 'item.edit', ownsResource: true })).toBe(true);
    expect(can({ role: 'CLERK', action: 'item.edit' })).toBe(true);
  });

  it('only lets the assigned reviewer decide a step', () => {
    expect(can({ role: 'REVIEWER', action: 'review.decide', assigned: true })).toBe(true);
    expect(can({ role: 'REVIEWER', action: 'review.decide', assigned: false })).toBe(false);
    expect(can({ role: 'ADMIN', action: 'review.decide', assigned: true })).toBe(false);
  });

  it('lets the chair run live and ask, and only clerks hide comments', () => {
    expect(can({ role: 'CHAIR', action: 'live.run' })).toBe(true);
    expect(can({ role: 'CHAIR', action: 'vote.record' })).toBe(true);
    expect(can({ role: 'MEMBER', action: 'staffquestion.ask' })).toBe(true);
    expect(can({ role: 'MEMBER', action: 'live.run' })).toBe(false);
    expect(can({ role: 'DEPUTY_CLERK', action: 'comment.hide' })).toBe(false);
    expect(can({ role: 'CLERK', action: 'comment.hide' })).toBe(true);
    expect(can({ role: 'DEPUTY_CLERK', action: 'motion.accept' })).toBe(true);
  });

  it('reserves export for admins and lets viewers read', () => {
    expect(can({ role: 'ADMIN', action: 'data.export' })).toBe(true);
    expect(can({ role: 'CLERK', action: 'data.export' })).toBe(false);
    expect(can({ role: 'VIEWER', action: 'record.read' })).toBe(true);
    expect(can({ role: 'CLERK', action: 'records.manage' })).toBe(true);
    expect(can({ role: 'DEPUTY_CLERK', action: 'records.manage' })).toBe(true);
    expect(can({ role: 'VIEWER', action: 'records.manage' })).toBe(false);
    expect(can({ role: 'STAFF', action: 'records.manage' })).toBe(false);
    expect(can({ role: 'VIEWER', action: 'item.edit' })).toBe(false);
  });
});
