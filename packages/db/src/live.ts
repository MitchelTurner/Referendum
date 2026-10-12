import { ModuleKey } from '@prisma/client';
import { assertCan, assertModule, requireMeeting, scopeFor, type StaffActor } from './access';
import { writeAudit } from './audit';
import { withTenant } from './client';
import { DomainError } from './errors';
import { enqueue } from './queue';

export type TimerView = {
  running: boolean;
  durationSec: number;
  remainingMs: number;
  runningSince: string | null;
};

function remainingMs(timer: { running: boolean; remainingMs: number; runningSince: Date | null }, now = new Date()): number {
  if (!timer.running || !timer.runningSince) return timer.remainingMs;
  return Math.max(0, timer.remainingMs - (now.getTime() - timer.runningSince.getTime()));
}

export async function getTimer(meetingId: string): Promise<TimerView> {
  return withTenant({ governmentIds: 'all' }, async (tx) => {
    const meeting = await tx.meeting.findUnique({ where: { id: meetingId }, include: { body: true, liveTimer: true } });
    if (!meeting) throw new DomainError(404, 'Meeting not found');
    const timer = meeting.liveTimer;
    if (!timer) {
      return { running: false, durationSec: meeting.body.speakerSeconds, remainingMs: meeting.body.speakerSeconds * 1000, runningSince: null };
    }
    const remaining = remainingMs(timer);
    return {
      running: timer.running && remaining > 0,
      durationSec: timer.durationSec,
      remainingMs: remaining,
      runningSince: timer.runningSince?.toISOString() ?? null,
    };
  });
}

export async function setTimer(actor: StaffActor, meetingId: string, action: 'start' | 'pause' | 'reset', durationSec?: number) {
  return withTenant(scopeFor(actor), async (tx) => {
    const meeting = await requireMeeting(tx, meetingId);
    await assertModule(tx, meeting.body.governmentId, ModuleKey.LIVE);
    assertCan(actor, 'live.run', { governmentId: meeting.body.governmentId });
    const current = await tx.liveTimer.findUnique({ where: { meetingId } });
    const duration = durationSec ?? current?.durationSec ?? meeting.body.speakerSeconds;
    const now = new Date();
    let running = false;
    let remaining = duration * 1000;
    let runningSince: Date | null = null;
    if (action === 'start') {
      running = true;
      remaining = current ? remainingMs(current) || duration * 1000 : duration * 1000;
      if (current && remainingMs(current) === 0) remaining = duration * 1000;
      runningSince = now;
    } else if (action === 'pause') {
      remaining = current ? remainingMs(current) : duration * 1000;
    } else {
      remaining = duration * 1000;
    }
    const timer = await tx.liveTimer.upsert({
      where: { meetingId },
      update: { running, durationSec: duration, remainingMs: remaining, runningSince },
      create: { meetingId, running, durationSec: duration, remainingMs: remaining, runningSince },
    });
    await writeAudit(tx, {
      governmentId: meeting.body.governmentId,
      actorUserId: actor.id,
      action: 'timer.update',
      entityType: 'LiveTimer',
      entityId: meetingId,
      after: { action, remainingMs: timer.remainingMs, running: timer.running },
    });
    return {
      running: timer.running,
      durationSec: timer.durationSec,
      remainingMs: timer.remainingMs,
      runningSince: timer.runningSince?.toISOString() ?? null,
    };
  });
}

export async function setCurrentItem(actor: StaffActor, meetingId: string, agendaItemId: string) {
  return withTenant(scopeFor(actor), async (tx) => {
    const meeting = await requireMeeting(tx, meetingId);
    await assertModule(tx, meeting.body.governmentId, ModuleKey.LIVE);
    assertCan(actor, 'live.run', { governmentId: meeting.body.governmentId });
    const item = await tx.agendaItem.findUnique({ where: { id: agendaItemId } });
    if (!item || item.meetingId !== meetingId) throw new DomainError(404, 'Item not found');
    const offset =
      meeting.recordingStartedAt != null
        ? Math.max(0, Math.round((Date.now() - meeting.recordingStartedAt.getTime()) / 1000))
        : item.videoOffsetSec;
    await tx.meeting.update({
      where: { id: meetingId },
      data: {
        currentItemId: agendaItemId,
        status: meeting.status === 'ADJOURNED' || meeting.status === 'MINUTES_ADOPTED' ? meeting.status : 'IN_PROGRESS',
      },
    });
    await tx.agendaItem.update({ where: { id: agendaItemId }, data: { videoOffsetSec: offset ?? undefined } });
    await writeAudit(tx, {
      governmentId: meeting.body.governmentId,
      actorUserId: actor.id,
      action: 'live.currentItem',
      entityType: 'Meeting',
      entityId: meetingId,
      after: { agendaItemId, videoOffsetSec: offset },
    });
    return { meetingId, agendaItemId, videoOffsetSec: offset };
  });
}

