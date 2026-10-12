import { createHmac, randomBytes } from 'node:crypto';
import type { Channel, SubscriptionKind } from '@prisma/client';
import { withTenant, type Tx } from './client';
import { DomainError } from './errors';
import { writeAudit } from './audit';
import { mailProvider, messagingProvider } from './messaging';
import { enqueue } from './queue';

function secret(): string {
  return process.env.SESSION_SECRET ?? 'dev-only-session-secret';
}

export function unsubscribeToken(subscriptionId: string): string {
  const exp = Date.now() + 180 * 24 * 60 * 60 * 1000;
  const payload = `${subscriptionId}.${exp}`;
  const sig = createHmac('sha256', secret()).update(payload).digest('base64url');
  return Buffer.from(`${payload}.${sig}`).toString('base64url');
}

export function readUnsubscribeToken(token: string): string {
  const raw = Buffer.from(token, 'base64url').toString('utf8');
  const [id, exp, sig] = raw.split('.');
  if (!id || !exp || !sig) throw new DomainError(400, 'Invalid unsubscribe link');
  const expected = createHmac('sha256', secret()).update(`${id}.${exp}`).digest('base64url');
  if (expected !== sig || Number(exp) < Date.now()) throw new DomainError(400, 'Invalid unsubscribe link');
  return id;
}

export function squareWkt(lng: number, lat: number, delta = 0.0008): string {
  const ring = [
    [lng - delta, lat - delta],
    [lng + delta, lat - delta],
    [lng + delta, lat + delta],
    [lng - delta, lat + delta],
    [lng - delta, lat - delta],
  ]
    .map(([x, y]) => `${x} ${y}`)
    .join(', ');
  return `SRID=4326;MULTIPOLYGON(((${ring})))`;
}

export async function setParcelGeom(parcelId: string, wkt: string): Promise<void> {
  await withTenant({ governmentIds: 'all' }, async (tx) => {
    await tx.$executeRaw`UPDATE "Parcel" SET geom = ST_GeogFromText(${wkt}) WHERE id = ${parcelId}`;
  });
}

export async function setSubscriptionPoint(subscriptionId: string, lng: number, lat: number): Promise<void> {
  await withTenant({ governmentIds: 'all' }, async (tx) => {
    await tx.$executeRaw`
      UPDATE "Subscription"
      SET point = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      WHERE id = ${subscriptionId}
    `;
  });
}

async function geocode(tx: Tx, address: string): Promise<{ lng: number; lat: number } | null> {
  const rows = await tx.$queryRaw<{ lng: number; lat: number }[]>`
    SELECT ST_X(ST_Centroid(geom::geometry)) AS lng, ST_Y(ST_Centroid(geom::geometry)) AS lat
    FROM "Parcel"
    WHERE lower("situsAddress") = lower(${address}) AND geom IS NOT NULL
    LIMIT 1
  `;
  const hit = rows[0];
  if (hit && hit.lng != null && hit.lat != null) return { lng: Number(hit.lng), lat: Number(hit.lat) };
  if (process.env.GEOCODE_FIXTURES) {
    const fixtures = JSON.parse(process.env.GEOCODE_FIXTURES) as Record<string, { lng: number; lat: number }>;
    return fixtures[address.toLowerCase()] ?? null;
  }
  return null;
}

