import { ModuleKey, type ItemStatus, type ItemType, type MeetingStatus, type Prisma } from '@prisma/client';
import {
  evaluateReadiness,
  reviewChainFor,
  type ItemType as SharedItemType,
  type NoticeRuleInput,
} from '@referendum/shared';
import { assertCan, assertModule, requireItem, requireMeeting, scopeFor, type StaffActor } from './access';
import { writeAudit } from './audit';
import { withTenant, type Tx } from './client';
import { DomainError } from './errors';
import { enqueue } from './queue';
import { renderPageHtml } from './pdf';
import { putObject } from './storage';

const READY: ItemStatus[] = ['READY', 'PUBLISHED', 'HEARD', 'CONTINUED'];

async function loadReadiness(tx: Tx, meetingId: string) {
  const meeting = await tx.meeting.findUnique({
    where: { id: meetingId },
    include: {
      body: true,
      items: { include: { reviews: true, documents: true } },
    },
  });
  if (!meeting) throw new DomainError(404, 'Meeting not found');
  const rules = await tx.noticeRule.findMany({ where: { governmentId: meeting.body.governmentId } });
  const noticeRules: NoticeRuleInput[] = rules.map((rule) => ({
    daysBefore: rule.daysBefore,
    bodyId: rule.bodyId,
    itemType: rule.itemType,
    codeCitation: rule.codeCitation,
  }));
  const result = evaluateReadiness({
    noticePostedAt: meeting.noticePostedAt,
    meetingStartsAt: meeting.startsAt,
    noticeRules,
    bodyId: meeting.bodyId,
    reviewSteps: meeting.items.flatMap((item) =>
      item.reviews.map((step) => ({ status: step.status, agendaItemId: item.id })),
    ),
    items: meeting.items.map((item) => ({ id: item.id, title: item.title, status: item.status })),
    packetPublishedAt: meeting.packetPublishedAt,
    meetingStatus: meeting.status,
  });
  return { meeting, result };
}

export async function getReadiness(actor: StaffActor, meetingId: string) {
  return withTenant(scopeFor(actor), async (tx) => {
    const { meeting, result } = await loadReadiness(tx, meetingId);
    assertCan(actor, 'record.read', { governmentId: meeting.body.governmentId });
    return {
      meetingId,
      publishAllowed: result.publishAllowed,
      steps: result.steps,
    };
  });
}

export async function createBody(
  actor: StaffActor,
  input: { governmentId: string; name: string; code: string; defaultLocation?: string; speakerSeconds?: number },
) {
  return withTenant(scopeFor(actor), async (tx) => {
    assertCan(actor, 'government.configure', { governmentId: input.governmentId });
    const body = await tx.body.create({
      data: {
        governmentId: input.governmentId,
        name: input.name,
        code: input.code,
        defaultLocation: input.defaultLocation,
        speakerSeconds: input.speakerSeconds ?? 180,
      },
    });
    await writeAudit(tx, {
      governmentId: input.governmentId,
      actorUserId: actor.id,
      action: 'body.create',
      entityType: 'Body',
      entityId: body.id,
      after: { name: body.name, code: body.code },
    });
    return body;
  });
}

export async function updateBody(
  actor: StaffActor,
  id: string,
  input: { name?: string; defaultLocation?: string | null; speakerSeconds?: number },
) {
  return withTenant(scopeFor(actor), async (tx) => {
    const body = await tx.body.findUnique({ where: { id } });
    if (!body) throw new DomainError(404, 'Body not found');
    assertCan(actor, 'government.configure', { governmentId: body.governmentId });
    const updated = await tx.body.update({ where: { id }, data: input });
    await writeAudit(tx, {
      governmentId: body.governmentId,
      actorUserId: actor.id,
      action: 'body.update',
      entityType: 'Body',
      entityId: id,
      before: { name: body.name },
      after: { name: updated.name },
    });
    return updated;
  });
}

