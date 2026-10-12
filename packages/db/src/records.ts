import { ModuleKey, type RecordsStatus } from '@prisma/client';
import { assertCan, assertModule, scopeFor, type StaffActor } from './access';
import { writeAudit } from './audit';
import { withTenant } from './client';
import { DomainError } from './errors';
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

function publicRelease(release: { id: string; title: string; body: string; createdAt: Date }) {
  return { id: release.id, title: release.title, body: release.body, createdAt: release.createdAt.toISOString() };
}

export async function fileRecordsRequest(input: {
  governmentId: string;
  name: string;
  email: string;
  description: string;
  turnstileToken: string;
  residentId?: string;
  ip: string;
}) {
  if (!(await rateLimit(`records:${input.ip}`, 10, 600))) throw new DomainError(429, 'Too many requests');
  await verifyTurnstile(input.turnstileToken);
  const email = input.email.toLowerCase();
  return withTenant({ governmentIds: 'all', residentId: input.residentId }, async (tx) => {
    const government = await tx.government.findUnique({ where: { id: input.governmentId } });
    if (!government) throw new DomainError(404, 'Government not found');
    await assertModule(tx, government.id, ModuleKey.RECORDS);
    const rule = await tx.recordsRule.findUnique({ where: { governmentId: government.id } });
    const receivedAt = new Date();
    const dueAt =
      rule?.daysToRespond == null ? null : new Date(receivedAt.getTime() + rule.daysToRespond * 24 * 60 * 60 * 1000);
    const year = receivedAt.getFullYear();
    const existing = await tx.recordsRequest.count({
      where: { governmentId: government.id, trackingNumber: { startsWith: `RR-${year}-` } },
    });
    const trackingNumber = `RR-${year}-${String(existing + 1).padStart(4, '0')}`;
    const request = await tx.recordsRequest.create({
      data: {
        governmentId: government.id,
        trackingNumber,
        requesterName: input.name,
        requesterEmail: email,
        description: input.description,
        receivedAt,
        dueAt,
        residentId: input.residentId,
      },
    });
    await writeAudit(tx, {
      governmentId: government.id,
      actorResidentId: input.residentId,
      action: 'records.file',
      entityType: 'RecordsRequest',
      entityId: request.id,
      after: { trackingNumber },
    });
    return {
      id: request.id,
      trackingNumber,
      dueAt: dueAt?.toISOString() ?? null,
      deadlineConfigured: dueAt != null,
    };
  });
}

