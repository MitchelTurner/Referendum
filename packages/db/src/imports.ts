import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ModuleKey, type ItemType } from '@prisma/client';
import { assertCan, assertModule, scopeFor, type StaffActor } from './access';
import { writeAudit } from './audit';
import { withTenant } from './client';
import { DomainError } from './errors';
import { putObject } from './storage';
import { enqueue } from './queue';

type ArchiveDocument = { title: string; kind: string; text: string };
type ArchiveItem = { position: string; title: string; type: ItemType; documents: ArchiveDocument[] };
type ArchiveMeeting = { bodyCode: string; startsAt: string; location?: string; items: ArchiveItem[] };

export interface ArchiveAdapter {
  readonly source: string;
  load(fixturePath: string): Promise<ArchiveMeeting[]>;
}

class JsonArchiveAdapter implements ArchiveAdapter {
  constructor(readonly source: string) {}
  async load(fixturePath: string): Promise<ArchiveMeeting[]> {
    const raw = await readFile(fixturePath, 'utf8');
    const parsed = JSON.parse(raw) as { meetings: ArchiveMeeting[] };
    return parsed.meetings;
  }
}

const adapters: Record<string, ArchiveAdapter> = {
  primegov: new JsonArchiveAdapter('primegov'),
  civicplus_agendacenter: new JsonArchiveAdapter('civicplus_agendacenter'),
  pdf_folder: new JsonArchiveAdapter('pdf_folder'),
};

export function fixturePath(name?: string): string {
  return name
    ? path.resolve(name)
    : path.resolve(__dirname, '../fixtures/archive/sample.json');
}

export async function startImport(actor: StaffActor, input: { governmentId: string; source: string; fixture?: string }) {
  const job = await withTenant(scopeFor(actor), async (tx) => {
    await assertModule(tx, input.governmentId, ModuleKey.MEETINGS);
    assertCan(actor, 'government.configure', { governmentId: input.governmentId });
    if (!adapters[input.source]) throw new DomainError(400, 'Unknown import source');
    const created = await tx.importJob.create({
      data: { governmentId: input.governmentId, source: input.source, status: 'queued' },
    });
    await writeAudit(tx, {
      governmentId: input.governmentId,
      actorUserId: actor.id,
      action: 'import.start',
      entityType: 'ImportJob',
      entityId: created.id,
      after: { source: input.source },
    });
    return created;
  });
  await enqueue('archive-import', { jobId: job.id, fixture: input.fixture ?? fixturePath() });
  return job;
}

export async function runImport(jobId: string, fixture: string): Promise<void> {
  const job = await withTenant({ governmentIds: 'all' }, async (tx) => tx.importJob.findUnique({ where: { id: jobId } }));
  if (!job) throw new DomainError(404, 'Import job not found');
  const adapter = adapters[job.source];
  if (!adapter) throw new DomainError(400, 'Unknown import source');
  await withTenant({ governmentIds: 'all' }, async (tx) => {
    await tx.importJob.update({ where: { id: jobId }, data: { status: 'running' } });
  });
  try {
    const meetings = await adapter.load(fixture);
    let meetingCount = 0;
    const documentIds: string[] = [];
    await withTenant({ governmentIds: 'all' }, async (tx) => {
      for (const meeting of meetings) {
        const body = await tx.body.findFirst({
          where: { governmentId: job.governmentId, code: meeting.bodyCode },
        });
        if (!body) throw new DomainError(400, `No body with code ${meeting.bodyCode}`);
        const created = await tx.meeting.create({
          data: {
            bodyId: body.id,
            startsAt: new Date(meeting.startsAt),
            location: meeting.location ?? '[DEMO] imported archive',
            status: 'PACKET_PUBLISHED',
            packetPublishedAt: new Date(),
            noticePostedAt: new Date(new Date(meeting.startsAt).getTime() - 14 * 24 * 60 * 60 * 1000),
          },
        });
        meetingCount += 1;
        let sort = 0;
        for (const item of meeting.items) {
          sort += 1;
          const agenda = await tx.agendaItem.create({
            data: {
              meetingId: created.id,
              position: item.position,
              sortKey: sort,
              type: item.type,
              title: item.title,
              status: 'PUBLISHED',
            },
          });
          for (const document of item.documents) {
            const storageKey = `imports/${job.id}/${agenda.id}-${document.kind}.txt`;
            await putObject(storageKey, Buffer.from(document.text, 'utf8'), 'text/plain');
            const row = await tx.document.create({
              data: {
                agendaItemId: agenda.id,
                title: document.title,
                kind: document.kind,
                storageKey,
              },
            });
            documentIds.push(row.id);
          }
        }
      }
      await tx.importJob.update({
        where: { id: jobId },
        data: { status: 'done', stats: { meetings: meetingCount, documents: documentIds.length } },
      });
    });
    for (const documentId of documentIds) {
      await enqueue('ingest-document', { documentId });
    }
  } catch (error) {
    await withTenant({ governmentIds: 'all' }, async (tx) => {
      await tx.importJob.update({
        where: { id: jobId },
        data: { status: 'failed', error: error instanceof Error ? error.message : 'Import failed' },
      });
    });
    throw error;
  }
}

export async function listImports(actor: StaffActor) {
  return withTenant(scopeFor(actor), async (tx) => tx.importJob.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }));
}
