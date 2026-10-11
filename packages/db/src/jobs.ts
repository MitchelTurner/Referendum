import { summarizeReport, translateSummary } from '@referendum/ai';
import { STAFF_REPORT_LEAD_DAYS, REVIEW_SLA_DAYS } from '@referendum/shared';
import { buildRedline, embedDocument, storeDocumentPages } from './documents';
import { runImport } from './imports';
import { runDraftMinutes } from './minutes';
import { deliverSend, fanoutMeeting, notifySpeakerTwoAway, weeklyDigest } from './notify';
import { registerHandler } from './queue';
import { withTenant } from './client';
import { writeAudit } from './audit';

export function registerJobHandlers(): void {
  registerHandler('ingest-document', async (data) => {
    await storeDocumentPages(data.documentId ?? '');
    const { enqueue } = await import('./queue');
    await enqueue('embed-pages', { documentId: data.documentId ?? '' });
  });
  registerHandler('embed-pages', async (data) => {
    await embedDocument(data.documentId ?? '');
  });
  registerHandler('summarize-matter', async (data) => {
    await summarizeMatter(data.matterId ?? '');
  });
  registerHandler('redline', async (data) => {
    await buildRedline(data.documentId ?? '');
  });
  registerHandler('notify-fanout', async (data) => {
    if (data.meetingId) await fanoutMeeting(data.meetingId, data.event ?? 'updated');
  });
  registerHandler('send', async (data) => {
    await deliverSend({
      channel: data.channel ?? 'EMAIL',
      destination: data.destination ?? '',
      subject: data.subject,
      body: data.body ?? '',
      idempotencyKey: data.idempotencyKey ?? `${data.destination}:${Date.now()}`,
      governmentId: data.governmentId,
    });
  });
  registerHandler('speaker-two-away', async (data) => {
    await notifySpeakerTwoAway(data.speakerId ?? '');
  });
  registerHandler('weekly-digest', async () => {
    await weeklyDigest();
  });
  registerHandler('transcribe', async (data) => {
    if (data.meetingId && data.transcript) await runDraftMinutes(data.meetingId, data.transcript);
  });
  registerHandler('draft-minutes', async (data) => {
    if (data.meetingId && data.transcript) await runDraftMinutes(data.meetingId, data.transcript);
  });
  registerHandler('review-reminder', async () => {
    await remindReviewers();
  });
  registerHandler('archive-import', async (data) => {
    await runImport(data.jobId ?? '', data.fixture ?? '');
  });
  registerHandler('retention-scan', async () => {
    await retentionScan();
  });
}

async function summarizeMatter(matterId: string): Promise<void> {
  const report = await withTenant({ governmentIds: 'all' }, async (tx) => {
    const matter = await tx.matter.findUnique({
      where: { id: matterId },
      include: { documents: { include: { pages: true } }, items: { include: { documents: { include: { pages: true } } } } },
    });
    if (!matter) return null;
    const docs = [...matter.documents, ...matter.items.flatMap((item) => item.documents)].filter((doc) => doc.kind === 'staff_report');
    const text = docs.flatMap((doc) => doc.pages.map((page) => page.text)).join('\n');
    return { governmentId: matter.governmentId, text };
  });
  if (!report?.text.trim()) return;
  const { summary, call } = await summarizeReport(report.text);
  await withTenant({ governmentIds: 'all' }, async (tx) => {
    await tx.matter.update({
      where: { id: matterId },
      data: { summaryEn: summary, summaryApprovedByUserId: null },
    });
    await tx.aiAudit.create({
      data: {
        requestId: `summary:${matterId}`,
        governmentId: report.governmentId,
        feature: call.feature,
        model: call.model,
        promptText: call.promptText,
        outputText: call.outputText,
      },
    });
    for (const lang of ['TL', 'ES'] as const) {
      const translated = await translateSummary(summary, lang);
      if (!translated) continue;
      await tx.translation.upsert({
        where: { entityType_entityId_field_lang: { entityType: 'Matter', entityId: matterId, field: 'summaryEn', lang } },
        update: { text: translated.text, reviewedByUserId: null },
        create: { entityType: 'Matter', entityId: matterId, field: 'summaryEn', lang, text: translated.text },
      });
    }
  });
}

async function remindReviewers(): Promise<void> {
  const cutoff = new Date(Date.now() - REVIEW_SLA_DAYS * 24 * 60 * 60 * 1000);
  const steps = await withTenant({ governmentIds: 'all' }, async (tx) => {
    return tx.reviewStep.findMany({
      where: { status: { in: ['PENDING', 'IN_PROGRESS'] }, receivedAt: { lt: cutoff } },
      include: { assignee: true, agendaItem: true },
    });
  });
  const { enqueue } = await import('./queue');
  for (const step of steps) {
    if (!step.assignee?.email) continue;
    await enqueue('send', {
      channel: 'EMAIL',
      destination: step.assignee.email,
      subject: 'Review still waiting',
      body: `${step.agendaItem.title} has been in ${step.roleLabel} review past the working SLA of ${REVIEW_SLA_DAYS} days.`,
      idempotencyKey: `reminder:${step.id}:${new Date().toISOString().slice(0, 10)}`,
      governmentId: '',
    });
  }
}

async function retentionScan(): Promise<void> {
  await withTenant({ governmentIds: 'all' }, async (tx) => {
    const rules = await tx.retentionRule.findMany();
    for (const rule of rules) {
      if (rule.retainYears == null) {
        await writeAudit(tx, {
          governmentId: rule.governmentId,
          action: 'retention.unconfigured',
          entityType: 'RetentionRule',
          entityId: rule.id,
          after: { documentKind: rule.documentKind },
        });
        continue;
      }
      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - rule.retainYears);
      const documents = await tx.document.findMany({
        where: {
          kind: rule.documentKind,
          createdAt: { lt: cutoff },
          OR: [
            { matter: { governmentId: rule.governmentId } },
            { agendaItem: { meeting: { body: { governmentId: rule.governmentId } } } },
          ],
        },
      });
      for (const document of documents) {
        await writeAudit(tx, {
          governmentId: rule.governmentId,
          action: 'retention.due',
          entityType: 'Document',
          entityId: document.id,
          after: { kind: document.kind },
        });
      }
    }
  });
}

export async function complianceSnapshot(governmentIds: string[]) {
  return withTenant({ governmentIds }, async (tx) => {
    const documents = await tx.document.findMany({
      where: { OR: [{ accessible: false }, { ocrUsed: true }] },
      select: { id: true, title: true, kind: true, accessible: true, ocrUsed: true, pageCount: true },
      take: 100,
    });
    const rules = await tx.retentionRule.findMany();
    const translations = await tx.translation.findMany({ where: { reviewedByUserId: null }, take: 100 });
    return {
      documents,
      retention: rules.map((rule) => ({
        id: rule.id,
        documentKind: rule.documentKind,
        retainYears: rule.retainYears,
        citation: rule.citation,
        configured: rule.retainYears != null,
      })),
      translations: translations.map((row) => ({
        id: row.id,
        lang: row.lang,
        entityType: row.entityType,
        entityId: row.entityId,
        automated: true,
      })),
      staffReportLeadDays: STAFF_REPORT_LEAD_DAYS,
      embedSnippet: '<script type="module" src="/embed/v1/referendum.js"></script>\n<ref-calendar region="ketchikan"></ref-calendar>',
    };
  });
}

