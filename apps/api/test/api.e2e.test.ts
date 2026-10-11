import { authenticator } from 'otplib';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { disconnectPrisma, provisionStaff, resetDatabase, seedFoundation, withTenant } from '@referendum/db';
import { createApp } from '../src/main';

const email = 'clerk.api@demo.referendum.local';
const password = 'Demo-password-1';
const totpSecret = 'JBSWY3DPEHPK3PXP';

describe('api', () => {
  let server: ReturnType<Awaited<ReturnType<typeof createApp>>['getHttpServer']>;
  let close: () => Promise<void>;

  beforeAll(async () => {
    authenticator.options = { window: 1 };
    await resetDatabase();
    const region = await seedFoundation();
    const borough = await withTenant({ governmentIds: 'all' }, (tx) =>
      tx.government.findFirstOrThrow({ where: { shortName: 'Borough', regionId: region.id } }),
    );
    await provisionStaff({
      email,
      name: '[DEMO] API Clerk',
      password,
      totpSecret,
      memberships: [{ governmentId: borough.id, role: 'CLERK' }],
    });
    const app = await createApp();
    await app.init();
    server = app.getHttpServer();
    close = () => app.close();
  });

  afterAll(async () => {
    await close();
    await disconnectPrisma();
  });

  it('reports healthy dependencies', async () => {
    const response = await request(server).get('/health').expect(200);
    expect(response.body.ok).toBe(true);
  });

  it('lists the public calendar and open data', async () => {
    await request(server).get('/public/calendar').expect(200);
    const open = await request(server).get('/api/v1/meetings.json').expect(200);
    expect(Array.isArray(open.body)).toBe(true);
    expect(open.headers['access-control-allow-origin']).toBeTruthy();
  });

  it('rejects staff routes without a session', async () => {
    await request(server).get('/staff/inbox').expect(401);
  });

  it('signs in a clerk and blocks an unready packet', async () => {
    const agent = request.agent(server);
    const login = await agent.post('/auth/staff/login').send({ email, password }).expect(201);
    const code = authenticator.generate(totpSecret);
    await agent.post('/auth/staff/totp').send({ challengeToken: login.body.challengeToken, code }).expect(201);
    await agent.get('/staff/inbox').expect(200);
    const bodies = await agent.get('/staff/bodies').expect(200);
    const assembly = bodies.body.find((body: { code: string }) => body.code === 'ASM');
    const meeting = await agent
      .post('/staff/meetings')
      .send({ bodyId: assembly.id, startsAt: new Date('2026-12-01T03:00:00.000Z').toISOString(), location: '[DEMO] chambers' })
      .expect(201);
    const blocked = await agent.post(`/staff/meetings/${meeting.body.id}/publish-packet`).expect(409);
    expect(blocked.body.message).toMatch(/not ready/i);
    expect(Array.isArray(blocked.body.blockers)).toBe(true);
  });
});
