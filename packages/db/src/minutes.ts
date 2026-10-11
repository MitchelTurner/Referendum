import { ModuleKey } from '@prisma/client';
import { draftMinutes, type MotionDraft } from '@referendum/ai';
import { assertCan, assertModule, requireMeeting, scopeFor, type StaffActor } from './access';
import { writeAudit } from './audit';
import { withTenant } from './client';
import { DomainError } from './errors';
import { renderPageHtml } from './pdf';
import { putObject } from './storage';

export async function saveDraftMotions(meetingId: string, drafts: MotionDraft[]): Promise<string[]> {
  return withTenant({ governmentIds: 'all' }, async (tx) => {
    const meeting = await tx.meeting.findUnique({
      where: { id: meetingId },
      include: { items: true, body: { include: { seats: { include: { terms: { include: { person: true } } } } } } },
    });
    if (!meeting) throw new DomainError(404, 'Meeting not found');
    const roster = meeting.body.seats.flatMap((seat) => seat.terms.map((term) => term.person));
    const ids: string[] = [];
    for (const draft of drafts) {
      const item = meeting.items.find((candidate) => candidate.position === draft.itemPosition) ?? meeting.items[0];
      if (!item) continue;
      const mover = roster.find((person) => person.fullName.toLowerCase() === draft.moverName?.toLowerCase());
      const seconder = roster.find((person) => person.fullName.toLowerCase() === draft.seconderName?.toLowerCase());
      const flags = [...draft.flags];
      if (draft.moverName && !mover) flags.push(`unmapped speaker: ${draft.moverName}`);
      const motion = await tx.motion.create({
        data: {
          agendaItemId: item.id,
          text: draft.text,
          moverPersonId: mover?.id,
          seconderPersonId: seconder?.id,
          source: 'ai_draft',
          transcriptStartSec: draft.transcriptStartSec,
          votes: {
            create: draft.votes.map((vote) => {
              const person = roster.find((candidate) => candidate.fullName.toLowerCase() === vote.name.toLowerCase());
              return {
                personId: person?.id ?? roster[0]?.id ?? '',
                value: vote.value,
                confidence: vote.confidence,
              };
            }).filter((vote) => vote.personId),
          },
        },
      });
      ids.push(motion.id);
      await writeAudit(tx, {
        governmentId: meeting.body.governmentId,
        action: 'motion.ai_draft',
        entityType: 'Motion',
        entityId: motion.id,
        after: { flags },
      });
    }
    await tx.meeting.update({ where: { id: meetingId }, data: { status: 'MINUTES_DRAFT' } });
    return ids;
  });
}

export async function runDraftMinutes(meetingId: string, transcriptText: string): Promise<string[]> {
  const context = await withTenant({ governmentIds: 'all' }, async (tx) => {
    const meeting = await tx.meeting.findUnique({
      where: { id: meetingId },
      include: {
        items: true,
        body: { include: { seats: { include: { terms: { include: { person: true } } } } } },
      },
    });
    if (!meeting) throw new DomainError(404, 'Meeting not found');
    return meeting;
  });
  const { createTranscriptionProvider } = await import('@referendum/ai');
  const segments = await createTranscriptionProvider().transcribe({ transcriptText });
  const roster = context.body.seats.flatMap((seat) =>
    seat.terms.map((term) => ({ id: term.person.id, fullName: term.person.fullName })),
  );
  const { drafts } = await draftMinutes({
    segments,
    items: context.items.map((item) => ({ position: item.position, title: item.title })),
    roster,
  });
  return saveDraftMotions(meetingId, drafts);
}

export async function minutesDraft(actor: StaffActor, meetingId: string) {
  return withTenant(scopeFor(actor), async (tx) => {
    const meeting = await requireMeeting(tx, meetingId);
    await assertModule(tx, meeting.body.governmentId, ModuleKey.MINUTES_AI);
    assertCan(actor, 'record.read', { governmentId: meeting.body.governmentId });
    return tx.motion.findMany({
      where: { agendaItem: { meetingId } },
      include: { votes: { include: { person: true } }, mover: true, seconder: true, agendaItem: true },
      orderBy: { createdAt: 'asc' },
    });
  });
}