export async function callNextSpeaker(actor: StaffActor, meetingId: string) {
  const result = await withTenant(scopeFor(actor), async (tx) => {
    const meeting = await requireMeeting(tx, meetingId);
    await assertModule(tx, meeting.body.governmentId, ModuleKey.LIVE);
    assertCan(actor, 'live.run', { governmentId: meeting.body.governmentId });
    if (!meeting.currentItemId) throw new DomainError(409, 'Set the current item first');
    const speakers = await tx.speakerSignup.findMany({
      where: { agendaItemId: meeting.currentItemId },
      orderBy: { queuePosition: 'asc' },
    });
    const next = speakers.find((speaker) => !speaker.calledAt);
    if (!next) throw new DomainError(409, 'The queue is empty');
    await tx.speakerSignup.update({ where: { id: next.id }, data: { calledAt: new Date() } });
    const twoAway = speakers.find((speaker) => speaker.queuePosition === next.queuePosition + 2);
    await writeAudit(tx, {
      governmentId: meeting.body.governmentId,
      actorUserId: actor.id,
      action: 'speaker.next',
      entityType: 'SpeakerSignup',
      entityId: next.id,
      after: { queuePosition: next.queuePosition },
    });
    return { speakerId: next.id, twoAwayId: twoAway && !twoAway.notifiedTwoAway ? twoAway.id : null };
  });
  if (result.twoAwayId) await enqueue('speaker-two-away', { speakerId: result.twoAwayId });
  return result;
}

export async function createLiveMotion(
  actor: StaffActor,
  meetingId: string,
  input: { agendaItemId: string; text: string; moverPersonId?: string; seconderPersonId?: string },
) {
  return withTenant(scopeFor(actor), async (tx) => {
    const meeting = await requireMeeting(tx, meetingId);
    await assertModule(tx, meeting.body.governmentId, ModuleKey.LIVE);
    assertCan(actor, 'vote.record', { governmentId: meeting.body.governmentId });
    const motion = await tx.motion.create({
      data: {
        agendaItemId: input.agendaItemId,
        text: input.text,
        moverPersonId: input.moverPersonId,
        seconderPersonId: input.seconderPersonId,
        source: 'live',
        transcriptStartSec:
          meeting.recordingStartedAt != null
            ? Math.max(0, Math.round((Date.now() - meeting.recordingStartedAt.getTime()) / 1000))
            : null,
      },
    });
    await writeAudit(tx, {
      governmentId: meeting.body.governmentId,
      actorUserId: actor.id,
      action: 'motion.create',
      entityType: 'Motion',
      entityId: motion.id,
      after: { source: 'live' },
    });
    return motion;
  });
}

export async function recordVotes(
  actor: StaffActor,
  motionId: string,
  votes: { personId: string; value: 'YES' | 'NO' | 'ABSTAIN' | 'ABSENT' | 'RECUSED' }[],
) {
  return withTenant(scopeFor(actor), async (tx) => {
    const motion = await tx.motion.findUnique({
      where: { id: motionId },
      include: { agendaItem: { include: { meeting: { include: { body: true } } } } },
    });
    if (!motion) throw new DomainError(404, 'Motion not found');
    assertCan(actor, 'vote.record', { governmentId: motion.agendaItem.meeting.body.governmentId });
    for (const vote of votes) {
      await tx.vote.upsert({
        where: { motionId_personId: { motionId, personId: vote.personId } },
        update: { value: vote.value, confidence: 1 },
        create: { motionId, personId: vote.personId, value: vote.value, confidence: 1 },
      });
    }
    await writeAudit(tx, {
      governmentId: motion.agendaItem.meeting.body.governmentId,
      actorUserId: actor.id,
      action: 'vote.record',
      entityType: 'Motion',
      entityId: motionId,
      after: { count: votes.length },
    });
    return { motionId, count: votes.length };
  });
}

export async function declareConflict(
  actor: StaffActor,
  meetingId: string,
  input: { agendaItemId: string; personId: string; statement: string; chairRuling?: 'participate' | 'recuse' },
) {
  return withTenant(scopeFor(actor), async (tx) => {
    const meeting = await requireMeeting(tx, meetingId);
    assertCan(actor, 'vote.record', { governmentId: meeting.body.governmentId });
    const row = await tx.conflictDeclaration.create({
      data: {
        agendaItemId: input.agendaItemId,
        personId: input.personId,
        statement: input.statement,
        chairRuling: input.chairRuling,
      },
    });
    await writeAudit(tx, {
      governmentId: meeting.body.governmentId,
      actorUserId: actor.id,
      action: 'conflict.declare',
      entityType: 'ConflictDeclaration',
      entityId: row.id,
      after: { chairRuling: input.chairRuling ?? null },
    });
    return row;
  });
}
