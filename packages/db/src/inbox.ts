import { STAFF_REPORT_LEAD_DAYS } from '@referendum/shared';
import { scopeFor, type StaffActor } from './access';
import { withTenant } from './client';

export type InboxRow = {
  id: string;
  dueAt: string;
  dueLabel: string;
  title: string;
  context: string;
  href: string;
  action: string;
};

function deadline(startsAt: Date, daysBefore: number | null): Date {
  if (daysBefore == null) return startsAt;
  return new Date(startsAt.getTime() - daysBefore * 24 * 60 * 60 * 1000);
}

export async function needsYou(actor: StaffActor): Promise<InboxRow[]> {
  return withTenant(scopeFor(actor), async (tx) => {
    const rows: InboxRow[] = [];
    const governmentIds = actor.memberships.map((membership) => membership.governmentId);
    const clerkGovernments = new Set(
      actor.memberships
        .filter((membership) => membership.role === 'ADMIN' || membership.role === 'CLERK' || membership.role === 'DEPUTY_CLERK')
        .map((membership) => membership.governmentId),
    );
    const reviews = await tx.reviewStep.findMany({
      where: {
        status: { in: ['PENDING', 'IN_PROGRESS', 'RETURNED'] },
        OR: [{ assigneeUserId: actor.id }, { agendaItem: { meeting: { body: { governmentId: { in: [...clerkGovernments] } } } } }],
      },
      include: { agendaItem: { include: { meeting: { include: { body: true } } } } },
    });
    const rules = await tx.noticeRule.findMany({ where: { governmentId: { in: governmentIds } } });
    for (const step of reviews) {
      const rule = rules.find((candidate) => candidate.bodyId === step.agendaItem.meeting.bodyId) ?? rules.find((candidate) => candidate.governmentId === step.agendaItem.meeting.body.governmentId);
      const due = deadline(step.agendaItem.meeting.startsAt, rule?.daysBefore ?? null);
      rows.push({
        id: `review:${step.id}`,
        dueAt: due.toISOString(),
        dueLabel: rule?.daysBefore == null ? 'Notice rule not configured' : due.toISOString().slice(0, 10),
        title: step.agendaItem.title,
        context: `${step.roleLabel} review is ${step.status.toLowerCase()}`,
        href: `/staff/items/${step.agendaItemId}/edit`,
        action: 'Open review',
      });
    }
    const motions = await tx.motion.findMany({
      where: {
        source: 'ai_draft',
        acceptedByUserId: null,
        agendaItem: { meeting: { body: { governmentId: { in: governmentIds } } } },
        OR: [{ votes: { some: { confidence: { lt: 0.8 } } } }, { moverPersonId: null }],
      },
      include: { agendaItem: { include: { meeting: true } } },
    });
    for (const motion of motions) {
      rows.push({
        id: `motion:${motion.id}`,
        dueAt: motion.agendaItem.meeting.startsAt.toISOString(),
        dueLabel: 'Draft minutes',
        title: motion.agendaItem.title,
        context: 'A draft motion needs a clerk to check the speaker or the vote',
        href: `/staff/minutes/${motion.agendaItem.meetingId}`,
        action: 'Review motion',
      });
    }
    const questions = await tx.staffQuestion.findMany({
      where: { answer: null, agendaItem: { authorUserId: actor.id } },
      include: { agendaItem: { include: { meeting: true } } },
    });
    for (const question of questions) {
      rows.push({
        id: `question:${question.id}`,
        dueAt: question.createdAt.toISOString(),
        dueLabel: 'Unanswered',
        title: question.agendaItem.title,
        context: question.question,
        href: `/staff/items/${question.agendaItemId}/edit`,
        action: 'Answer',
      });
    }
    const soon = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const terms = await tx.term.findMany({
      where: { endsOn: { lte: soon, gte: new Date() }, seat: { body: { governmentId: { in: governmentIds } } } },
      include: { seat: { include: { terms: true, body: true } }, person: true },
    });
    for (const term of terms) {
      const successor = term.seat.terms.some((other) => other.id !== term.id && other.startsOn >= (term.endsOn ?? new Date()));
      if (successor) continue;
      rows.push({
        id: `term:${term.id}`,
        dueAt: (term.endsOn ?? new Date()).toISOString(),
        dueLabel: 'Term ending',
        title: term.seat.label,
        context: `${term.person.fullName} has no successor on file`,
        href: '/staff/boards',
        action: 'Review seat',
      });
    }
    const lead = new Date(Date.now() + STAFF_REPORT_LEAD_DAYS * 24 * 60 * 60 * 1000);
    const items = await tx.agendaItem.findMany({
      where: {
        meeting: { startsAt: { lte: lead }, body: { governmentId: { in: governmentIds } }, status: { in: ['DRAFT', 'NOTICED'] } },
        documents: { none: { kind: 'staff_report' } },
      },
      include: { meeting: { include: { body: true } } },
    });
    for (const item of items) {
      rows.push({
        id: `report:${item.id}`,
        dueAt: item.meeting.startsAt.toISOString(),
        dueLabel: 'Staff report missing',
        title: item.title,
        context: 'No staff report is attached near the meeting date',
        href: `/staff/items/${item.id}/edit`,
        action: 'Add report',
      });
    }
    const failures = await tx.jobFailure.findMany({
      where: { governmentId: { in: governmentIds } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    for (const failure of failures) {
      rows.push({
        id: `job:${failure.id}`,
        dueAt: failure.createdAt.toISOString(),
        dueLabel: 'Failed job',
        title: failure.queue,
        context: failure.error.slice(0, 180),
        href: '/staff/imports',
        action: 'View failure',
      });
    }
    return rows.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  });
}
