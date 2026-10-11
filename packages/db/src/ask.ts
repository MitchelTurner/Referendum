import { answerQuestion, embedText, vectorLiteral, type Excerpt } from '@referendum/ai';
import { normalizeQuestion, scrubPii } from '@referendum/shared';
import { writeAudit } from './audit';
import { withTenant } from './client';
import { DomainError } from './errors';
import { rateLimit } from './redis';

type Hit = {
  id: string;
  text: string;
  pageId: string;
  pageNumber: number;
  documentTitle: string;
  score: number;
};

function overlap(question: string, text: string): number {
  const tokens = question.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 3);
  const hay = text.toLowerCase();
  return tokens.filter((token) => hay.includes(token)).length;
}

export async function askPackets(input: {
  regionSlug: string;
  question: string;
  matterId?: string;
  ip: string;
}): Promise<{
  answer: string;
  citations: { pageId: string; documentTitle: string; pageNumber: number; quote: string }[];
  answered: boolean;
}> {
  const allowed = await rateLimit(`ask:${input.ip}`, 20, 600);
  if (!allowed) throw new DomainError(429, 'Too many questions');
  const question = scrubPii(input.question.trim());
  const started = Date.now();
  const region = await withTenant({ governmentIds: 'all' }, async (tx) =>
    tx.region.findUnique({ where: { slug: input.regionSlug }, include: { governments: { include: { modules: true } } } }),
  );
  if (!region) throw new DomainError(404, 'Region not found');
  const enabledIds = region.governments
    .filter((government) => government.modules.some((mod) => mod.module === 'ASK' && mod.enabled))
    .map((government) => government.id);
  if (enabledIds.length === 0) throw new DomainError(404, 'Module is not enabled');
  return withTenant({ governmentIds: enabledIds }, async (tx) => {
    const cacheKey = `${region.id}:${input.matterId ?? ''}:${normalizeQuestion(question)}`;
    const cached = await tx.askCache.findUnique({ where: { cacheKey } });
    if (cached && cached.expiresAt > new Date()) {
      return cached.response as {
        answer: string;
        citations: { pageId: string; documentTitle: string; pageNumber: number; quote: string }[];
        answered: boolean;
      };
    }
    const ids = region.governments.map((government) => government.id).join(',');
    const literal = vectorLiteral(embedText(question));
    const vectorHits = await tx.$queryRawUnsafe<Hit[]>(
      `SELECT c.id, c.text, c."pageId" AS "pageId", p."pageNumber" AS "pageNumber",
              d.title AS "documentTitle",
              (1 - (c.embedding <=> $1::vector))::float AS score
       FROM "DocumentChunk" c
       JOIN "DocumentPage" p ON p.id = c."pageId"
       JOIN "Document" d ON d.id = p."documentId"
       LEFT JOIN "AgendaItem" i ON i.id = d."agendaItemId"
       LEFT JOIN "Matter" m ON m.id = COALESCE(d."matterId", i."matterId")
       LEFT JOIN "Meeting" mt ON mt.id = i."meetingId"
       LEFT JOIN "Body" b ON b.id = mt."bodyId"
       WHERE c.embedding IS NOT NULL
         AND (
           ($2::text IS NOT NULL AND m.id = $2)
           OR (
             $2::text IS NULL
             AND (m."governmentId" = ANY (string_to_array($3, ',')) OR b."governmentId" = ANY (string_to_array($3, ',')))
             AND (mt."startsAt" IS NULL OR mt."startsAt" > NOW() - INTERVAL '24 months')
           )
         )
       ORDER BY c.embedding <=> $1::vector
       LIMIT 12`,
      literal,
      input.matterId ?? null,
      ids,
    );
    const lexical = await tx.$queryRawUnsafe<Hit[]>(
      `SELECT c.id, c.text, c."pageId" AS "pageId", p."pageNumber" AS "pageNumber",
              d.title AS "documentTitle", 0::float AS score
       FROM "DocumentChunk" c
       JOIN "DocumentPage" p ON p.id = c."pageId"
       JOIN "Document" d ON d.id = p."documentId"
       LEFT JOIN "AgendaItem" i ON i.id = d."agendaItemId"
       LEFT JOIN "Matter" m ON m.id = COALESCE(d."matterId", i."matterId")
       LEFT JOIN "Meeting" mt ON mt.id = i."meetingId"
       LEFT JOIN "Body" b ON b.id = mt."bodyId"
       WHERE c.text ILIKE '%' || $1 || '%'
         AND (
           ($2::text IS NOT NULL AND m.id = $2)
           OR (
             $2::text IS NULL
             AND (m."governmentId" = ANY (string_to_array($3, ',')) OR b."governmentId" = ANY (string_to_array($3, ',')))
           )
         )
       LIMIT 12`,
      question.split(/\s+/).find((token) => token.length > 5)?.replace(/[^a-z0-9]/gi, '') ?? '____',
      input.matterId ?? null,
      ids,
    );
    const hits = [...vectorHits];
    for (const row of lexical) {
      if (!hits.some((hit) => hit.id === row.id)) hits.push(row);
    }
    const reranked = [...hits]
      .sort((a, b) => overlap(question, b.text) - overlap(question, a.text) || Number(b.score) - Number(a.score))
      .slice(0, 6);
    const excerpts: Excerpt[] = reranked.map((hit, index) => ({
      index,
      text: hit.text,
      pageId: hit.pageId,
      documentTitle: hit.documentTitle,
      pageNumber: Number(hit.pageNumber),
    }));
    const { output, call } = await answerQuestion(question, excerpts);
    const citations = output.citations.map((citation) => {
      const excerpt = excerpts[citation.excerptIndex];
      return {
        pageId: excerpt?.pageId ?? '',
        documentTitle: excerpt?.documentTitle ?? '',
        pageNumber: excerpt?.pageNumber ?? 0,
        quote: citation.quote,
      };
    });
    const response = { answer: output.answer, citations, answered: output.answered };
    await tx.askQuery.create({
      data: {
        regionId: region.id,
        matterId: input.matterId,
        question,
        answer: output.answer,
        citedPageIds: citations.map((citation) => citation.pageId).filter(Boolean),
        answered: output.answered,
        latencyMs: Date.now() - started,
      },
    });
    await tx.aiAudit.create({
      data: {
        requestId: cacheKey,
        feature: call.feature,
        model: call.model,
        promptText: call.promptText,
        outputText: call.outputText,
        inputTokens: call.inputTokens,
        outputTokens: call.outputTokens,
      },
    });
    await tx.askCache.upsert({
      where: { cacheKey },
      update: { response, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
      create: { cacheKey, matterId: input.matterId, response, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });
    await writeAudit(tx, {
      governmentId: enabledIds[0],
      action: 'ask.query',
      entityType: 'AskQuery',
      entityId: cacheKey,
      after: { answered: output.answered },
    });
    return response;
  });
}

export async function askInsights(actorGovernmentIds: string[], from?: Date, to?: Date) {
  return withTenant({ governmentIds: actorGovernmentIds }, async (tx) => {
    const governments = await tx.government.findMany({
      where: { id: { in: actorGovernmentIds } },
      select: { regionId: true },
    });
    const regionIds = [...new Set(governments.map((government) => government.regionId))];
    const queries = await tx.askQuery.findMany({
      where: {
        regionId: { in: regionIds },
        createdAt: {
          gte: from,
          lte: to,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const counts = new Map<string, { question: string; count: number; answered: boolean }>();
    for (const query of queries) {
      const key = normalizeQuestion(query.question);
      const row = counts.get(key) ?? { question: query.question, count: 0, answered: query.answered };
      row.count += 1;
      row.answered = row.answered && query.answered;
      counts.set(key, row);
    }
    const ranked = [...counts.values()].sort((a, b) => b.count - a.count);
    return {
      top: ranked.slice(0, 20),
      unanswered: queries.filter((query) => !query.answered).slice(0, 50),
    };
  });
}
