import { createHash } from 'node:crypto';
import { embedText, vectorLiteral } from '@referendum/ai';
import { ModuleKey } from '@prisma/client';
import { sectionDiff } from '@referendum/shared';
import { assertCan, assertModule, requireItem, scopeFor, type StaffActor } from './access';
import { writeAudit } from './audit';
import { withTenant, type Tx } from './client';
import { DomainError } from './errors';
import { extractPdfPages, pageChunks, renderPageHtml } from './pdf';
import { enqueue } from './queue';
import { getObject, putObject } from './storage';

export async function addDocument(
  actor: StaffActor,
  input: { agendaItemId?: string; matterId?: string; title: string; kind: string; bytes: Buffer; filename: string },
): Promise<{ id: string }> {
  return withTenant(scopeFor(actor), async (tx) => {
    let governmentId: string | undefined;
    if (input.agendaItemId) {
      const item = await requireItem(tx, input.agendaItemId);
      governmentId = item.meeting.body.governmentId;
      await assertModule(tx, governmentId, ModuleKey.MEETINGS);
      assertCan(actor, 'item.edit', {
        governmentId,
        owns: item.authorUserId === actor.id,
      });
    } else if (input.matterId) {
      const matter = await tx.matter.findUnique({ where: { id: input.matterId } });
      if (!matter) throw new DomainError(404, 'Matter not found');
      governmentId = matter.governmentId;
      assertCan(actor, 'item.edit', { governmentId });
    } else {
      throw new DomainError(400, 'A document needs an item or a matter');
    }
    const version = (await tx.document.count({
      where: {
        kind: input.kind,
        OR: [
          input.agendaItemId ? { agendaItemId: input.agendaItemId } : { id: '__none__' },
          input.matterId ? { matterId: input.matterId } : { id: '__none__' },
        ],
      },
    })) + 1;
    const storageKey = `docs/${createHash('sha256').update(input.bytes).digest('hex').slice(0, 16)}-${input.filename.replace(/[^a-z0-9.]+/gi, '-')}`;
    await putObject(storageKey, input.bytes, 'application/pdf');
    const document = await tx.document.create({
      data: {
        agendaItemId: input.agendaItemId,
        matterId: input.matterId,
        title: input.title,
        kind: input.kind,
        version,
        storageKey,
      },
    });
    await writeAudit(tx, {
      governmentId,
      actorUserId: actor.id,
      action: 'document.create',
      entityType: 'Document',
      entityId: document.id,
      after: { title: input.title, kind: input.kind, version },
    });
    return { id: document.id, matterId: input.matterId ?? null, kind: input.kind, version };
  }).then(async (created) => {
    await enqueue('ingest-document', { documentId: created.id });
    if (created.matterId && created.version > 1) {
      await enqueue('redline', { documentId: created.id });
    }
    return { id: created.id };
  });
}

export async function storeDocumentPages(documentId: string): Promise<number> {
  return withTenant({ governmentIds: 'all' }, async (tx) => {
    const document = await tx.document.findUnique({ where: { id: documentId } });
    if (!document) throw new DomainError(404, 'Document not found');
    const bytes = await getObject(document.storageKey);
    const extracted = await extractPdfPages(bytes);
    const ocrUsed = extracted.some((page) => page.text.trim().length === 0);
    await tx.documentChunk.deleteMany({ where: { page: { documentId } } });
    await tx.documentPage.deleteMany({ where: { documentId } });
    for (const page of extracted) {
      await tx.documentPage.create({
        data: {
          documentId,
          pageNumber: page.pageNumber,
          text: page.text,
          html: renderPageHtml(document.title, page.pageNumber, page.text),
        },
      });
    }
    await tx.document.update({
      where: { id: documentId },
      data: {
        pageCount: extracted.length,
        ocrUsed,
        accessible: extracted.length > 0 && !ocrUsed,
      },
    });
    return extracted.length;
  });
}

export async function embedDocument(documentId: string): Promise<number> {
  return withTenant({ governmentIds: 'all' }, async (tx) => {
    const pages = await tx.documentPage.findMany({
      where: { documentId },
      orderBy: { pageNumber: 'asc' },
    });
    let count = 0;
    for (const page of pages) {
      await tx.documentChunk.deleteMany({ where: { pageId: page.id } });
      const chunks = pageChunks(page.text);
      for (let ordinal = 0; ordinal < chunks.length; ordinal += 1) {
        const text = chunks[ordinal] ?? '';
        const chunk = await tx.documentChunk.create({
          data: { pageId: page.id, ordinal, text },
        });
        const literal = vectorLiteral(embedText(text));
        await tx.$executeRawUnsafe(
          'UPDATE "DocumentChunk" SET embedding = $1::vector WHERE id = $2',
          literal,
          chunk.id,
        );
        count += 1;
      }
    }
    return count;
  });
}

export async function buildRedline(documentId: string): Promise<void> {
  await withTenant({ governmentIds: 'all' }, async (tx) => {
    const document = await tx.document.findUnique({ where: { id: documentId } });
    if (!document?.matterId || document.version < 2) return;
    const previous = await tx.document.findFirst({
      where: {
        matterId: document.matterId,
        kind: document.kind,
        version: { lt: document.version },
      },
      orderBy: { version: 'desc' },
      include: { pages: { orderBy: { pageNumber: 'asc' } } },
    });
    const current = await tx.document.findUnique({
      where: { id: documentId },
      include: { pages: { orderBy: { pageNumber: 'asc' } } },
    });
    if (!previous || !current) return;
    const diff = sectionDiff(
      previous.pages.map((page) => page.text).join('\n\n'),
      current.pages.map((page) => page.text).join('\n\n'),
    );
    await tx.redline.create({
      data: {
        matterId: document.matterId,
        fromDocumentId: previous.id,
        toDocumentId: current.id,
        diffJson: diff,
      },
    });
  });
}

export async function readPage(documentId: string, pageNumber: number) {
  return withTenant({ governmentIds: 'all' }, async (tx) => {
    const page = await tx.documentPage.findUnique({
      where: { documentId_pageNumber: { documentId, pageNumber } },
      include: { document: { include: { agendaItem: { include: { meeting: true } } } } },
    });
    if (!page) throw new DomainError(404, 'Page not found');
    const meeting = page.document.agendaItem?.meeting;
    if (meeting && meeting.status === 'DRAFT') throw new DomainError(404, 'Page not found');
    return page;
  });
}

export async function documentBelongsToVisibleItem(tx: Tx, documentId: string): Promise<boolean> {
  const document = await tx.document.findUnique({ where: { id: documentId } });
  return Boolean(document);
}
