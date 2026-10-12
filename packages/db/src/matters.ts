import { assertCan, scopeFor, type StaffActor } from './access';
import { writeAudit } from './audit';
import { withTenant } from './client';
import { DomainError } from './errors';

export async function createMatter(
  actor: StaffActor,
  input: { governmentId: string; title: string; caseNumber?: string; kind: string },
) {
  return withTenant(scopeFor(actor), async (tx) => {
    assertCan(actor, 'item.edit', { governmentId: input.governmentId });
    const matter = await tx.matter.create({ data: input });
    await writeAudit(tx, {
      governmentId: input.governmentId,
      actorUserId: actor.id,
      action: 'matter.create',
      entityType: 'Matter',
      entityId: matter.id,
      after: { title: matter.title },
    });
    return matter;
  });
}

export async function addMatterEvent(
  actor: StaffActor,
  matterId: string,
  input: { label: string; bodyId?: string; meetingId?: string; occurredAt?: string | null; projectedFor?: string | null; order: number },
) {
  return withTenant(scopeFor(actor), async (tx) => {
    const matter = await tx.matter.findUnique({ where: { id: matterId } });
    if (!matter) throw new DomainError(404, 'Matter not found');
    assertCan(actor, 'item.edit', { governmentId: matter.governmentId });
    const event = await tx.matterEvent.create({
      data: {
        matterId,
        label: input.label,
        bodyId: input.bodyId,
        meetingId: input.meetingId,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : null,
        projectedFor: input.projectedFor ? new Date(input.projectedFor) : null,
        order: input.order,
      },
    });
    await writeAudit(tx, {
      governmentId: matter.governmentId,
      actorUserId: actor.id,
      action: 'matterEvent.create',
      entityType: 'MatterEvent',
      entityId: event.id,
    });
    return event;
  });
}

export async function approveSummary(actor: StaffActor, matterId: string) {
  return withTenant(scopeFor(actor), async (tx) => {
    const matter = await tx.matter.findUnique({ where: { id: matterId } });
    if (!matter?.summaryEn) throw new DomainError(404, 'Summary not found');
    assertCan(actor, 'motion.accept', { governmentId: matter.governmentId });
    const updated = await tx.matter.update({
      where: { id: matterId },
      data: { summaryApprovedByUserId: actor.id },
    });
    await writeAudit(tx, {
      governmentId: matter.governmentId,
      actorUserId: actor.id,
      action: 'summary.approve',
      entityType: 'Matter',
      entityId: matterId,
    });
    return updated;
  });
}

export async function reviewTranslation(actor: StaffActor, translationId: string) {
  return withTenant(scopeFor(actor), async (tx) => {
    const translation = await tx.translation.findUnique({ where: { id: translationId } });
    if (!translation) throw new DomainError(404, 'Translation not found');
    const matter = translation.entityType === 'Matter' ? await tx.matter.findUnique({ where: { id: translation.entityId } }) : null;
    if (!matter) throw new DomainError(404, 'Translation not found');
    assertCan(actor, 'motion.accept', { governmentId: matter.governmentId });
    const updated = await tx.translation.update({
      where: { id: translationId },
      data: { reviewedByUserId: actor.id },
    });
    await writeAudit(tx, {
      governmentId: matter.governmentId,
      actorUserId: actor.id,
      action: 'translation.review',
      entityType: 'Translation',
      entityId: translationId,
    });
    return updated;
  });
}

export async function askStaffQuestion(actor: StaffActor, itemId: string, question: string) {
  return withTenant(scopeFor(actor), async (tx) => {
    const item = await tx.agendaItem.findUnique({
      where: { id: itemId },
      include: { meeting: { include: { body: true } } },
    });
    if (!item) throw new DomainError(404, 'Item not found');
    const membership = actor.memberships.find((row) => row.governmentId === item.meeting.body.governmentId);
    assertCan(actor, 'staffquestion.ask', { governmentId: item.meeting.body.governmentId });
    if (!membership?.personId) throw new DomainError(400, 'Your membership is not linked to a person');
    const row = await tx.staffQuestion.create({
      data: { agendaItemId: itemId, askedByPersonId: membership.personId, question },
    });
    await writeAudit(tx, {
      governmentId: item.meeting.body.governmentId,
      actorUserId: actor.id,
      action: 'staffquestion.ask',
      entityType: 'StaffQuestion',
      entityId: row.id,
    });
    return row;
  });
}

export async function answerStaffQuestion(actor: StaffActor, questionId: string, answer: string) {
  return withTenant(scopeFor(actor), async (tx) => {
    const row = await tx.staffQuestion.findUnique({
      where: { id: questionId },
      include: { agendaItem: { include: { meeting: { include: { body: true } } } } },
    });
    if (!row) throw new DomainError(404, 'Question not found');
    assertCan(actor, 'item.edit', {
      governmentId: row.agendaItem.meeting.body.governmentId,
      owns: row.agendaItem.authorUserId === actor.id,
    });
    const updated = await tx.staffQuestion.update({
      where: { id: questionId },
      data: { answer, answeredByUserId: actor.id, distributedAt: new Date() },
    });
    await writeAudit(tx, {
      governmentId: row.agendaItem.meeting.body.governmentId,
      actorUserId: actor.id,
      action: 'staffquestion.answer',
      entityType: 'StaffQuestion',
      entityId: questionId,
    });
    return updated;
  });
}

export async function linkParcel(actor: StaffActor, matterId: string, parcelId: string) {
  return withTenant(scopeFor(actor), async (tx) => {
    const matter = await tx.matter.findUnique({ where: { id: matterId } });
    if (!matter) throw new DomainError(404, 'Matter not found');
    assertCan(actor, 'item.edit', { governmentId: matter.governmentId });
    await tx.matterParcel.create({ data: { matterId, parcelId } });
    await writeAudit(tx, {
      governmentId: matter.governmentId,
      actorUserId: actor.id,
      action: 'matter.parcel',
      entityType: 'Matter',
      entityId: matterId,
      after: { parcelId },
    });
    return { matterId, parcelId };
  });
}

export async function createParcel(
  actor: StaffActor,
  input: { governmentId: string; parcelNumber: string; situsAddress?: string },
) {
  return withTenant(scopeFor(actor), async (tx) => {
    assertCan(actor, 'item.edit', { governmentId: input.governmentId });
    const parcel = await tx.parcel.create({ data: input });
    await writeAudit(tx, {
      governmentId: input.governmentId,
      actorUserId: actor.id,
      action: 'parcel.create',
      entityType: 'Parcel',
      entityId: parcel.id,
    });
    return parcel;
  });
}
