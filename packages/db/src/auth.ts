import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import type { StaffRole } from '@referendum/shared';
import { withTenant } from './client';
import { DomainError } from './errors';
import { writeAudit } from './audit';
import type { StaffActor } from './access';
import { mailProvider, messagingProvider } from './messaging';

authenticator.options = { window: 1 };

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function secretsEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function actorByUserId(userId: string): Promise<StaffActor | null> {
  return withTenant({ governmentIds: 'all', userId }, async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      include: { memberships: true },
    });
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      memberships: user.memberships.map((membership) => ({
        governmentId: membership.governmentId,
        role: membership.role as StaffRole,
        personId: membership.personId,
      })),
    };
  });
}

export async function provisionStaff(input: {
  email: string;
  name: string;
  password: string;
  totpSecret?: string;
  memberships: { governmentId: string; role: StaffRole; personId?: string | null }[];
}): Promise<{ actor: StaffActor; totpSecret: string }> {
  const totpSecret = input.totpSecret ?? authenticator.generateSecret();
  const passwordHash = await bcrypt.hash(input.password, 12);
  const actor = await withTenant({ governmentIds: 'all' }, async (tx) => {
    const user = await tx.user.upsert({
      where: { email: input.email.toLowerCase() },
      update: { name: input.name, passwordHash, totpSecret },
      create: { email: input.email.toLowerCase(), name: input.name, passwordHash, totpSecret },
    });
    for (const membership of input.memberships) {
      await tx.membership.upsert({
        where: { userId_governmentId: { userId: user.id, governmentId: membership.governmentId } },
        update: { role: membership.role, personId: membership.personId ?? null },
        create: {
          userId: user.id,
          governmentId: membership.governmentId,
          role: membership.role,
          personId: membership.personId ?? null,
        },
      });
    }
    await writeAudit(tx, {
      actorUserId: user.id,
      action: 'user.provision',
      entityType: 'User',
      entityId: user.id,
      after: { email: user.email, memberships: input.memberships.map((item) => item.role) },
    });
    return user.id;
  });
  const loaded = await actorByUserId(actor);
  if (!loaded) throw new DomainError(500, 'Could not load staff user');
  return { actor: loaded, totpSecret };
}

export async function startStaffLogin(
  email: string,
  password: string,
): Promise<{ challengeToken: string; enrollment?: { otpauth: string } }> {
  const user = await withTenant({ governmentIds: 'all' }, async (tx) =>
    tx.user.findUnique({ where: { email: email.toLowerCase() } }),
  );
  if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new DomainError(401, 'Invalid email or password');
  }
  const challengeToken = newToken();
  const purpose = user.totpSecret ? 'totp_login' : 'totp_enroll';
  const pendingSecret = user.totpSecret ?? authenticator.generateSecret();
  await withTenant({ governmentIds: 'all', userId: user.id }, async (tx) => {
    await tx.oneTimeCode.create({
      data: {
        channel: 'EMAIL',
        destination: purpose === 'totp_enroll' ? pendingSecret : user.email,
        codeHash: hashToken(challengeToken),
        purpose,
        userId: user.id,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
  });
  if (purpose === 'totp_enroll') {
    return { challengeToken, enrollment: { otpauth: authenticator.keyuri(user.email, 'Referendum', pendingSecret) } };
  }
  return { challengeToken };
}

export async function completeStaffTotp(challengeToken: string, code: string): Promise<{ token: string; actor: StaffActor }> {
  const tokenHash = hashToken(challengeToken);
  const sessionToken = await withTenant({ governmentIds: 'all' }, async (tx) => {
    const challenge = await tx.oneTimeCode.findFirst({
      where: { codeHash: tokenHash, consumedAt: null, expiresAt: { gt: new Date() }, purpose: { in: ['totp_login', 'totp_enroll'] } },
    });
    if (!challenge?.userId) throw new DomainError(401, 'Challenge expired');
    const user = await tx.user.findUnique({ where: { id: challenge.userId } });
    if (!user) throw new DomainError(401, 'Challenge expired');
    const secret = challenge.purpose === 'totp_enroll' ? challenge.destination : user.totpSecret;
    if (!secret || !authenticator.verify({ token: code, secret })) {
      throw new DomainError(401, 'Invalid authenticator code');
    }
    if (challenge.purpose === 'totp_enroll') {
      await tx.user.update({ where: { id: user.id }, data: { totpSecret: secret } });
    }
    await tx.oneTimeCode.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
    const token = newToken();
    await tx.session.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
      },
    });
    await tx.$executeRaw`SELECT set_config('app.user_id', ${user.id}, true)`;
    await writeAudit(tx, {
      actorUserId: user.id,
      action: 'auth.login',
      entityType: 'User',
      entityId: user.id,
    });
    return token;
  });
  const actor = await staffFromToken(sessionToken);
  if (!actor) throw new DomainError(401, 'Session was not created');
  return { token: sessionToken, actor };
}

