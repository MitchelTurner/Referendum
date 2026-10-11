import { config } from 'dotenv';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { seedFoundation } from './seed';
import { withTenant } from './client';
import { provisionStaff } from './auth';
import { embedDocument, storeDocumentPages } from './documents';
import { putObject } from './storage';
import { setParcelGeom, setSubscriptionPoint, squareWkt } from './notify';

config({ path: path.resolve(__dirname, '../../../.env') });

const REPORT = `This staff report describes a [DEMO] ordinance. The ordinance sets the transient moorage rate at 84 cents per foot per day. The change applies to vessels using the Bar Harbor transient floats. It does not change annual reserved moorage.

The harbormaster would collect the new rate starting on July 1, 2027. The draft finds the rate covers float maintenance. Public comments close three days before the hearing.`;

async function staffReportPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const page = doc.addPage([612, 792]);
  const lines = REPORT.split('\n');
  let y = 740;
  for (const line of lines) {
    page.drawText(line || ' ', { x: 54, y, size: 12, font, color: rgb(0.04, 0.15, 0.27) });
    y -= 22;
  }
  return Buffer.from(await doc.save());
}

export async function seedDemo() {
  await seedFoundation();
  const meetingId = await withTenant({ governmentIds: 'all' }, async (tx) => {
    const borough = await tx.government.findFirstOrThrow({ where: { shortName: 'Borough' } });
    const assembly = await tx.body.findFirstOrThrow({ where: { governmentId: borough.id, code: 'ASM' } });
    const commission = await tx.body.findFirstOrThrow({ where: { governmentId: borough.id, code: 'PC' } });
    const existing = await tx.meeting.findFirst({
      where: { bodyId: assembly.id, location: '[DEMO] Assembly chambers' },
    });
    if (existing) return existing.id;
    const ada = await tx.person.create({ data: { fullName: '[DEMO] Ada Larsen', email: 'ada.demo@referendum.local' } });
    const ben = await tx.person.create({ data: { fullName: '[DEMO] Ben Paul', email: 'ben.demo@referendum.local' } });
    const cio = await tx.person.create({ data: { fullName: '[DEMO] Cio Smith', email: 'cio.demo@referendum.local' } });
    const matter = await tx.matter.create({
      data: {
        governmentId: borough.id,
        title: '[DEMO] Transient moorage rate adjustment',
        caseNumber: '[DEMO]-25-053',
        kind: 'ordinance',
        summaryEn:
          'The [DEMO] ordinance would set transient moorage at 84 cents per foot per day. It applies to vessels at the Bar Harbor transient floats.',
        summaryApprovedByUserId: null,
      },
    });
    const starts = new Date('2026-10-20T02:00:00.000Z');
    const meeting = await tx.meeting.create({
      data: {
        bodyId: assembly.id,
        startsAt: starts,
        location: '[DEMO] Assembly chambers',
        status: 'IN_PROGRESS',
        noticePostedAt: new Date('2026-10-01T16:00:00.000Z'),
        packetPublishedAt: new Date('2026-10-13T16:00:00.000Z'),
      },
    });
    await tx.matterEvent.createMany({
      data: [
        {
          matterId: matter.id,
          label: 'Commission public hearing',
          bodyId: commission.id,
          occurredAt: new Date('2026-09-15T16:00:00.000Z'),
          order: 1,
        },
        {
          matterId: matter.id,
          label: 'Assembly hearing',
          bodyId: assembly.id,
          meetingId: meeting.id,
          occurredAt: starts,
          order: 2,
        },
        {
          matterId: matter.id,
          label: 'Assembly adoption',
          bodyId: assembly.id,
          projectedFor: new Date('2026-11-03T16:00:00.000Z'),
          order: 3,
        },
      ],
    });
    const item = await tx.agendaItem.create({
      data: {
        meetingId: meeting.id,
        matterId: matter.id,
        position: '8.a',
        sortKey: 1,
        type: 'PUBLIC_HEARING',
        title: '[DEMO] Transient moorage rate adjustment',
        status: 'PUBLISHED',
        commentsCloseAt: new Date('2026-10-17T16:00:00.000Z'),
        testimonyOpen: true,
      },
    });
    await tx.meeting.update({ where: { id: meeting.id }, data: { currentItemId: item.id } });
    const pdf = await staffReportPdf();
    const storageKey = 'demo/staff-report.pdf';
    await putObject(storageKey, pdf, 'application/pdf');
    const document = await tx.document.create({
      data: {
        agendaItemId: item.id,
        matterId: matter.id,
        title: 'Staff report',
        kind: 'staff_report',
        storageKey,
        version: 1,
      },
    });
    await tx.publicComment.createMany({
      data: [
        {
          agendaItemId: item.id,
          name: '[DEMO] Riley Chen',
          position: 'SUPPORT',
          body: '[DEMO] I support the float maintenance rate.',
          onTime: true,
          publishedAt: new Date(),
        },
        {
          agendaItemId: item.id,
          name: '[DEMO] Morgan Hale',
          position: 'OPPOSE',
          body: '[DEMO] Please phase the change in over two seasons.',
          onTime: true,
          publishedAt: new Date(),
        },
      ],
    });
    await tx.speakerSignup.createMany({
      data: [
        { agendaItemId: item.id, displayName: '[DEMO] Riley Chen', mode: 'IN_PERSON', queuePosition: 1 },
        { agendaItemId: item.id, displayName: '[DEMO] Morgan Hale', mode: 'PHONE', phone: '+19075550101', queuePosition: 2 },
        { agendaItemId: item.id, displayName: '[DEMO] Sam Ortiz', mode: 'PHONE', phone: '+19075550102', queuePosition: 3 },
      ],
    });
    const motion = await tx.motion.create({
      data: {
        agendaItemId: item.id,
        text: '[DEMO] I move to adopt the transient moorage ordinance.',
        moverPersonId: ada.id,
        seconderPersonId: ben.id,
        source: 'ai_draft',
        transcriptStartSec: 640,
      },
    });
    await tx.vote.createMany({
      data: [
        { motionId: motion.id, personId: ada.id, value: 'YES', confidence: 0.96 },
        { motionId: motion.id, personId: ben.id, value: 'YES', confidence: 0.55 },
        { motionId: motion.id, personId: cio.id, value: 'NO', confidence: 0.91 },
      ],
    });
    await tx.conflictDeclaration.create({
      data: {
        agendaItemId: item.id,
        personId: cio.id,
        statement: '[DEMO] I own a vessel that uses transient moorage.',
        chairRuling: 'recuse',
      },
    });
    await tx.translation.createMany({
      data: [
        {
          entityType: 'Matter',
          entityId: matter.id,
          field: 'summaryEn',
          lang: 'TL',
          text: '[DEMO] Itatakda ng ordinansa ang transient moorage sa 84 cents bawat talampakan bawat araw para sa mga sasakyang-dagat sa Bar Harbor.',
        },
        {
          entityType: 'Matter',
          entityId: matter.id,
          field: 'summaryEn',
          lang: 'ES',
          text: '[DEMO] La ordenanza fijaría el amarre transitorio en 84 centavos por pie al día para las embarcaciones en Bar Harbor.',
        },
      ],
    });
    const seat = await tx.seat.create({
      data: { bodyId: assembly.id, label: '[DEMO] Assembly seat 1', appointmentNotes: '[DEMO] elected' },
    });
    await tx.term.create({
      data: { seatId: seat.id, personId: ada.id, startsOn: new Date('2025-01-01T00:00:00.000Z'), endsOn: new Date('2027-12-31T00:00:00.000Z'), isChair: true },
    });
    const parcel = await tx.parcel.create({
      data: { governmentId: borough.id, parcelNumber: '[DEMO]-PARCEL-1', situsAddress: '[DEMO] 1 Dock Street' },
    });
    await tx.matterParcel.create({ data: { matterId: matter.id, parcelId: parcel.id } });
    return { meetingId: meeting.id, documentId: document.id, boroughId: borough.id, parcelId: parcel.id };
  });
  if (typeof meetingId === 'string') return meetingId;
  await setParcelGeom(meetingId.parcelId, squareWkt(-131.646, 55.342));
  await storeDocumentPages(meetingId.documentId);
  await embedDocument(meetingId.documentId);
  await provisionStaff({
    email: 'clerk.borough@demo.referendum.local',
    name: '[DEMO] Borough Clerk',
    password: 'Demo-password-1',
    totpSecret: 'JBSWY3DPEHPK3PXP',
    memberships: [{ governmentId: meetingId.boroughId, role: 'CLERK' }],
  });
  const inside = await withTenant({ governmentIds: 'all' }, async (tx) => {
    const region = await tx.region.findUniqueOrThrow({ where: { slug: 'ketchikan' } });
    const resident = await tx.resident.create({
      data: { regionId: region.id, email: 'near.demo@referendum.local', phone: '+19075550111' },
    });
    return tx.subscription.create({
      data: {
        residentId: resident.id,
        kind: 'ADDRESS',
        address: '[DEMO] 1 Dock Street',
        radiusFt: 500,
        channels: ['EMAIL'],
        confirmedAt: new Date(),
      },
    });
  });
  await setSubscriptionPoint(inside.id, -131.646, 55.342);
  return meetingId.meetingId;
}

if (process.argv[1] && process.argv[1].endsWith('seed-demo.ts')) {
  seedDemo()
    .then((id) => {
      console.log(`Demo meeting ${id}`);
      console.log('Staff demo login: clerk.borough@demo.referendum.local / Demo-password-1');
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
