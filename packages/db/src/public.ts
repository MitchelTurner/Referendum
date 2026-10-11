import { chartLabel, isPublicMeetingStatus, moduleActive } from '@referendum/shared';
import { withTenant } from './client';
import { DomainError } from './errors';
import { getTimer } from './live';

async function regionGovernments(slug: string) {
  return withTenant({ governmentIds: 'all' }, async (tx) => {
    const region = await tx.region.findUnique({
      where: { slug },
      include: { governments: { include: { modules: true, bodies: true } } },
    });
    if (!region) throw new DomainError(404, 'Region not found');
    return region;
  });
}

export async function getRegion(slug = 'ketchikan') {
  const region = await regionGovernments(slug);
  return {
    id: region.id,
    name: region.name,
    slug: region.slug,
    governments: region.governments.map((government) => ({
      id: government.id,
      name: government.name,
      shortName: government.shortName,
      colorToken: government.colorToken,
      modules: government.modules.filter((mod) => moduleActive(mod)).map((mod) => mod.module),
      bodies: government.bodies.map((body) => ({
        id: body.id,
        name: body.name,
        code: body.code,
      })),
    })),
  };
}

export async function publicCalendar(query: { from?: Date; to?: Date; governmentIds?: string[]; q?: string }) {
  const region = await regionGovernments('ketchikan');
  const enabled = new Set(
    region.governments
      .filter((government) => government.modules.some((mod) => mod.module === 'MEETINGS' && moduleActive(mod)))
      .map((government) => government.id),
  );
  const ids = (query.governmentIds?.length ? query.governmentIds : [...enabled]).filter((id) => enabled.has(id));
  return withTenant({ governmentIds: ids }, async (tx) => {
    const meetings = await tx.meeting.findMany({
      where: {
        startsAt: {
          gte: query.from,
          lte: query.to,
        },
        status: { not: 'DRAFT' },
        body: { governmentId: { in: ids } },
        OR: query.q
          ? [
              { location: { contains: query.q, mode: 'insensitive' } },
              { items: { some: { title: { contains: query.q, mode: 'insensitive' } } } },
              { body: { name: { contains: query.q, mode: 'insensitive' } } },
            ]
          : undefined,
      },
      include: { body: { include: { government: true } }, items: { select: { id: true, title: true, status: true } } },
      orderBy: { startsAt: 'asc' },
    });
    return meetings
      .filter((meeting) => isPublicMeetingStatus(meeting.status))
      .map((meeting) => ({
        id: meeting.id,
        startsAt: meeting.startsAt.toISOString(),
        location: meeting.location,
        status: meeting.status,
        label: chartLabel(meeting.body.code, meeting.startsAt, meeting.body.government.timezone),
        body: { id: meeting.body.id, name: meeting.body.name, code: meeting.body.code },
        government: {
          id: meeting.body.government.id,
          name: meeting.body.government.name,
          shortName: meeting.body.government.shortName,
          colorToken: meeting.body.government.colorToken,
        },
        itemCount: meeting.items.length,
      }));
  });
}

export async function publicMeeting(id: string) {
  const region = await getRegion();
  const ids = region.governments.map((government) => government.id);
  return withTenant({ governmentIds: ids }, async (tx) => {
    const meeting = await tx.meeting.findUnique({
      where: { id },
      include: {
        body: { include: { government: true } },
        items: { orderBy: { sortKey: 'asc' } },
      },
    });
    if (!meeting || !isPublicMeetingStatus(meeting.status)) throw new DomainError(404, 'Meeting not found');
    return {
      id: meeting.id,
      startsAt: meeting.startsAt.toISOString(),
      location: meeting.location,
      status: meeting.status,
      label: chartLabel(meeting.body.code, meeting.startsAt, meeting.body.government.timezone),
      noticePostedAt: meeting.noticePostedAt?.toISOString() ?? null,
      packetPublishedAt: meeting.packetPublishedAt?.toISOString() ?? null,
      videoProvider: meeting.videoProvider,
      videoRef: meeting.videoRef,
      currentItemId: meeting.status === 'IN_PROGRESS' || meeting.status === 'RECESSED' ? meeting.currentItemId : null,
      body: { id: meeting.body.id, name: meeting.body.name, code: meeting.body.code },
      government: {
        id: meeting.body.government.id,
        name: meeting.body.government.name,
        shortName: meeting.body.government.shortName,
        colorToken: meeting.body.government.colorToken,
      },
      items: meeting.items.map((item) => ({
        id: item.id,
        position: item.position,
        title: item.title,
        type: item.type,
        status: item.status,
        matterId: item.matterId,
      })),
    };
  });
}