export async function createSubscription(input: {
  regionId: string;
  kind: SubscriptionKind;
  matterId?: string;
  bodyId?: string;
  address?: string;
  radiusFt?: number;
  channels: Channel[];
  email?: string;
  phone?: string;
  topic?: string;
}) {
  const token = randomBytes(24).toString('base64url');
  const created = await withTenant({ governmentIds: 'all' }, async (tx) => {
    const email = input.email?.toLowerCase();
    let resident = email ? await tx.resident.findUnique({ where: { email } }) : null;
    if (!resident && input.phone) resident = await tx.resident.findUnique({ where: { phone: input.phone } });
    if (!resident) {
      resident = await tx.resident.create({
        data: { regionId: input.regionId, email, phone: input.phone },
      });
    }
    const subscription = await tx.subscription.create({
      data: {
        residentId: resident.id,
        kind: input.kind,
        matterId: input.matterId,
        bodyId: input.bodyId,
        address: input.address,
        radiusFt: input.radiusFt,
        channels: input.channels,
        topic: input.topic,
      },
    });
    if (input.kind === 'ADDRESS' && input.address) {
      const point = await geocode(tx, input.address);
      if (point) {
        await tx.$executeRaw`
          UPDATE "Subscription"
          SET point = ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography
          WHERE id = ${subscription.id}
        `;
      }
    }
    const codeHash = (await import('./auth')).hashToken(token);
    await tx.oneTimeCode.create({
      data: {
        channel: input.channels[0] ?? 'EMAIL',
        destination: email ?? input.phone ?? '',
        codeHash,
        purpose: 'subscription_confirm',
        residentId: resident.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    await writeAudit(tx, {
      actorResidentId: resident.id,
      action: 'subscription.create',
      entityType: 'Subscription',
      entityId: subscription.id,
      after: { kind: input.kind },
    });
    return { subscription, resident };
  });
  const link = `${process.env.PUBLIC_BASE_URL ?? 'http://localhost:5173'}/follow?confirm=${token}`;
  const text = `Confirm this Referendum notice: ${link}`;
  if (input.email && input.channels.includes('EMAIL')) {
    await enqueue('send', {
      channel: 'EMAIL',
      destination: input.email,
      subject: 'Confirm your Referendum notice',
      body: text,
      idempotencyKey: `confirm:${created.subscription.id}`,
      governmentId: '',
    });
  }
  if (input.phone && input.channels.includes('SMS')) {
    await enqueue('send', {
      channel: 'SMS',
      destination: input.phone,
      subject: '',
      body: text,
      idempotencyKey: `confirm-sms:${created.subscription.id}`,
      governmentId: '',
    });
  }
  return { id: created.subscription.id, confirmed: false };
}

export async function confirmSubscription(token: string): Promise<{ id: string }> {
  const { hashToken } = await import('./auth');
  return withTenant({ governmentIds: 'all' }, async (tx) => {
    const code = await tx.oneTimeCode.findFirst({
      where: { codeHash: hashToken(token), purpose: 'subscription_confirm', consumedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!code?.residentId) throw new DomainError(400, 'Confirmation link expired');
    const subscription = await tx.subscription.findFirst({
      where: { residentId: code.residentId, confirmedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!subscription) throw new DomainError(404, 'Subscription not found');
    await tx.subscription.update({ where: { id: subscription.id }, data: { confirmedAt: new Date() } });
    await tx.oneTimeCode.update({ where: { id: code.id }, data: { consumedAt: new Date() } });
    await writeAudit(tx, {
      actorResidentId: code.residentId,
      action: 'subscription.confirm',
      entityType: 'Subscription',
      entityId: subscription.id,
    });
    return { id: subscription.id };
  });
}

export async function deleteSubscription(id: string, residentId?: string): Promise<void> {
  await withTenant({ governmentIds: 'all', residentId }, async (tx) => {
    const subscription = await tx.subscription.findUnique({ where: { id } });
    if (!subscription) throw new DomainError(404, 'Subscription not found');
    if (residentId && subscription.residentId !== residentId) throw new DomainError(403, 'Forbidden');
    await tx.subscription.delete({ where: { id } });
    await writeAudit(tx, {
      actorResidentId: subscription.residentId,
      action: 'subscription.delete',
      entityType: 'Subscription',
      entityId: id,
    });
  });
}

async function queueSend(
  tx: Tx,
  input: { governmentId?: string; channel: Channel; destination: string; subject?: string; body: string; idempotencyKey: string },
): Promise<boolean> {
  const existing = await tx.outboundMessage.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return false;
  await tx.outboundMessage.create({
    data: {
      governmentId: input.governmentId || null,
      idempotencyKey: input.idempotencyKey,
      channel: input.channel,
      destination: input.destination,
      subject: input.subject,
      body: input.body,
      status: 'queued',
    },
  });
  return true;
}

export async function deliverSend(data: {
  channel: string;
  destination: string;
  subject?: string;
  body: string;
  idempotencyKey: string;
  governmentId?: string;
}): Promise<void> {
  const created = await withTenant({ governmentIds: 'all' }, async (tx) =>
    queueSend(tx, {
      governmentId: data.governmentId,
      channel: data.channel === 'SMS' ? 'SMS' : 'EMAIL',
      destination: data.destination,
      subject: data.subject,
      body: data.body,
      idempotencyKey: data.idempotencyKey,
    }),
  );
  if (!created) return;
  try {
    if (data.channel === 'SMS') await messagingProvider().sendSms({ to: data.destination, body: data.body });
    else await mailProvider().send({ to: data.destination, subject: data.subject ?? 'Referendum', text: data.body });
    await withTenant({ governmentIds: 'all' }, async (tx) => {
      await tx.outboundMessage.update({ where: { idempotencyKey: data.idempotencyKey }, data: { status: 'sent' } });
    });
  } catch (error) {
    await withTenant({ governmentIds: 'all' }, async (tx) => {
      await tx.outboundMessage.update({
        where: { idempotencyKey: data.idempotencyKey },
        data: { status: 'failed' },
      });
    });
    throw error;
  }
}

export async function fanoutMeeting(meetingId: string, event: string): Promise<number> {
  const pending: { channel: Channel; destination: string; subject: string; body: string; key: string; governmentId: string }[] = [];
  await withTenant({ governmentIds: 'all' }, async (tx) => {
    const meeting = await tx.meeting.findUnique({
      where: { id: meetingId },
      include: {
        body: { include: { government: true } },
        items: { include: { matter: { include: { parcels: true } } } },
      },
    });
    if (!meeting) return;
    const matterIds = meeting.items.map((item) => item.matterId).filter((id): id is string => Boolean(id));
    const subscriptions = await tx.subscription.findMany({
      where: {
        confirmedAt: { not: null },
        OR: [
          { kind: 'BODY', bodyId: meeting.bodyId },
          { kind: 'MATTER', matterId: { in: matterIds.length ? matterIds : ['__none__'] } },
          { kind: 'DIGEST' },
        ],
      },
      include: { resident: true },
    });
    const addressIds = await addressSubscriberIds(tx, matterIds);
    if (addressIds.length > 0) {
      const extra = await tx.subscription.findMany({
        where: { id: { in: addressIds }, confirmedAt: { not: null } },
        include: { resident: true },
      });
      subscriptions.push(...extra);
    }
    const seen = new Set<string>();
    for (const subscription of subscriptions) {
      if (seen.has(subscription.id)) continue;
      seen.add(subscription.id);
      if (subscription.kind === 'DIGEST') continue;
      const text = `${meeting.body.government.shortName} ${meeting.body.name} updated ${event.replaceAll('.', ' ')}.`;
      for (const channel of subscription.channels) {
        const destination = channel === 'EMAIL' ? subscription.resident.email : subscription.resident.phone;
        if (!destination) continue;
        const key = `${subscription.id}:${meetingId}:${event}:${channel}`;
        const queued = await queueSend(tx, {
          governmentId: meeting.body.governmentId,
          channel,
          destination,
          subject: `${meeting.body.code} packet`,
          body: `${text}\n\nUnsubscribe: ${process.env.PUBLIC_BASE_URL ?? ''}/follow?unsubscribe=${unsubscribeToken(subscription.id)}`,
          idempotencyKey: key,
        });
        if (queued) {
          pending.push({
            channel,
            destination,
            subject: `${meeting.body.code} packet`,
            body: text,
            key,
            governmentId: meeting.body.governmentId,
          });
        }
      }
    }
  });
  for (const message of pending) {
    if (message.channel === 'SMS') await messagingProvider().sendSms({ to: message.destination, body: message.body });
    else await mailProvider().send({ to: message.destination, subject: message.subject, text: message.body });
    await withTenant({ governmentIds: 'all' }, async (tx) => {
      await tx.outboundMessage.update({ where: { idempotencyKey: message.key }, data: { status: 'sent' } });
    });
  }
  return pending.length;
}

async function addressSubscriberIds(tx: Tx, matterIds: string[]): Promise<string[]> {
  if (matterIds.length === 0) return [];
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT DISTINCT s.id
    FROM "Subscription" s
    JOIN "MatterParcel" mp ON mp."matterId" = ANY (${matterIds})
    JOIN "Parcel" p ON p.id = mp."parcelId"
    WHERE s.kind = 'ADDRESS'
      AND s.point IS NOT NULL
      AND s."radiusFt" IS NOT NULL
      AND p.geom IS NOT NULL
      AND ST_DWithin(s.point, p.geom, s."radiusFt" * 0.3048)
  `;
  return rows.map((row) => row.id);
}

export async function weeklyDigest(): Promise<number> {
  const residents = await withTenant({ governmentIds: 'all' }, async (tx) =>
    tx.subscription.findMany({
      where: { kind: 'DIGEST', confirmedAt: { not: null } },
      include: { resident: true },
    }),
  );
  let count = 0;
  for (const subscription of residents) {
    if (!subscription.resident.email || !subscription.channels.includes('EMAIL')) continue;
    const week = new Date().toISOString().slice(0, 10);
    await deliverSend({
      channel: 'EMAIL',
      destination: subscription.resident.email,
      subject: 'Referendum weekly log',
      body: `Upcoming meetings and recent decisions are on ${process.env.PUBLIC_BASE_URL ?? ''}/.\n\nUnsubscribe: ${process.env.PUBLIC_BASE_URL ?? ''}/follow?unsubscribe=${unsubscribeToken(subscription.id)}`,
      idempotencyKey: `${subscription.id}:digest:${week}`,
    });
    count += 1;
  }
  return count;
}

export async function notifySpeakerTwoAway(speakerId: string): Promise<boolean> {
  const speaker = await withTenant({ governmentIds: 'all' }, async (tx) => {
    const row = await tx.speakerSignup.findUnique({ where: { id: speakerId }, include: { agendaItem: { include: { meeting: { include: { body: true } } } } } });
    if (!row?.phone || row.notifiedTwoAway) return null;
    await tx.speakerSignup.update({ where: { id: speakerId }, data: { notifiedTwoAway: true } });
    return row;
  });
  if (!speaker?.phone) return false;
  await deliverSend({
    channel: 'SMS',
    destination: speaker.phone,
    body: `You are two speakers away on ${speaker.agendaItem.title}.`,
    idempotencyKey: `speaker:${speaker.id}:two-away`,
    governmentId: speaker.agendaItem.meeting.body.governmentId,
  });
  return true;
}
