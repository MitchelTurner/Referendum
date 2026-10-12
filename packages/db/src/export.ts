import JSZip from 'jszip';
import { assertCan, scopeFor, type StaffActor } from './access';
import { writeAudit } from './audit';
import { withTenant } from './client';
import { getObject } from './storage';

export async function exportGovernment(actor: StaffActor, governmentId: string): Promise<Buffer> {
  const payload = await withTenant(scopeFor(actor), async (tx) => {
    assertCan(actor, 'data.export', { governmentId });
    const government = await tx.government.findUnique({
      where: { id: governmentId },
      include: {
        bodies: { include: { meetings: { include: { items: { include: { documents: true, comments: true, motions: { include: { votes: true } } } } } } } },
        matters: { include: { events: true } },
        noticeRules: true,
        modules: true,
        recordsRule: true,
        recordsRequests: { include: { releases: true } },
      },
    });
    const audit = await tx.auditLog.findMany({ where: { governmentId }, take: 1000 });
    await writeAudit(tx, {
      governmentId,
      actorUserId: actor.id,
      action: 'data.export',
      entityType: 'Government',
      entityId: governmentId,
    });
    return { government, audit };
  });
  const zip = new JSZip();
  zip.file('government.json', JSON.stringify(payload, null, 2));
  const documents = payload.government?.bodies.flatMap((body) => body.meetings.flatMap((meeting) => meeting.items.flatMap((item) => item.documents))) ?? [];
  for (const document of documents) {
    try {
      const bytes = await getObject(document.storageKey);
      zip.file(`files/${document.storageKey}`, bytes);
    } catch {
      zip.file(`files/${document.storageKey}.missing.txt`, 'Original file was not in storage.');
    }
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}
