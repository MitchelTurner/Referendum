import { PDFDocument, StandardFonts } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { authenticator } from 'otplib';
import {
  addDocument,
  adoptMinutes,
  callNextSpeaker,
  createItem,
  createMatter,
  createMeeting,
  createParcel,
  fanoutMeeting,
  getStaffMeeting,
  linkParcel,
  provisionStaff,
  publicItem,
  publishPacket,
  registerJobHandlers,
  resetDatabase,
  seedFoundation,
  setCurrentItem,
  setParcelGeom,
  setSubscriptionPoint,
  getTimer,
  setTimer,
  signUpSpeaker,
  squareWkt,
  startImport,
  upsertNoticeRule,
  updateItem,
  withTenant,
} from './index';

const REPORT = [
  'This staff report describes a demo ordinance.',
  'The ordinance sets the transient moorage rate at 84 cents per foot per day.',
  'The change applies to vessels using the Bar Harbor transient floats.',
  'It does not change annual reserved moorage.',
  'The harbormaster collects the new rate starting on July 1, 2027.',
  'The draft finds the rate covers float maintenance.',
  'Public comments close three days before the hearing.',
].join(' ');

const ANSWERED = [
  'What is the transient moorage rate?',
  'Which floats does the rate apply to?',
  'Does the ordinance change annual reserved moorage?',
  'Who collects the new rate?',
  'When would the new rate start?',
  'What does the rate cover?',
  'When do public comments close?',
  'What is the daily rate per foot?',
  'Which harbor is named in the staff report?',
  'What maintenance does the rate cover?',
];

const UNANSWERED = [
  'Who is the mayor?',
  'What is the sales tax rate?',
  'When is the next school board election?',
  'What is the police chief name?',
  'How many people live in Saxman?',
  'What is the property tax mill rate?',
  'Who chairs the assembly?',
  'What is the zoning of 123 Dock Street?',
  'What did the assembly decide about short term rentals?',
  'What is the city manager salary?',
];

beforeAll(async () => {
  registerJobHandlers();
  await resetDatabase();
  await seedFoundation();
});