export async function acceptMotion(actor: StaffActor, motionId: string) {
  return withTenant(scopeFor(actor), async (tx) => {
    const motion = await tx.motion.findUnique({
      where: { id: motionId },
      include: { agendaItem: { include: { meeting: { include: { body: true } } } } },
    });
    if (!motion) throw new DomainError(404, 'Motion not found');
    assertCan(actor, 'motion.accept', { governmentId: motion.agendaItem.meeting.body.governmentId });
    const updated = await tx.motion.update({
      where: { id: motionId },
      data: { acceptedByUserId: actor.id },
    });
    await writeAudit(tx, {
      governmentId: motion.agendaItem.meeting.body.governmentId,
      actorUserId: actor.id,
      action: 'motion.accept',
      entityType: 'Motion',
      entityId: motionId,
    });
    return updated;
  });
}

export async function patchMotion(
  actor: StaffActor,
  motionId: string,
  input: { text?: string; result?: string; moverPersonId?: string | null; seconderPersonId?: string | null },
) {
  return withTenant(scopeFor(actor), async (tx) => {
    const motion = await tx.motion.findUnique({
      where: { id: motionId },
      include: { agendaItem: { include: { meeting: { include: { body: true } } } } },
    });
    if (!motion) throw new DomainError(404, 'Motion not found');
    assertCan(actor, 'motion.accept', { governmentId: motion.agendaItem.meeting.body.governmentId });
    const updated = await tx.motion.update({ where: { id: motionId }, data: input });
    await writeAudit(tx, {
      governmentId: motion.agendaItem.meeting.body.governmentId,
      actorUserId: actor.id,
      action: 'motion.update',
      entityType: 'Motion',
      entityId: motionId,
      before: { text: motion.text },
      after: { text: updated.text },
    });
    return updated;
  });
}

export async function adoptMinutes(actor: StaffActor, meetingId: string) {
  return withTenant(scopeFor(actor), async (tx) => {
    const meeting = await requireMeeting(tx, meetingId);
    assertCan(actor, 'motion.accept', { governmentId: meeting.body.governmentId });
    const motions = await tx.motion.findMany({
      where: { agendaItem: { meetingId }, acceptedByUserId: { not: null } },
      include: { votes: { include: { person: true } }, agendaItem: true },
      orderBy: { agendaItem: { sortKey: 'asc' } },
    });
    const lines = motions.map((motion) => {
      const votes = motion.votes.map((vote) => `${vote.person.fullName}: ${vote.value}`).join(', ');
      return `${motion.agendaItem.position} ${motion.text}\n${votes}`;
    });
    const text = lines.join('\n\n') || 'No accepted motions.';
    const html = renderPageHtml('Minutes', 1, text);
    const storageKey = `minutes/${meetingId}.html`;
    await putObject(storageKey, Buffer.from(html, 'utf8'), 'text/html');
    const firstItem = await tx.agendaItem.findFirst({ where: { meetingId }, orderBy: { sortKey: 'asc' } });
    const document = await tx.document.create({
      data: {
        title: 'Minutes',
        kind: 'minutes',
        storageKey,
        pageCount: 1,
        accessible: true,
        agendaItemId: firstItem?.id,
      },
    });
    await tx.documentPage.create({ data: { documentId: document.id, pageNumber: 1, html, text } });
    await tx.meeting.update({ where: { id: meetingId }, data: { status: 'MINUTES_ADOPTED' } });
    await writeAudit(tx, {
      governmentId: meeting.body.governmentId,
      actorUserId: actor.id,
      action: 'minutes.adopt',
      entityType: 'Meeting',
      entityId: meetingId,
      after: { motions: motions.length },
    });
    return { documentId: document.id, text };
  });
}