export async function createMeeting(
  actor: StaffActor,
  input: {
    bodyId: string;
    startsAt: string;
    location?: string;
    status?: MeetingStatus;
    noticePostedAt?: string | null;
    videoProvider?: string;
    videoRef?: string;
  },
) {
  return withTenant(scopeFor(actor), async (tx) => {
    const body = await tx.body.findUnique({ where: { id: input.bodyId } });
    if (!body) throw new DomainError(404, 'Body not found');
    await assertModule(tx, body.governmentId, ModuleKey.MEETINGS);
    assertCan(actor, 'item.edit', { governmentId: body.governmentId });
    const meeting = await tx.meeting.create({
      data: {
        bodyId: input.bodyId,
        startsAt: new Date(input.startsAt),
        location: input.location ?? body.defaultLocation,
        status: input.status ?? 'DRAFT',
        noticePostedAt: input.noticePostedAt ? new Date(input.noticePostedAt) : null,
        videoProvider: input.videoProvider,
        videoRef: input.videoRef,
      },
    });
    await writeAudit(tx, {
      governmentId: body.governmentId,
      actorUserId: actor.id,
      action: 'meeting.create',
      entityType: 'Meeting',
      entityId: meeting.id,
      after: { startsAt: meeting.startsAt.toISOString(), status: meeting.status },
    });
    return meeting;
  });
}

export async function updateMeeting(
  actor: StaffActor,
  id: string,
  input: {
    startsAt?: string;
    location?: string | null;
    status?: MeetingStatus;
    noticePostedAt?: string | null;
    videoProvider?: string | null;
    videoRef?: string | null;
    recordingStartedAt?: string | null;
  },
) {
  return withTenant(scopeFor(actor), async (tx) => {
    const meeting = await requireMeeting(tx, id);
    assertCan(actor, 'item.edit', { governmentId: meeting.body.governmentId });
    const updated = await tx.meeting.update({
      where: { id },
      data: {
        startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
        location: input.location === undefined ? undefined : input.location,
        status: input.status,
        noticePostedAt:
          input.noticePostedAt === undefined ? undefined : input.noticePostedAt ? new Date(input.noticePostedAt) : null,
        videoProvider: input.videoProvider === undefined ? undefined : input.videoProvider,
        videoRef: input.videoRef === undefined ? undefined : input.videoRef,
        recordingStartedAt:
          input.recordingStartedAt === undefined
            ? undefined
            : input.recordingStartedAt
              ? new Date(input.recordingStartedAt)
              : null,
      },
    });
    await writeAudit(tx, {
      governmentId: meeting.body.governmentId,
      actorUserId: actor.id,
      action: 'meeting.update',
      entityType: 'Meeting',
      entityId: id,
      before: { status: meeting.status },
      after: { status: updated.status },
    });
    return updated;
  });
}

