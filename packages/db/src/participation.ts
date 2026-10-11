import { ModuleKey, type Position, type TestimonyMode } from '@prisma/client';
import { assertCan, scopeFor, type StaffActor } from './access';
import { writeAudit } from './audit';
import { withTenant } from './client';
import { DomainError } from './errors';
import { rebuildCommentPacket } from './meetings';
import { rateLimit } from './redis';

async function verifyTurnstile(token: string): Promise<void> {
  const secret = process.env.TURNSTILE_SECRET;
  // SPEC-GAP: local and test runs accept the token test-pass when no secret is configured.
  if ((!secret || process.env.NODE_ENV === 'test') && token === 'test-pass') return;
  if (!secret) throw new DomainError(400, 'Captcha is not configured');
  const body = new URLSearchParams({ secret, response: token });
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  const json = (await response.json()) as { success?: boolean };
  if (!json.success) throw new DomainError(400, 'Captcha failed');
}

export async function addComment(
  input: {
    itemId: string;
    name: string;
    address?: string;
    position?: Position;
    body: string;
    turnstileToken: string;
    residentId?: string;
    ip: string;
  },
) {
  const allowed = await rateLimit(`comment:${input.ip}`, 30, 600);
  if (!allowed) throw new DomainError(429, 'Too many comments');
  await verifyTurnstile(input.turnstileToken);
  return withTenant({ governmentIds: 'all', residentId: input.residentId }, async (tx) => {
    const item = await tx.agendaItem.findUnique({
      where: { id: input.itemId },
      include: { meeting: { include: { body: true } } },
    });
    if (!item) throw new DomainError(404, 'Item not found');
    const module = await tx.governmentModule.findUnique({
      where: { governmentId_module: { governmentId: item.meeting.body.governmentId, module: ModuleKey.PARTICIPATION } },
    });
    if (!module?.enabled) throw new DomainError(404, 'Module is not enabled');
    if (item.commentsCloseAt && item.commentsCloseAt.getTime() < Date.now()) {
      throw new DomainError(409, 'Comments are closed');
    }
    const onTime = !item.commentsCloseAt || item.commentsCloseAt.getTime() >= Date.now();
    const comment = await tx.publicComment.create({
      data: {
        agendaItemId: item.id,
        residentId: input.residentId,
        name: input.name,
        address: input.address,
        position: input.position ?? 'NEUTRAL',
        body: input.body,
        onTime,
      },
    });
    await writeAudit(tx, {
      governmentId: item.meeting.body.governmentId,
      actorResidentId: input.residentId,
      action: 'comment.create',
      entityType: 'PublicComment',
      entityId: comment.id,
    });
    if (item.meeting.packetPublishedAt) {
      await rebuildCommentPacket(tx, item.id, item.meeting.body.governmentId);
    }
    return comment;
  });
}

export async function hideComment(actor: StaffActor, commentId: string, reason: string) {
  return withTenant(scopeFor(actor), async (tx) => {
    const comment = await tx.publicComment.findUnique({
      where: { id: commentId },
      include: { agendaItem: { include: { meeting: { include: { body: true } } } } },
    });
    if (!comment) throw new DomainError(404, 'Comment not found');
    assertCan(actor, 'comment.hide', { governmentId: comment.agendaItem.meeting.body.governmentId });
    const updated = await tx.publicComment.update({
      where: { id: commentId },
      data: { hidden: true, hiddenReason: reason },
    });
    await writeAudit(tx, {
      governmentId: comment.agendaItem.meeting.body.governmentId,
      actorUserId: actor.id,
      action: 'comment.hide',
      entityType: 'PublicComment',
      entityId: commentId,
      after: { reason },
    });
    await rebuildCommentPacket(tx, comment.agendaItemId, comment.agendaItem.meeting.body.governmentId);
    return updated;
  });
}

export async function signUpSpeaker(input: {
  itemId: string;
  displayName: string;
  mode: TestimonyMode;
  phone?: string;
  turnstileToken: string;
  residentId?: string;
  ip: string;
}) {
  const allowed = await rateLimit(`speaker:${input.ip}`, 30, 600);
  if (!allowed) throw new DomainError(429, 'Too many sign-ups');
  await verifyTurnstile(input.turnstileToken);
  if (input.mode === 'PHONE' && !input.phone) throw new DomainError(400, 'A phone number is required');
  return withTenant({ governmentIds: 'all' }, async (tx) => {
    const item = await tx.agendaItem.findUnique({
      where: { id: input.itemId },
      include: { meeting: { include: { body: true } } },
    });
    if (!item) throw new DomainError(404, 'Item not found');
    if (!item.testimonyOpen) throw new DomainError(409, 'Testimony sign-up is closed');
    const last = await tx.speakerSignup.findFirst({
      where: { agendaItemId: item.id },
      orderBy: { queuePosition: 'desc' },
    });
    const speaker = await tx.speakerSignup.create({
      data: {
        agendaItemId: item.id,
        residentId: input.residentId,
        displayName: input.displayName,
        mode: input.mode,
        phone: input.phone,
        queuePosition: (last?.queuePosition ?? 0) + 1,
      },
    });
    await writeAudit(tx, {
      governmentId: item.meeting.body.governmentId,
      actorResidentId: input.residentId,
      action: 'speaker.signup',
      entityType: 'SpeakerSignup',
      entityId: speaker.id,
    });
    return speaker;
  });
}