export async function publicItem(id: string) {
  const region = await getRegion();
  const ids = region.governments.map((government) => government.id);
  return withTenant({ governmentIds: ids }, async (tx) => {
    const item = await tx.agendaItem.findUnique({
      where: { id },
      include: {
        meeting: { include: { body: { include: { government: true } } } },
        matter: {
          include: {
            events: { orderBy: { order: 'asc' }, include: { body: true } },
            parcels: { include: { parcel: true } },
            redlines: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
        documents: { include: { pages: { orderBy: { pageNumber: 'asc' }, select: { id: true, pageNumber: true, text: true } } } },
        comments: { where: { hidden: false, publishedAt: { not: null } }, orderBy: { receivedAt: 'asc' } },
        motions: {
          where: { acceptedByUserId: { not: null } },
          include: { votes: { include: { person: true } }, mover: true, seconder: true },
        },
        conflicts: { include: { person: true }, orderBy: { declaredAt: 'asc' } },
        speakers: { orderBy: { queuePosition: 'asc' } },
      },
    });
    if (!item || !isPublicMeetingStatus(item.meeting.status)) throw new DomainError(404, 'Item not found');
    const translations = item.matter
      ? await tx.translation.findMany({
          where: { entityType: 'Matter', entityId: item.matter.id, field: 'summaryEn' },
        })
      : [];
    return {
      id: item.id,
      position: item.position,
      title: item.title,
      type: item.type,
      status: item.status,
      commentsCloseAt: item.commentsCloseAt?.toISOString() ?? null,
      testimonyOpen: item.testimonyOpen,
      videoOffsetSec: item.videoOffsetSec,
      meeting: {
        id: item.meeting.id,
        startsAt: item.meeting.startsAt.toISOString(),
        status: item.meeting.status,
        location: item.meeting.location,
        videoProvider: item.meeting.videoProvider,
        videoRef: item.meeting.videoRef,
        currentItemId: item.meeting.currentItemId,
        label: chartLabel(item.meeting.body.code, item.meeting.startsAt, item.meeting.body.government.timezone),
        body: { name: item.meeting.body.name, code: item.meeting.body.code },
        government: {
          id: item.meeting.body.government.id,
          name: item.meeting.body.government.name,
          shortName: item.meeting.body.government.shortName,
          colorToken: item.meeting.body.government.colorToken,
        },
      },
      matter: item.matter
        ? {
            id: item.matter.id,
            title: item.matter.title,
            caseNumber: item.matter.caseNumber,
            kind: item.matter.kind,
            summaryEn: item.matter.summaryApprovedByUserId ? item.matter.summaryEn : null,
            summaryAutomated: Boolean(item.matter.summaryEn),
            events: item.matter.events.map((event) => ({
              id: event.id,
              label: event.label,
              occurredAt: event.occurredAt?.toISOString() ?? null,
              projectedFor: event.projectedFor?.toISOString() ?? null,
              order: event.order,
              bodyCode: event.body?.code ?? null,
            })),
            parcels: item.matter.parcels.map((link) => ({
              id: link.parcel.id,
              parcelNumber: link.parcel.parcelNumber,
              situsAddress: link.parcel.situsAddress,
            })),
            redline: item.matter.redlines[0]
              ? { id: item.matter.redlines[0].id, diff: item.matter.redlines[0].diffJson }
              : null,
          }
        : null,
      translations: translations.map((translation) => ({
        lang: translation.lang,
        text: translation.text,
        automated: translation.reviewedByUserId == null,
      })),
      documents: item.documents.map((document) => ({
        id: document.id,
        title: document.title,
        kind: document.kind,
        version: document.version,
        pageCount: document.pageCount,
        accessible: document.accessible,
        ocrUsed: document.ocrUsed,
        pages: document.pages.map((page) => ({ id: page.id, pageNumber: page.pageNumber })),
      })),
      comments: item.comments.map((comment) => ({
        id: comment.id,
        name: comment.name,
        position: comment.position,
        body: comment.body,
        receivedAt: comment.receivedAt.toISOString(),
      })),
      motions: item.motions.map((motion) => ({
        id: motion.id,
        text: motion.text,
        result: motion.result,
        mover: motion.mover?.fullName ?? null,
        seconder: motion.seconder?.fullName ?? null,
        votes: motion.votes.map((vote) => ({ person: vote.person.fullName, value: vote.value })),
      })),
      conflicts: item.conflicts.map((conflict) => ({
        id: conflict.id,
        person: conflict.person.fullName,
        statement: conflict.statement,
        chairRuling: conflict.chairRuling,
        declaredAt: conflict.declaredAt.toISOString(),
      })),
      speakerCount: item.speakers.length,
    };
  });
}

export async function publicMatter(id: string) {
  const region = await getRegion();
  return withTenant({ governmentIds: region.governments.map((government) => government.id) }, async (tx) => {
    const matter = await tx.matter.findUnique({
      where: { id },
      include: {
        government: true,
        events: { orderBy: { order: 'asc' }, include: { body: true, meeting: true } },
        items: { include: { meeting: { include: { body: true } } } },
      },
    });
    if (!matter) throw new DomainError(404, 'Matter not found');
    return {
      id: matter.id,
      title: matter.title,
      caseNumber: matter.caseNumber,
      kind: matter.kind,
      summaryEn: matter.summaryApprovedByUserId ? matter.summaryEn : null,
      government: {
        name: matter.government.name,
        shortName: matter.government.shortName,
        colorToken: matter.government.colorToken,
      },
      events: matter.events.map((event) => ({
        id: event.id,
        label: event.label,
        occurredAt: event.occurredAt?.toISOString() ?? null,
        projectedFor: event.projectedFor?.toISOString() ?? null,
        order: event.order,
        bodyName: event.body?.name ?? null,
      })),
      items: matter.items
        .filter((item) => isPublicMeetingStatus(item.meeting.status))
        .map((item) => ({
          id: item.id,
          title: item.title,
          position: item.position,
          meetingId: item.meetingId,
          label: chartLabel(item.meeting.body.code, item.meeting.startsAt),
        })),
    };
  });
}

export async function publicLive() {
  const region = await getRegion();
  const ids = region.governments.map((government) => government.id);
  const meetings = await withTenant({ governmentIds: ids }, async (tx) =>
    tx.meeting.findMany({
      where: { status: { in: ['IN_PROGRESS', 'RECESSED'] } },
      include: { body: { include: { government: true } }, items: true },
    }),
  );
  const rows = [];
  for (const meeting of meetings) {
    const current = meeting.items.find((item) => item.id === meeting.currentItemId);
    rows.push({
      meetingId: meeting.id,
      label: chartLabel(meeting.body.code, meeting.startsAt, meeting.body.government.timezone),
      status: meeting.status,
      government: meeting.body.government.shortName,
      colorToken: meeting.body.government.colorToken,
      body: meeting.body.name,
      currentItemId: meeting.currentItemId,
      currentItemTitle: current?.title ?? null,
      timer: await getTimer(meeting.id),
    });
  }
  return rows;
}

export async function publicPageById(pageId: string) {
  const region = await getRegion();
  return withTenant({ governmentIds: region.governments.map((government) => government.id) }, async (tx) => {
    const page = await tx.documentPage.findUnique({
      where: { id: pageId },
      include: { document: { include: { agendaItem: { include: { meeting: true } } } } },
    });
    if (!page) throw new DomainError(404, 'Page not found');
    const status = page.document.agendaItem?.meeting.status;
    if (status && !isPublicMeetingStatus(status)) throw new DomainError(404, 'Page not found');
    return {
      id: page.id,
      documentId: page.documentId,
      documentTitle: page.document.title,
      pageNumber: page.pageNumber,
      html: page.html,
      text: page.text,
    };
  });
}

export async function publicPage(documentId: string, pageNumber: number) {
  const region = await getRegion();
  return withTenant({ governmentIds: region.governments.map((government) => government.id) }, async (tx) => {
    const page = await tx.documentPage.findUnique({
      where: { documentId_pageNumber: { documentId, pageNumber } },
      include: { document: { include: { agendaItem: { include: { meeting: true } } } } },
    });
    if (!page) throw new DomainError(404, 'Page not found');
    const status = page.document.agendaItem?.meeting.status;
    if (status && !isPublicMeetingStatus(status)) throw new DomainError(404, 'Page not found');
    return page;
  });
}

export async function publicSearch(q: string) {
  const region = await getRegion();
  return withTenant({ governmentIds: region.governments.map((government) => government.id) }, async (tx) => {
    const matters = await tx.matter.findMany({
      where: {
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { caseNumber: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: 8,
      include: { government: true },
    });
    const items = await tx.agendaItem.findMany({
      where: {
        title: { contains: q, mode: 'insensitive' },
        meeting: { status: { not: 'DRAFT' } },
      },
      take: 8,
      include: { meeting: { include: { body: true } } },
    });
    return {
      matters: matters.map((matter) => ({
        id: matter.id,
        title: matter.title,
        caseNumber: matter.caseNumber,
        government: matter.government.shortName,
      })),
      items: items
        .filter((item) => isPublicMeetingStatus(item.meeting.status))
        .map((item) => ({ id: item.id, title: item.title, position: item.position, meetingId: item.meetingId })),
    };
  });
}
