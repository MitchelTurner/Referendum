import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { getRegion, publicItem, publicMatter, publicMeeting, withTenant } from '@referendum/db';
import { OPEN_DATA_SCHEMA_VERSION, chartLabel, isPublicMeetingStatus } from '@referendum/shared';

@ApiTags('open-data')
@Controller('api/v1')
export class OpenController {
  @Get('meetings.json')
  @Header('Cache-Control', 'public, max-age=60')
  async meetings() {
    const region = await getRegion();
    return withTenant({ governmentIds: region.governments.map((government) => government.id) }, async (tx) => {
      const meetings = await tx.meeting.findMany({
        where: { status: { not: 'DRAFT' } },
        include: { body: { include: { government: true } } },
        orderBy: { startsAt: 'asc' },
        take: 200,
      });
      return meetings
        .filter((meeting) => isPublicMeetingStatus(meeting.status))
        .map((meeting) => ({
          schemaVersion: OPEN_DATA_SCHEMA_VERSION,
          id: meeting.id,
          government: meeting.body.government.name,
          governmentShortName: meeting.body.government.shortName,
          body: meeting.body.name,
          bodyCode: meeting.body.code,
          label: chartLabel(meeting.body.code, meeting.startsAt, meeting.body.government.timezone),
          startsAt: meeting.startsAt.toISOString(),
          location: meeting.location,
          status: meeting.status,
          packetPublishedAt: meeting.packetPublishedAt?.toISOString() ?? null,
        }));
    });
  }

  @Get('meetings/:id.json')
  @Header('Cache-Control', 'public, max-age=60')
  async meeting(@Param('id') id: string) {
    const meeting = await publicMeeting(id.replace(/\.json$/, ''));
    return {
      schemaVersion: OPEN_DATA_SCHEMA_VERSION,
      id: meeting.id,
      government: meeting.government.name,
      governmentShortName: meeting.government.shortName,
      body: meeting.body.name,
      bodyCode: meeting.body.code,
      label: meeting.label,
      startsAt: meeting.startsAt,
      location: meeting.location,
      status: meeting.status,
      packetPublishedAt: meeting.packetPublishedAt,
      items: meeting.items,
    };
  }

  @Get('items/:id.json')
  @Header('Cache-Control', 'public, max-age=60')
  async item(@Param('id') id: string) {
    const item = await publicItem(id.replace(/\.json$/, ''));
    return {
      schemaVersion: OPEN_DATA_SCHEMA_VERSION,
      id: item.id,
      meetingId: item.meeting.id,
      position: item.position,
      title: item.title,
      type: item.type,
      status: item.status,
      matterId: item.matter?.id ?? null,
      events: item.matter?.events ?? [],
    };
  }

  @Get('matters/:id.json')
  @Header('Cache-Control', 'public, max-age=60')
  async matter(@Param('id') id: string) {
    const matter = await publicMatter(id.replace(/\.json$/, ''));
    return {
      schemaVersion: OPEN_DATA_SCHEMA_VERSION,
      id: matter.id,
      government: matter.government.name,
      title: matter.title,
      caseNumber: matter.caseNumber,
      kind: matter.kind,
      events: matter.events.map((event) => ({
        label: event.label,
        occurredAt: event.occurredAt,
        projectedFor: event.projectedFor,
        order: event.order,
      })),
    };
  }

  @Get('votes.json')
  @Header('Cache-Control', 'public, max-age=60')
  async votes(@Query('from') from?: string, @Query('to') to?: string) {
    const region = await getRegion();
    return withTenant({ governmentIds: region.governments.map((government) => government.id) }, async (tx) => {
      const rows = await tx.vote.findMany({
        where: {
          motion: {
            acceptedByUserId: { not: null },
            agendaItem: {
              meeting: {
                startsAt: {
                  gte: from ? new Date(from) : undefined,
                  lte: to ? new Date(to) : undefined,
                },
              },
            },
          },
        },
        include: { person: true, motion: { include: { agendaItem: true } } },
        take: 500,
      });
      return rows.map((vote) => ({
        schemaVersion: OPEN_DATA_SCHEMA_VERSION,
        motionId: vote.motionId,
        itemId: vote.motion.agendaItemId,
        meetingId: vote.motion.agendaItem.meetingId,
        person: vote.person.fullName,
        value: vote.value,
        motion: vote.motion.text,
        result: vote.motion.result,
      }));
    });
  }
}