export async function trackRecordsRequest(trackingNumber: string, email: string) {
  return withTenant({ governmentIds: 'all' }, async (tx) => {
    const request = await tx.recordsRequest.findFirst({
      where: { trackingNumber, requesterEmail: email.toLowerCase() },
      include: {
        government: true,
        releases: { where: { published: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!request) throw new DomainError(404, 'Request not found');
    const published = request.publishedAt != null;
    return {
      trackingNumber: request.trackingNumber,
      status: request.status,
      description: request.description,
      receivedAt: request.receivedAt.toISOString(),
      dueAt: request.dueAt?.toISOString() ?? null,
      deadlineConfigured: request.dueAt != null,
      publishedAt: request.publishedAt?.toISOString() ?? null,
      denialReason: published ? request.denialReason : null,
      government: { id: request.government.id, name: request.government.name, shortName: request.government.shortName, colorToken: request.government.colorToken },
      releases: published ? request.releases.map(publicRelease) : [],
    };
  });
}

export async function listPublishedRecords(governmentId?: string) {
  return withTenant({ governmentIds: 'all' }, async (tx) => {
    const rows = await tx.recordsRequest.findMany({
      where: { publishedAt: { not: null }, governmentId },
      include: {
        government: true,
        releases: { where: { published: true }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { publishedAt: 'desc' },
      take: 100,
    });
    return rows.map((request) => ({
      id: request.id,
      trackingNumber: request.trackingNumber,
      description: request.description,
      status: request.status,
      publishedAt: request.publishedAt?.toISOString() ?? null,
      denialReason: request.denialReason,
      government: { id: request.government.id, name: request.government.name, shortName: request.government.shortName, colorToken: request.government.colorToken },
      releases: request.releases.map(publicRelease),
    }));
  });
}

export async function listRecords(actor: StaffActor) {
  return withTenant(scopeFor(actor), async (tx) => {
    const rows = await tx.recordsRequest.findMany({
      include: { government: true, assignee: true, releases: true },
      orderBy: { receivedAt: 'desc' },
      take: 200,
    });
    return rows.filter((request) => {
      try {
        assertCan(actor, 'records.manage', { governmentId: request.governmentId });
        return true;
      } catch {
        return false;
      }
    }).map(staffView);
  });
}

function staffView(request: {
  id: string;
  trackingNumber: string;
  requesterName: string;
  requesterEmail: string;
  description: string;
  status: RecordsStatus;
  receivedAt: Date;
  dueAt: Date | null;
  closedAt: Date | null;
  publishedAt: Date | null;
  denialReason: string | null;
  governmentId: string;
  government: { shortName: string; name: string; colorToken: string };
  assignee: { id: string; name: string } | null;
  releases: { id: string; title: string; body: string; published: boolean; createdAt: Date }[];
}) {
  return {
    id: request.id,
    trackingNumber: request.trackingNumber,
    requesterName: request.requesterName,
    requesterEmail: request.requesterEmail,
    description: request.description,
    status: request.status,
    receivedAt: request.receivedAt.toISOString(),
    dueAt: request.dueAt?.toISOString() ?? null,
    deadlineConfigured: request.dueAt != null,
    closedAt: request.closedAt?.toISOString() ?? null,
    publishedAt: request.publishedAt?.toISOString() ?? null,
    denialReason: request.denialReason,
    governmentId: request.governmentId,
    government: request.government,
    assignee: request.assignee ? { id: request.assignee.id, name: request.assignee.name } : null,
    releases: request.releases.map((release) => ({
      id: release.id,
      title: release.title,
      body: release.body,
      published: release.published,
      createdAt: release.createdAt.toISOString(),
    })),
  };
}

async function loadRequest(actor: StaffActor, id: string) {
  return withTenant(scopeFor(actor), async (tx) => {
    const request = await tx.recordsRequest.findUnique({
      where: { id },
      include: { releases: { orderBy: { createdAt: 'asc' } }, government: true, assignee: true },
    });
    if (!request) throw new DomainError(404, 'Request not found');
    await assertModule(tx, request.governmentId, ModuleKey.RECORDS);
    assertCan(actor, 'records.manage', { governmentId: request.governmentId });
    return request;
  });
}

export async function getRecordsRequest(actor: StaffActor, id: string) {
  return staffView(await loadRequest(actor, id));
}

export async function updateRecordsRequest(
  actor: StaffActor,
  id: string,
  input: { status?: RecordsStatus; assigneeUserId?: string | null; denialReason?: string | null },
) {
  const current = await loadRequest(actor, id);
  if (input.status === 'DENIED' && !(input.denialReason ?? current.denialReason)) {
    throw new DomainError(400, 'A denial needs a reason');
  }
  const closing = input.status === 'FULFILLED' || input.status === 'DENIED' || input.status === 'WITHDRAWN';
  return withTenant(scopeFor(actor), async (tx) => {
    const updated = await tx.recordsRequest.update({
      where: { id },
      data: {
        status: input.status,
        assigneeUserId: input.assigneeUserId,
        denialReason: input.denialReason,
        closedAt: closing ? new Date() : input.status ? null : undefined,
      },
      include: { releases: true, government: true, assignee: true },
    });
    await writeAudit(tx, {
      governmentId: current.governmentId,
      actorUserId: actor.id,
      action: 'records.update',
      entityType: 'RecordsRequest',
      entityId: id,
      before: { status: current.status },
      after: { status: updated.status },
    });
    return staffView(updated);
  });
}

export async function addRecordsRelease(actor: StaffActor, requestId: string, input: { title: string; body: string }) {
  const request = await loadRequest(actor, requestId);
  return withTenant(scopeFor(actor), async (tx) => {
    const release = await tx.recordsRelease.create({
      data: { requestId, title: input.title, body: input.body, authoredByUserId: actor.id, published: false },
    });
    await writeAudit(tx, {
      governmentId: request.governmentId,
      actorUserId: actor.id,
      action: 'records.release',
      entityType: 'RecordsRelease',
      entityId: release.id,
      after: { title: input.title },
    });
    return release;
  });
}

export async function publishRecordsRequest(actor: StaffActor, id: string) {
  const request = await loadRequest(actor, id);
  if (request.status !== 'FULFILLED' && request.status !== 'DENIED') {
    throw new DomainError(409, 'Close the request before publishing a response');
  }
  if (request.status === 'DENIED' && !request.denialReason) throw new DomainError(400, 'A denial needs a reason');
  if (request.status === 'FULFILLED' && request.releases.length === 0) {
    throw new DomainError(409, 'Add a response before publishing');
  }
  return withTenant(scopeFor(actor), async (tx) => {
    await tx.recordsRelease.updateMany({ where: { requestId: id }, data: { published: true } });
    const updated = await tx.recordsRequest.update({
      where: { id },
      data: { publishedAt: new Date() },
      include: { releases: true, government: true, assignee: true },
    });
    await writeAudit(tx, {
      governmentId: request.governmentId,
      actorUserId: actor.id,
      action: 'records.publish',
      entityType: 'RecordsRequest',
      entityId: id,
    });
    return staffView(updated);
  });
}

export async function upsertRecordsRule(
  actor: StaffActor,
  input: { governmentId: string; daysToRespond?: number | null; citation?: string | null },
) {
  return withTenant(scopeFor(actor), async (tx) => {
    assertCan(actor, 'government.configure', { governmentId: input.governmentId });
    const rule = await tx.recordsRule.upsert({
      where: { governmentId: input.governmentId },
      update: { daysToRespond: input.daysToRespond, citation: input.citation },
      create: {
        governmentId: input.governmentId,
        daysToRespond: input.daysToRespond ?? null,
        citation: input.citation ?? 'Public records response period § TBD',
      },
    });
    await writeAudit(tx, {
      governmentId: input.governmentId,
      actorUserId: actor.id,
      action: 'records.rule',
      entityType: 'RecordsRule',
      entityId: rule.id,
      after: { daysToRespond: rule.daysToRespond },
    });
    return rule;
  });
}