export async function staffFromToken(token: string): Promise<StaffActor | null> {
  const tokenHash = hashToken(token);
  const userId = await withTenant({ governmentIds: 'all' }, async (tx) => {
    const session = await tx.session.findUnique({ where: { tokenHash } });
    if (!session?.userId || session.expiresAt < new Date()) return null;
    return session.userId;
  });
  if (!userId) return null;
  return actorByUserId(userId);
}

export async function logoutStaff(token: string): Promise<void> {
  await withTenant({ governmentIds: 'all' }, async (tx) => {
    await tx.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  });
}

async function deliver(to: string, channel: 'EMAIL' | 'SMS', subject: string, text: string, key: string): Promise<void> {
  await withTenant({ governmentIds: 'all' }, async (tx) => {
    await tx.outboundMessage.create({
      data: {
        idempotencyKey: key,
        channel,
        destination: to,
        subject,
        body: text,
        status: 'queued',
      },
    });
  });
  if (channel === 'EMAIL') await mailProvider().send({ to, subject, text });
  else await messagingProvider().sendSms({ to, body: text });
}

export async function startMagicLink(regionId: string, email: string): Promise<void> {
  const token = newToken();
  const residentId = await withTenant({ governmentIds: 'all' }, async (tx) => {
    const resident = await tx.resident.upsert({
      where: { email: email.toLowerCase() },
      update: { regionId },
      create: { email: email.toLowerCase(), regionId },
    });
    await tx.oneTimeCode.create({
      data: {
        channel: 'EMAIL',
        destination: email.toLowerCase(),
        codeHash: hashToken(token),
        purpose: 'magic_link',
        residentId: resident.id,
        expiresAt: new Date(Date.now() + 20 * 60 * 1000),
      },
    });
    return resident.id;
  });
  const link = `${process.env.PUBLIC_BASE_URL ?? 'http://localhost:5173'}/account?token=${token}`;
  await deliver(email, 'EMAIL', 'Your Referendum sign-in link', `Sign in: ${link}`, `magic:${residentId}:${hashToken(token)}`);
}

export async function verifyMagicLink(token: string): Promise<{ token: string; residentId: string }> {
  return withTenant({ governmentIds: 'all' }, async (tx) => {
    const row = await tx.oneTimeCode.findFirst({
      where: { codeHash: hashToken(token), purpose: 'magic_link', consumedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!row?.residentId) throw new DomainError(401, 'Link expired');
    await tx.oneTimeCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
    const session = newToken();
    await tx.session.create({
      data: {
        residentId: row.residentId,
        tokenHash: hashToken(session),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    await writeAudit(tx, {
      actorResidentId: row.residentId,
      action: 'auth.magic_link',
      entityType: 'Resident',
      entityId: row.residentId,
    });
    return { token: session, residentId: row.residentId };
  });
}

export async function startSmsCode(regionId: string, phone: string): Promise<void> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const residentId = await withTenant({ governmentIds: 'all' }, async (tx) => {
    const resident = await tx.resident.upsert({
      where: { phone },
      update: { regionId },
      create: { phone, regionId },
    });
    await tx.oneTimeCode.create({
      data: {
        channel: 'SMS',
        destination: phone,
        codeHash: hashToken(code),
        purpose: 'sms_login',
        residentId: resident.id,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
    return resident.id;
  });
  await deliver(phone, 'SMS', 'Sign-in code', `Referendum code: ${code}`, `sms:${residentId}:${hashToken(code)}`);
}

export async function verifySmsCode(phone: string, code: string): Promise<{ token: string; residentId: string }> {
  return withTenant({ governmentIds: 'all' }, async (tx) => {
    const rows = await tx.oneTimeCode.findMany({
      where: { destination: phone, purpose: 'sms_login', consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });
    const match = rows.find((row) => secretsEqual(row.codeHash, hashToken(code)));
    if (!match?.residentId) throw new DomainError(401, 'Invalid code');
    await tx.oneTimeCode.update({ where: { id: match.id }, data: { consumedAt: new Date() } });
    const session = newToken();
    await tx.session.create({
      data: {
        residentId: match.residentId,
        tokenHash: hashToken(session),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    return { token: session, residentId: match.residentId };
  });
}

export async function residentFromToken(token: string): Promise<{ id: string; regionId: string; email: string | null; phone: string | null } | null> {
  return withTenant({ governmentIds: 'all' }, async (tx) => {
    const session = await tx.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { resident: true },
    });
    if (!session?.resident || session.expiresAt < new Date()) return null;
    return {
      id: session.resident.id,
      regionId: session.resident.regionId,
      email: session.resident.email,
      phone: session.resident.phone,
    };
  });
}