export async function listMeetings(actor: StaffActor, cursor?: { createdAt: Date; id: string } | null, limit = 25) {
  return withTenant(scopeFor(actor), async (tx) => {
    const rows = await tx.meeting.findMany({
      where: cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : undefined,
      include: { body: { include: { government: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return rows;
  });
}

export async function getStaffMeeting(actor: StaffActor, id: string) {
  return withTenant(scopeFor(actor), async (tx) => {
    const meeting = await tx.meeting.findUnique({
      where: { id },
      include: {
        body: { include: { government: true } },
        items: {
          orderBy: { sortKey: 'asc' },
          include: { reviews: { orderBy: { order: 'asc' }, include: { assignee: true } }, documents: true, matter: true },
        },
      },
    });
    if (!meeting) throw new DomainError(404, 'Meeting not found');
    assertCan(actor, 'record.read', { governmentId: meeting.body.governmentId });
    return meeting;
  });
}

export async function createItem(
  actor: StaffActor,
  input: {
    meetingId: string;
    matterId?: string;
    position: string;
    sortKey: number;
    type: ItemType;
    title: string;
    status?: ItemStatus;
    commentsCloseAt?: string | null;
    testimonyOpen?: boolean;
    reviewChain?: string[];
  },
) {
  return withTenant(scopeFor(actor), async (tx) => {
    const meeting = await requireMeeting(tx, input.meetingId);
    await assertModule(tx, meeting.body.governmentId, ModuleKey.MEETINGS);
    assertCan(actor, 'item.edit', { governmentId: meeting.body.governmentId, owns: true });
    const chain = reviewChainFor(input.type as SharedItemType, input.reviewChain);
    const item = await tx.agendaItem.create({
      data: {
        meetingId: input.meetingId,
        matterId: input.matterId,
        position: input.position,
        sortKey: input.sortKey,
        type: input.type,
        title: input.title,
        status: input.status ?? 'DRAFT',
        commentsCloseAt: input.commentsCloseAt ? new Date(input.commentsCloseAt) : null,
        testimonyOpen: input.testimonyOpen ?? false,
        authorUserId: actor.id,
        reviews: {
          create: chain.map((roleLabel, order) => ({
            order,
            roleLabel,
            status: 'PENDING',
          })),
        },
      },
      include: { reviews: true },
    });
    await writeAudit(tx, {
      governmentId: meeting.body.governmentId,
      actorUserId: actor.id,
      action: 'item.create',
      entityType: 'AgendaItem',
      entityId: item.id,
      after: { title: item.title, position: item.position },
    });
    return item;
  });
}

export async function updateItem(
  actor: StaffActor,
  id: string,
  input: {
    title?: string;
    position?: string;
    sortKey?: number;
    status?: ItemStatus;
    matterId?: string | null;
    commentsCloseAt?: string | null;
    testimonyOpen?: boolean;
    type?: ItemType;
  },
) {
  return withTenant(scopeFor(actor), async (tx) => {
    const item = await requireItem(tx, id);
    assertCan(actor, 'item.edit', {
      governmentId: item.meeting.body.governmentId,
      owns: item.authorUserId === actor.id,
    });
    const updated = await tx.agendaItem.update({
      where: { id },
      data: {
        title: input.title,
        position: input.position,
        sortKey: input.sortKey,
        status: input.status,
        matterId: input.matterId === undefined ? undefined : input.matterId,
        commentsCloseAt:
          input.commentsCloseAt === undefined ? undefined : input.commentsCloseAt ? new Date(input.commentsCloseAt) : null,
        testimonyOpen: input.testimonyOpen,
        type: input.type,
      },
    });
    await writeAudit(tx, {
      governmentId: item.meeting.body.governmentId,
      actorUserId: actor.id,
      action: 'item.update',
      entityType: 'AgendaItem',
      entityId: id,
      before: { title: item.title, status: item.status },
      after: { title: updated.title, status: updated.status },
    });
    return updated;
  });
}

export async function getStaffItem(actor: StaffActor, id: string) {
  return withTenant(scopeFor(actor), async (tx) => {
    const item = await tx.agendaItem.findUnique({
      where: { id },
      include: {
        meeting: { include: { body: { include: { government: true } } } },
        matter: { include: { events: { orderBy: { order: 'asc' } } } },
        documents: { include: { pages: { select: { id: true, pageNumber: true } } } },
        reviews: { orderBy: { order: 'asc' }, include: { assignee: true } },
        comments: true,
      },
    });
    if (!item) throw new DomainError(404, 'Item not found');
    assertCan(actor, 'record.read', { governmentId: item.meeting.body.governmentId });
    return item;
  });
}

export async function decideReview(
  actor: StaffActor,
  itemId: string,
  stepId: string,
  input: { status: 'APPROVED' | 'RETURNED' | 'SKIPPED' | 'IN_PROGRESS'; note?: string },
) {
  return withTenant(scopeFor(actor), async (tx) => {
    const item = await requireItem(tx, itemId);
    const step = item.reviews.find((candidate) => candidate.id === stepId);
    if (!step) throw new DomainError(404, 'Review step not found');
    assertCan(actor, 'review.decide', {
      governmentId: item.meeting.body.governmentId,
      assigned: step.assigneeUserId === actor.id,
    });
    const updated = await tx.reviewStep.update({
      where: { id: stepId },
      data: {
        status: input.status,
        note: input.note,
        decidedAt: input.status === 'IN_PROGRESS' ? null : new Date(),
        receivedAt: step.receivedAt ?? new Date(),
      },
    });
    if (input.status === 'RETURNED') {
      await tx.agendaItem.update({ where: { id: itemId }, data: { status: 'DRAFT' } });
    }
    if (input.status === 'APPROVED' || input.status === 'SKIPPED') {
      const steps = await tx.reviewStep.findMany({ where: { agendaItemId: itemId } });
      const done = steps.every((row) => row.status === 'APPROVED' || row.status === 'SKIPPED');
      if (done && (item.status === 'DRAFT' || item.status === 'IN_REVIEW')) {
        await tx.agendaItem.update({ where: { id: itemId }, data: { status: 'READY' } });
      }
    }
    await writeAudit(tx, {
      governmentId: item.meeting.body.governmentId,
      actorUserId: actor.id,
      action: 'review.decide',
      entityType: 'ReviewStep',
      entityId: stepId,
      after: { status: updated.status, note: input.note ?? null },
    });
    return updated;
  });
}

export async function nudgeReview(actor: StaffActor, itemId: string, stepId: string) {
  return withTenant(scopeFor(actor), async (tx) => {
    const item = await requireItem(tx, itemId);
    const step = await tx.reviewStep.findUnique({ where: { id: stepId }, include: { assignee: true } });
    if (!step || step.agendaItemId !== itemId) throw new DomainError(404, 'Review step not found');
    assertCan(actor, 'item.edit', {
      governmentId: item.meeting.body.governmentId,
      owns: item.authorUserId === actor.id,
    });
    await writeAudit(tx, {
      governmentId: item.meeting.body.governmentId,
      actorUserId: actor.id,
      action: 'review.nudge',
      entityType: 'ReviewStep',
      entityId: stepId,
      after: { assignee: step.assignee?.email ?? null },
    });
    return { stepId, email: step.assignee?.email ?? null, itemTitle: item.title };
  }).then(async (result) => {
    if (result.email) {
      await enqueue('send', {
        channel: 'EMAIL',
        destination: result.email,
        subject: 'Review reminder',
        body: `A review is waiting on ${result.itemTitle}.`,
        idempotencyKey: `nudge:${result.stepId}:${new Date().toISOString().slice(0, 13)}`,
        governmentId: '',
      });
    }
    return result;
  });
}

export async function assignReview(actor: StaffActor, itemId: string, stepId: string, assigneeUserId: string) {
  return withTenant(scopeFor(actor), async (tx) => {
    const item = await requireItem(tx, itemId);
    assertCan(actor, 'item.edit', {
      governmentId: item.meeting.body.governmentId,
      owns: item.authorUserId === actor.id,
    });
    const step = await tx.reviewStep.update({
      where: { id: stepId },
      data: { assigneeUserId, receivedAt: new Date(), status: 'IN_PROGRESS' },
    });
    await tx.agendaItem.update({ where: { id: itemId }, data: { status: 'IN_REVIEW' } });
    await writeAudit(tx, {
      governmentId: item.meeting.body.governmentId,
      actorUserId: actor.id,
      action: 'review.assign',
      entityType: 'ReviewStep',
      entityId: stepId,
      after: { assigneeUserId },
    });
    return step;
  });
}

async function rebuildCommentPacket(tx: Tx, itemId: string, governmentId: string) {
  const comments = await tx.publicComment.findMany({
    where: { agendaItemId: itemId, hidden: false, onTime: true },
    orderBy: { receivedAt: 'asc' },
  });
  const text = comments.map((comment) => `${comment.name} (${comment.position})\n${comment.body}`).join('\n\n');
  const html = renderPageHtml('Public comments', 1, text || 'No public comments.');
  const existing = await tx.document.findFirst({ where: { agendaItemId: itemId, kind: 'comment' } });
  const storageKey = `comments/${itemId}.html`;
  await putObject(storageKey, Buffer.from(html, 'utf8'), 'text/html');
  const document =
    existing ??
    (await tx.document.create({
      data: {
        agendaItemId: itemId,
        title: 'Public comments',
        kind: 'comment',
        version: 1,
        storageKey,
        pageCount: 1,
        accessible: true,
      },
    }));
  if (existing) {
    await tx.document.update({
      where: { id: existing.id },
      data: { version: existing.version + 1, storageKey, accessible: true, pageCount: 1 },
    });
  }
  await tx.documentPage.deleteMany({ where: { documentId: document.id } });
  await tx.documentPage.create({
    data: { documentId: document.id, pageNumber: 1, html, text },
  });
  if (comments.length > 0) {
    await tx.publicComment.updateMany({
      where: { id: { in: comments.map((comment) => comment.id) } },
      data: { publishedAt: new Date() },
    });
  }
  await writeAudit(tx, {
    governmentId,
    action: 'comment.packet',
    entityType: 'Document',
    entityId: document.id,
    after: { count: comments.length },
  });
}

export async function publishPacket(actor: StaffActor, meetingId: string) {
  const published = await withTenant(scopeFor(actor), async (tx) => {
    const { meeting, result } = await loadReadiness(tx, meetingId);
    await assertModule(tx, meeting.body.governmentId, ModuleKey.MEETINGS);
    assertCan(actor, 'item.publish', { governmentId: meeting.body.governmentId });
    if (!result.publishAllowed) {
      const blockers = result.steps.flatMap((step) => (step.status === 'DONE' ? [] : step.blockers));
      throw new DomainError(409, 'Packet is not ready', { blockers });
    }
    const now = new Date();
    await tx.meeting.update({
      where: { id: meetingId },
      data: {
        packetPublishedAt: now,
        status: meeting.status === 'DRAFT' || meeting.status === 'NOTICED' ? 'PACKET_PUBLISHED' : meeting.status,
      },
    });
    await tx.agendaItem.updateMany({
      where: { meetingId, status: { in: READY } },
      data: { status: 'PUBLISHED' },
    });
    const items = await tx.agendaItem.findMany({ where: { meetingId } });
    for (const item of items) {
      await rebuildCommentPacket(tx, item.id, meeting.body.governmentId);
    }
    await writeAudit(tx, {
      governmentId: meeting.body.governmentId,
      actorUserId: actor.id,
      action: 'item.publish',
      entityType: 'Meeting',
      entityId: meetingId,
      after: { packetPublishedAt: now.toISOString() },
    });
    return { meetingId, matterIds: items.map((item) => item.matterId).filter((id): id is string => Boolean(id)) };
  });
  for (const matterId of published.matterIds) {
    await enqueue('summarize-matter', { matterId });
  }
  await enqueue('notify-fanout', { meetingId: published.meetingId, event: 'packet.published' });
  return published;
}

export async function upsertNoticeRule(
  actor: StaffActor,
  input: {
    id?: string;
    governmentId: string;
    bodyId?: string | null;
    itemType?: ItemType | null;
    daysBefore?: number | null;
    codeCitation?: string | null;
    mailedRadiusFt?: number | null;
  },
) {
  return withTenant(scopeFor(actor), async (tx) => {
    assertCan(actor, 'government.configure', { governmentId: input.governmentId });
    const data = {
      governmentId: input.governmentId,
      bodyId: input.bodyId ?? null,
      itemType: input.itemType ?? null,
      daysBefore: input.daysBefore ?? null,
      codeCitation: input.codeCitation ?? null,
      mailedRadiusFt: input.mailedRadiusFt ?? null,
    };
    const rule = input.id
      ? await tx.noticeRule.update({ where: { id: input.id }, data })
      : await tx.noticeRule.create({ data });
    await writeAudit(tx, {
      governmentId: input.governmentId,
      actorUserId: actor.id,
      action: 'noticeRule.update',
      entityType: 'NoticeRule',
      entityId: rule.id,
      after: data as Prisma.InputJsonValue,
    });
    return rule;
  });
}

export { rebuildCommentPacket };