describe('acceptance', () => {
  it('hides city drafts from a borough clerk and writes an audit row', async () => {
    const region = await withTenant({ governmentIds: 'all' }, (tx) =>
      tx.government.findMany({ include: { bodies: true } }),
    );
    const city = region.find((government) => government.shortName === 'City');
    const borough = region.find((government) => government.shortName === 'Borough');
    if (!city || !borough) throw new Error('seed missing');
    const cityClerk = await provisionStaff({
      email: 'city.clerk@test.local',
      name: 'City Clerk',
      password: 'Demo-password-1',
      totpSecret: 'JBSWY3DPEHPK3PXP',
      memberships: [{ governmentId: city.id, role: 'CLERK' }],
    });
    const boroughClerk = await provisionStaff({
      email: 'borough.clerk@test.local',
      name: 'Borough Clerk',
      password: 'Demo-password-1',
      totpSecret: 'JBSWY3DPEHPK3PXP',
      memberships: [{ governmentId: borough.id, role: 'CLERK' }],
    });
    expect(authenticator.generate(cityClerk.totpSecret)).toMatch(/^\d{6}$/);
    const body = city.bodies[0];
    if (!body) throw new Error('body missing');
    const meeting = await createMeeting(cityClerk.actor, {
      bodyId: body.id,
      startsAt: '2026-11-02T16:00:00.000Z',
      status: 'DRAFT',
    });
    await expect(getStaffMeeting(boroughClerk.actor, meeting.id)).rejects.toMatchObject({ status: 404 });
    const hidden = await withTenant({ governmentIds: [borough.id], userId: boroughClerk.actor.id }, (tx) =>
      tx.meeting.findUnique({ where: { id: meeting.id } }),
    );
    expect(hidden).toBeNull();
    const audits = await withTenant({ governmentIds: [city.id] }, (tx) =>
      tx.auditLog.findMany({ where: { entityId: meeting.id, action: 'meeting.create' } }),
    );
    expect(audits.length).toBeGreaterThan(0);
    await expect(
      withTenant({ governmentIds: 'all' }, (tx) => tx.auditLog.update({ where: { id: audits[0]!.id }, data: { action: 'tamper' } })),
    ).rejects.toThrow(/append-only/);
  });

  it('blocks packet publish until notice, reviews, and items are ready', async () => {
    const borough = await withTenant({ governmentIds: 'all' }, (tx) =>
      tx.government.findFirstOrThrow({ where: { shortName: 'Borough' }, include: { bodies: true } }),
    );
    const clerk = await provisionStaff({
      email: 'publish.clerk@test.local',
      name: 'Publish Clerk',
      password: 'Demo-password-1',
      totpSecret: 'JBSWY3DPEHPK3PXP',
      memberships: [{ governmentId: borough.id, role: 'CLERK' }],
    });
    const body = borough.bodies.find((candidate) => candidate.code === 'ASM');
    if (!body) throw new Error('assembly missing');
    const meeting = await createMeeting(clerk.actor, {
      bodyId: body.id,
      startsAt: '2026-10-20T16:00:00.000Z',
      noticePostedAt: '2026-10-01T16:00:00.000Z',
      status: 'NOTICED',
    });
    const item = await createItem(clerk.actor, {
      meetingId: meeting.id,
      position: '1',
      sortKey: 1,
      type: 'PRESENTATION',
      title: 'Harbor report',
    });
    await updateItem(clerk.actor, item.id, { status: 'READY' });
    await expect(publishPacket(clerk.actor, meeting.id)).rejects.toMatchObject({
      status: 409,
      details: { blockers: expect.arrayContaining(['Notice rule not configured']) },
    });
    await upsertNoticeRule(clerk.actor, {
      governmentId: borough.id,
      bodyId: body.id,
      daysBefore: 7,
      codeCitation: 'KGB Code § TBD',
    });
    const published = await publishPacket(clerk.actor, meeting.id);
    expect(published.meetingId).toBe(meeting.id);
  });

  it('renders a 100-page PDF as 100 linkable HTML pages', async () => {
    const borough = await withTenant({ governmentIds: 'all' }, (tx) =>
      tx.government.findFirstOrThrow({ where: { shortName: 'Borough' }, include: { bodies: true } }),
    );
    const clerk = (
      await withTenant({ governmentIds: 'all' }, (tx) => tx.user.findUniqueOrThrow({ where: { email: 'publish.clerk@test.local' }, include: { memberships: true } }))
    );
    const actor = {
      id: clerk.id,
      email: clerk.email,
      name: clerk.name,
      memberships: clerk.memberships.map((membership) => ({
        governmentId: membership.governmentId,
        role: membership.role,
        personId: membership.personId,
      })),
    };
    const body = borough.bodies.find((candidate) => candidate.code === 'PC');
    if (!body) throw new Error('commission missing');
    const meeting = await createMeeting(actor, {
      bodyId: body.id,
      startsAt: '2026-12-01T16:00:00.000Z',
      status: 'PACKET_PUBLISHED',
    });
    const item = await createItem(actor, {
      meetingId: meeting.id,
      position: '2',
      sortKey: 1,
      type: 'REPORT',
      title: 'Packet pagination',
      status: 'PUBLISHED',
    });
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (let pageNumber = 1; pageNumber <= 100; pageNumber += 1) {
      const page = pdf.addPage();
      page.drawText(`Packet page ${pageNumber} discusses float maintenance.`, { x: 50, y: 700, size: 12, font });
    }
    const bytes = Buffer.from(await pdf.save());
    const document = await addDocument(actor, {
      agendaItemId: item.id,
      title: 'Long packet',
      kind: 'exhibit',
      filename: 'packet.pdf',
      bytes,
    });
    const stored = await withTenant({ governmentIds: 'all' }, (tx) =>
      tx.document.findUniqueOrThrow({
        where: { id: document.id },
        include: { pages: { orderBy: { pageNumber: 'asc' } } },
      }),
    );
    expect(stored.pageCount).toBe(100);
    expect(stored.pages).toHaveLength(100);
    expect(stored.pages[0]?.html).toContain('id="page-1"');
    expect(stored.pages[99]?.html).toContain('id="page-100"');
    expect(stored.pages[99]?.html).toContain('Packet page 100');
  });

  it('answers packet questions with valid citations and refuses outside questions', async () => {
    const { askPackets } = await import('./ask');
    const borough = await withTenant({ governmentIds: 'all' }, (tx) =>
      tx.government.findFirstOrThrow({ where: { shortName: 'Borough' }, include: { bodies: true } }),
    );
    const clerk = await withTenant({ governmentIds: 'all' }, (tx) =>
      tx.user.findUniqueOrThrow({ where: { email: 'publish.clerk@test.local' }, include: { memberships: true } }),
    );
    const actor = {
      id: clerk.id,
      email: clerk.email,
      name: clerk.name,
      memberships: clerk.memberships.map((membership) => ({
        governmentId: membership.governmentId,
        role: membership.role,
        personId: membership.personId,
      })),
    };
    const body = borough.bodies.find((candidate) => candidate.code === 'ASM');
    if (!body) throw new Error('assembly missing');
    const matter = await createMatter(actor, {
      governmentId: borough.id,
      title: 'Moorage ordinance',
      caseNumber: 'ASK-1',
      kind: 'ordinance',
    });
    const meeting = await createMeeting(actor, {
      bodyId: body.id,
      startsAt: '2026-08-01T16:00:00.000Z',
      status: 'PACKET_PUBLISHED',
    });
    const item = await createItem(actor, {
      meetingId: meeting.id,
      matterId: matter.id,
      position: '8.a',
      sortKey: 1,
      type: 'PUBLIC_HEARING',
      title: 'Moorage ordinance',
      status: 'PUBLISHED',
    });
    await addDocument(actor, {
      agendaItemId: item.id,
      matterId: matter.id,
      title: 'Staff report',
      kind: 'staff_report',
      filename: 'report.txt',
      bytes: Buffer.from(REPORT),
    });
    for (const question of ANSWERED) {
      const response = await askPackets({ regionSlug: 'ketchikan', question, matterId: matter.id, ip: `ask-${question.length}` });
      expect(response.answered, question).toBe(true);
      expect(response.citations.length, question).toBeGreaterThan(0);
      for (const citation of response.citations) {
        const page = await withTenant({ governmentIds: 'all' }, (tx) => tx.documentPage.findUnique({ where: { id: citation.pageId } }));
        expect(page, question).toBeTruthy();
        expect(page?.text.includes(citation.quote), question).toBe(true);
      }
    }
    for (const question of UNANSWERED) {
      const response = await askPackets({ regionSlug: 'ketchikan', question, matterId: matter.id, ip: `no-${question.length}` });
      expect(response.answered, question).toBe(false);
    }
  });

  it('notifies an address inside the radius and not one outside it', async () => {
    const borough = await withTenant({ governmentIds: 'all' }, (tx) =>
      tx.government.findFirstOrThrow({ where: { shortName: 'Borough' }, include: { bodies: true, region: true } }),
    );
    const clerk = await withTenant({ governmentIds: 'all' }, (tx) =>
      tx.user.findUniqueOrThrow({ where: { email: 'publish.clerk@test.local' }, include: { memberships: true } }),
    );
    const actor = {
      id: clerk.id,
      email: clerk.email,
      name: clerk.name,
      memberships: clerk.memberships.map((membership) => ({
        governmentId: membership.governmentId,
        role: membership.role,
        personId: membership.personId,
      })),
    };
    const matter = await createMatter(actor, { governmentId: borough.id, title: 'Parcel notice', kind: 'case' });
    const parcel = await createParcel(actor, {
      governmentId: borough.id,
      parcelNumber: 'RADIUS-1',
      situsAddress: '1 Demo Dock',
    });
    await linkParcel(actor, matter.id, parcel.id);
    await setParcelGeom(parcel.id, squareWkt(-131.646, 55.342));
    const near = await withTenant({ governmentIds: 'all' }, async (tx) => {
      const resident = await tx.resident.create({ data: { regionId: borough.region.id, email: 'inside-radius@test.local' } });
      return tx.subscription.create({
        data: { residentId: resident.id, kind: 'ADDRESS', address: '1 Demo Dock', radiusFt: 500, channels: ['EMAIL'], confirmedAt: new Date() },
      });
    });
    const far = await withTenant({ governmentIds: 'all' }, async (tx) => {
      const resident = await tx.resident.create({ data: { regionId: borough.region.id, email: 'outside-radius@test.local' } });
      return tx.subscription.create({
        data: { residentId: resident.id, kind: 'ADDRESS', address: 'Far away', radiusFt: 500, channels: ['EMAIL'], confirmedAt: new Date() },
      });
    });
    await setSubscriptionPoint(near.id, -131.646, 55.342);
    await setSubscriptionPoint(far.id, -131.6, 55.3);
    const body = borough.bodies.find((candidate) => candidate.code === 'ASM');
    if (!body) throw new Error('assembly missing');
    const meeting = await createMeeting(actor, {
      bodyId: body.id,
      startsAt: '2026-09-01T16:00:00.000Z',
      status: 'PACKET_PUBLISHED',
    });
    await createItem(actor, {
      meetingId: meeting.id,
      matterId: matter.id,
      position: '3',
      sortKey: 1,
      type: 'PUBLIC_HEARING',
      title: 'Parcel hearing',
      status: 'PUBLISHED',
    });
    await fanoutMeeting(meeting.id, 'item.scheduled');
    const messages = await withTenant({ governmentIds: 'all' }, (tx) =>
      tx.outboundMessage.findMany({ where: { destination: { in: ['inside-radius@test.local', 'outside-radius@test.local'] } } }),
    );
    expect(messages.map((message) => message.destination)).toContain('inside-radius@test.local');
    expect(messages.map((message) => message.destination)).not.toContain('outside-radius@test.local');
  });

  it('keeps live consoles on one timer and texts the speaker two away once', async () => {
    const borough = await withTenant({ governmentIds: 'all' }, (tx) =>
      tx.government.findFirstOrThrow({ where: { shortName: 'Borough' }, include: { bodies: true } }),
    );
    const clerk = await withTenant({ governmentIds: 'all' }, (tx) =>
      tx.user.findUniqueOrThrow({ where: { email: 'publish.clerk@test.local' }, include: { memberships: true } }),
    );
    const actor = {
      id: clerk.id,
      email: clerk.email,
      name: clerk.name,
      memberships: clerk.memberships.map((membership) => ({
        governmentId: membership.governmentId,
        role: membership.role,
        personId: membership.personId,
      })),
    };
    const body = borough.bodies.find((candidate) => candidate.code === 'ASM');
    if (!body) throw new Error('assembly missing');
    const meeting = await createMeeting(actor, { bodyId: body.id, startsAt: '2026-10-21T16:00:00.000Z', status: 'IN_PROGRESS' });
    const item = await createItem(actor, {
      meetingId: meeting.id,
      position: '4',
      sortKey: 1,
      type: 'PUBLIC_HEARING',
      title: 'Live item',
      testimonyOpen: true,
      status: 'PUBLISHED',
    });
    await setCurrentItem(actor, meeting.id, item.id);
    await setTimer(actor, meeting.id, 'start', 180);
    const first = await setTimer(actor, meeting.id, 'start');
    const second = await getTimer(meeting.id);
    expect(first.running).toBe(true);
    expect(second.running).toBe(true);
    expect(second.durationSec).toBe(180);
    for (const [index, phone] of ['+19075551001', '+19075551002', '+19075551003'].entries()) {
      await signUpSpeaker({
        itemId: item.id,
        displayName: `Speaker ${index + 1}`,
        mode: 'PHONE',
        phone,
        turnstileToken: 'test-pass',
        ip: `speaker-${index}`,
      });
    }
    await callNextSpeaker(actor, meeting.id);
    await callNextSpeaker(actor, meeting.id);
    const texts = await withTenant({ governmentIds: 'all' }, (tx) =>
      tx.outboundMessage.findMany({ where: { destination: { in: ['+19075551001', '+19075551002', '+19075551003'] } } }),
    );
    const third = texts.filter((message) => message.destination === '+19075551003');
    expect(third).toHaveLength(1);
  });

  it('keeps unaccepted AI motions off the public item and adopted minutes', async () => {
    const borough = await withTenant({ governmentIds: 'all' }, (tx) =>
      tx.government.findFirstOrThrow({ where: { shortName: 'Borough' }, include: { bodies: true } }),
    );
    const clerk = await withTenant({ governmentIds: 'all' }, (tx) =>
      tx.user.findUniqueOrThrow({ where: { email: 'publish.clerk@test.local' }, include: { memberships: true } }),
    );
    const actor = {
      id: clerk.id,
      email: clerk.email,
      name: clerk.name,
      memberships: clerk.memberships.map((membership) => ({
        governmentId: membership.governmentId,
        role: membership.role,
        personId: membership.personId,
      })),
    };
    const body = borough.bodies.find((candidate) => candidate.code === 'CC' || candidate.code === 'ASM');
    if (!body) throw new Error('body missing');
    const meeting = await createMeeting(actor, {
      bodyId: body.id,
      startsAt: '2026-07-01T16:00:00.000Z',
      status: 'MINUTES_DRAFT',
    });
    const item = await createItem(actor, {
      meetingId: meeting.id,
      position: '9',
      sortKey: 1,
      type: 'NEW_BUSINESS',
      title: 'Minutes item',
      status: 'HEARD',
    });
    await withTenant({ governmentIds: 'all' }, (tx) =>
      tx.motion.create({
        data: { agendaItemId: item.id, text: 'SECRET DRAFT MOTION SHOULD STAY HIDDEN', source: 'ai_draft' },
      }),
    );
    const visible = await publicItem(item.id);
    expect(JSON.stringify(visible.motions)).not.toContain('SECRET DRAFT MOTION');
    const adopted = await adoptMinutes(actor, meeting.id);
    expect(adopted.text).not.toContain('SECRET DRAFT MOTION');
  });

  it('imports a sample archive into searchable pages', async () => {
    const { askPackets } = await import('./ask');
    const borough = await withTenant({ governmentIds: 'all' }, (tx) =>
      tx.government.findFirstOrThrow({ where: { shortName: 'Borough' } }),
    );
    const clerk = await withTenant({ governmentIds: 'all' }, (tx) =>
      tx.user.findUniqueOrThrow({ where: { email: 'publish.clerk@test.local' }, include: { memberships: true } }),
    );
    const actor = {
      id: clerk.id,
      email: clerk.email,
      name: clerk.name,
      memberships: clerk.memberships.map((membership) => ({
        governmentId: membership.governmentId,
        role: membership.role,
        personId: membership.personId,
      })),
    };
    const job = await startImport(actor, { governmentId: borough.id, source: 'civicplus_agendacenter' });
    const finished = await withTenant({ governmentIds: 'all' }, (tx) => tx.importJob.findUniqueOrThrow({ where: { id: job.id } }));
    expect(finished.status).toBe('done');
    const response = await askPackets({
      regionSlug: 'ketchikan',
      question: 'What is the noise curfew?',
      ip: 'import-ask',
    });
    expect(response.answered).toBe(true);
    expect(response.citations[0]?.pageNumber).toBeGreaterThan(0);
  });
});
