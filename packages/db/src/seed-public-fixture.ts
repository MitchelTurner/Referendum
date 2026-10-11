import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { renderPageHtml } from './pdf';
import { seedFoundation } from './seed';
import { withTenant } from './client';

const LOCATION = '[E2E] Assembly chambers';

async function main() {
  await seedFoundation();
  const itemId = await withTenant({ governmentIds: 'all' }, async (tx) => {
    const borough = await tx.government.findFirstOrThrow({ where: { shortName: 'Borough' } });
    const assembly = await tx.body.findFirstOrThrow({ where: { governmentId: borough.id, code: 'ASM' } });
    const existing = await tx.meeting.findFirst({ where: { location: LOCATION }, include: { items: true } });
    if (existing?.items[0]) return existing.items[0].id;
    const matter = await tx.matter.create({
      data: {
        governmentId: borough.id,
        title: '[DEMO] Fixture moorage item',
        caseNumber: '[DEMO]-E2E',
        kind: 'ordinance',
        summaryEn: 'This [DEMO] summary is waiting for staff approval.',
      },
    });
    const meeting = await tx.meeting.create({
      data: {
        bodyId: assembly.id,
        startsAt: new Date('2026-11-02T02:00:00.000Z'),
        location: LOCATION,
        status: 'PACKET_PUBLISHED',
        noticePostedAt: new Date('2026-10-01T16:00:00.000Z'),
        packetPublishedAt: new Date('2026-10-20T16:00:00.000Z'),
      },
    });
    const item = await tx.agendaItem.create({
      data: {
        meetingId: meeting.id,
        matterId: matter.id,
        position: '8.a',
        sortKey: 1,
        type: 'PUBLIC_HEARING',
        title: '[DEMO] Fixture moorage item',
        status: 'PUBLISHED',
        commentsCloseAt: new Date('2027-01-01T00:00:00.000Z'),
        testimonyOpen: true,
      },
    });
    const html = renderPageHtml('Staff report', 1, 'The [DEMO] rate is 84 cents per foot.');
    const document = await tx.document.create({
      data: {
        agendaItemId: item.id,
        matterId: matter.id,
        title: 'Staff report',
        kind: 'staff_report',
        storageKey: 'e2e/staff-report.html',
        pageCount: 1,
        accessible: true,
      },
    });
    await tx.documentPage.create({
      data: { documentId: document.id, pageNumber: 1, html, text: 'The [DEMO] rate is 84 cents per foot.' },
    });
    await tx.matterEvent.create({
      data: { matterId: matter.id, label: 'Assembly hearing', meetingId: meeting.id, occurredAt: meeting.startsAt, order: 1 },
    });
    return item.id;
  });
  const file = path.resolve('/tmp/referendum-e2e-item-id');
  writeFileSync(file, itemId);
  console.log(itemId);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
