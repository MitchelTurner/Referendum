import { describe, expect, it } from 'vitest';
import { evaluateReadiness } from './readiness';

const start = new Date('2026-10-20T16:00:00.000Z');

describe('readiness', () => {
  it('blocks publish when the notice rule is not configured', () => {
    const result = evaluateReadiness({
      noticePostedAt: new Date('2026-10-01T00:00:00.000Z'),
      meetingStartsAt: start,
      noticeRules: [{ daysBefore: null, bodyId: 'b1' }],
      bodyId: 'b1',
      reviewSteps: [],
      items: [{ id: 'i1', title: 'Item', status: 'READY' }],
      packetPublishedAt: null,
      meetingStatus: 'DRAFT',
    });
    expect(result.steps[0]).toMatchObject({
      status: 'BLOCKED',
      blockers: ['Notice rule not configured'],
    });
    expect(result.publishAllowed).toBe(false);
  });

  it('allows publish only after steps 1–3 are done', () => {
    const blocked = evaluateReadiness({
      noticePostedAt: new Date('2026-10-01T00:00:00.000Z'),
      meetingStartsAt: start,
      noticeRules: [{ daysBefore: 7, bodyId: 'b1' }],
      bodyId: 'b1',
      reviewSteps: [{ status: 'PENDING', agendaItemId: 'i1' }],
      items: [{ id: 'i1', title: 'Dock', status: 'IN_REVIEW' }],
      packetPublishedAt: null,
      meetingStatus: 'NOTICED',
    });
    expect(blocked.steps[0]?.status).toBe('DONE');
    expect(blocked.steps[1]?.status).toBe('NEXT');
    expect(blocked.publishAllowed).toBe(false);

    const ready = evaluateReadiness({
      noticePostedAt: new Date('2026-10-01T00:00:00.000Z'),
      meetingStartsAt: start,
      noticeRules: [{ daysBefore: 7, bodyId: 'b1' }],
      bodyId: 'b1',
      reviewSteps: [{ status: 'APPROVED', agendaItemId: 'i1' }],
      items: [{ id: 'i1', title: 'Dock', status: 'READY' }],
      packetPublishedAt: null,
      meetingStatus: 'NOTICED',
    });
    expect(ready.steps.slice(0, 3).every((step) => step.status === 'DONE')).toBe(true);
    expect(ready.steps[3]?.status).toBe('NEXT');
    expect(ready.publishAllowed).toBe(true);
  });
});
