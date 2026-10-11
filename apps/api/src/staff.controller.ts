import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  acceptMotion,
  actorGovernmentIds,
  addDocument,
  adoptMinutes,
  answerStaffQuestion,
  approveSummary,
  askInsights,
  askStaffQuestion,
  assignReview,
  callNextSpeaker,
  complianceSnapshot,
  createBody,
  createItem,
  createLiveMotion,
  createMatter,
  createMeeting,
  createPerson,
  createSeat,
  createTerm,
  decideReview,
  declareConflict,
  DomainError,
  exportGovernment,
  getObject,
  getReadiness,
  getStaffItem,
  getStaffMeeting,
  getTimer,
  hideComment,
  listBoards,
  listImports,
  listMeetings,
  minutesDraft,
  needsYou,
  nudgeReview,
  patchMotion,
  publishPacket,
  recordVotes,
  reviewTranslation,
  scopeFor,
  setCurrentItem,
  setTimer,
  startImport,
  updateBody,
  updateItem,
  updateMeeting,
  upsertNoticeRule,
  verifyFileKey,
  withTenant,
} from '@referendum/db';
import {
  agendaItemSchema,
  bodySchema,
  clampLimit,
  conflictSchema,
  currentItemSchema,
  decodeCursor,
  hideCommentSchema,
  importSchema,
  meetingSchema,
  motionPatchSchema,
  motionSchema,
  noticeRuleSchema,
  paginate,
  personSchema,
  reviewDecisionSchema,
  seatSchema,
  staffQuestionSchema,
  termSchema,
  timerSchema,
  votesSchema,
} from '@referendum/shared';
import type { Request, Response } from 'express';
import { parseBody, requireStaff, RequiresModule } from './common';

@ApiTags('staff')
@Controller('staff')
export class StaffController {
  @Get('inbox')
  async inbox(@Req() req: Request) {
    return needsYou(await requireStaff(req));
  }

  @Get('bodies')
  async bodies(@Req() req: Request) {
    const actor = await requireStaff(req);
    return withTenant(scopeFor(actor), (tx) =>
      tx.body.findMany({ include: { government: true }, orderBy: { name: 'asc' } }),
    );
  }

  @Post('bodies')
  @RequiresModule('MEETINGS')
  async createBody(@Req() req: Request, @Body() body: unknown) {
    const input = parseBody(bodySchema, body);
    return createBody(await requireStaff(req), input);
  }

  @Patch('bodies/:id')
  @RequiresModule('MEETINGS')
  async patchBody(@Req() req: Request, @Param('id') id: string, @Body() body: { name?: string; defaultLocation?: string | null; speakerSeconds?: number }) {
    return updateBody(await requireStaff(req), id, body);
  }

  @Get('meetings')
  async meetings(@Req() req: Request, @Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    const actor = await requireStaff(req);
    const size = clampLimit(limit);
    const rows = await listMeetings(actor, cursor ? decodeCursor(cursor) : null, size);
    return paginate(rows, size);
  }

  @Post('meetings')
  @RequiresModule('MEETINGS')
  async addMeeting(@Req() req: Request, @Body() body: unknown) {
    const input = parseBody(meetingSchema, body);
    return createMeeting(await requireStaff(req), input);
  }

  @Get('meetings/:id')
  async meeting(@Req() req: Request, @Param('id') id: string) {
    return getStaffMeeting(await requireStaff(req), id);
  }

  @Patch('meetings/:id')
  @RequiresModule('MEETINGS')
  async patchMeeting(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const input = parseBody(meetingSchema.partial(), body);
    return updateMeeting(await requireStaff(req), id, {
      startsAt: input.startsAt,
      location: input.location,
      status: input.status,
      noticePostedAt: input.noticePostedAt,
      videoProvider: input.videoProvider,
      videoRef: input.videoRef,
    });
  }

  @Get('meetings/:id/readiness')
  @RequiresModule('MEETINGS')
  async readiness(@Req() req: Request, @Param('id') id: string) {
    return getReadiness(await requireStaff(req), id);
  }

  @Post('meetings/:id/publish-packet')
  @RequiresModule('MEETINGS')
  async publish(@Req() req: Request, @Param('id') id: string) {
    return publishPacket(await requireStaff(req), id);
  }

  @Post('items')
  @RequiresModule('MEETINGS')
  async addItem(@Req() req: Request, @Body() body: unknown) {
    const input = parseBody(agendaItemSchema, body);
    return createItem(await requireStaff(req), input);
  }

  @Get('items/:id')
  async item(@Req() req: Request, @Param('id') id: string) {
    return getStaffItem(await requireStaff(req), id);
  }

  @Patch('items/:id')
  @RequiresModule('MEETINGS')
  async patchItem(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const input = parseBody(agendaItemSchema.partial(), body);
    return updateItem(await requireStaff(req), id, {
      title: input.title,
      position: input.position,
      sortKey: input.sortKey,
      status: input.status,
      matterId: input.matterId,
      commentsCloseAt: input.commentsCloseAt,
      testimonyOpen: input.testimonyOpen,
      type: input.type,
    });
  }

  @Post('items/:id/documents')
  @RequiresModule('MEETINGS')
  async upload(@Req() req: Request, @Param('id') id: string, @Body() body: { title?: string; kind?: string; filename?: string; base64?: string; matterId?: string }) {
    if (!body.base64 || !body.title || !body.kind) throw new DomainError(400, 'Document title, kind, and file are required');
    return addDocument(await requireStaff(req), {
      agendaItemId: id,
      matterId: body.matterId,
      title: body.title,
      kind: body.kind,
      filename: body.filename ?? 'upload.pdf',
      bytes: Buffer.from(body.base64, 'base64'),
    });
  }

  @Post('items/:id/reviews/:stepId/decision')
  @RequiresModule('MEETINGS')
  async decision(@Req() req: Request, @Param('id') id: string, @Param('stepId') stepId: string, @Body() body: unknown) {
    const input = parseBody(reviewDecisionSchema, body);
    return decideReview(await requireStaff(req), id, stepId, input);
  }

  @Post('items/:id/reviews/:stepId/nudge')
  @RequiresModule('MEETINGS')
  async nudge(@Req() req: Request, @Param('id') id: string, @Param('stepId') stepId: string) {
    return nudgeReview(await requireStaff(req), id, stepId);
  }

  @Post('items/:id/reviews/:stepId/assign')
  @RequiresModule('MEETINGS')
  async assign(@Req() req: Request, @Param('id') id: string, @Param('stepId') stepId: string, @Body() body: { assigneeUserId?: string }) {
    if (!body.assigneeUserId) throw new DomainError(400, 'Assignee is required');
    return assignReview(await requireStaff(req), id, stepId, body.assigneeUserId);
  }

  @Post('items/:id/questions')
  @RequiresModule('MEETINGS')
  async question(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const input = parseBody(staffQuestionSchema, body);
    return askStaffQuestion(await requireStaff(req), id, input.question);
  }

  @Post('questions/:id/answer')
  @RequiresModule('MEETINGS')
  async answer(@Req() req: Request, @Param('id') id: string, @Body() body: { answer?: string }) {
    if (!body.answer) throw new DomainError(400, 'Answer is required');
    return answerStaffQuestion(await requireStaff(req), id, body.answer);
  }

  @Post('comments/:id/hide')
  @RequiresModule('PARTICIPATION')
  async hide(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const input = parseBody(hideCommentSchema, body);
    return hideComment(await requireStaff(req), id, input.reason);
  }

  @Post('notice-rules')
  async notice(@Req() req: Request, @Body() body: unknown) {
    const input = parseBody(noticeRuleSchema, body);
    return upsertNoticeRule(await requireStaff(req), input);
  }

  @Get('notice-rules')
  async noticeRules(@Req() req: Request) {
    const actor = await requireStaff(req);
    return withTenant(scopeFor(actor), (tx) => tx.noticeRule.findMany({ orderBy: { createdAt: 'asc' } }));
  }

  @Post('matters')
  @RequiresModule('MEETINGS')
  async matter(@Req() req: Request, @Body() body: { governmentId?: string; title?: string; caseNumber?: string; kind?: string }) {
    if (!body.governmentId || !body.title || !body.kind) throw new DomainError(400, 'Matter needs a government, title, and kind');
    return createMatter(await requireStaff(req), { governmentId: body.governmentId, title: body.title, caseNumber: body.caseNumber, kind: body.kind });
  }

  @Post('matters/:id/approve-summary')
  @RequiresModule('MINUTES_AI')
  async summary(@Req() req: Request, @Param('id') id: string) {
    return approveSummary(await requireStaff(req), id);
  }

  @Post('translations/:id/review')
  @RequiresModule('MINUTES_AI')
  async translation(@Req() req: Request, @Param('id') id: string) {
    return reviewTranslation(await requireStaff(req), id);
  }

  @Post('live/:meetingId/current-item')
  @RequiresModule('LIVE')
  async current(@Req() req: Request, @Param('meetingId') meetingId: string, @Body() body: unknown) {
    const input = parseBody(currentItemSchema, body);
    return setCurrentItem(await requireStaff(req), meetingId, input.agendaItemId);
  }

  @Post('live/:meetingId/speakers/next')
  @RequiresModule('LIVE')
  async nextSpeaker(@Req() req: Request, @Param('meetingId') meetingId: string) {
    return callNextSpeaker(await requireStaff(req), meetingId);
  }

  @Post('live/:meetingId/timer')
  @RequiresModule('LIVE')
  async timer(@Req() req: Request, @Param('meetingId') meetingId: string, @Body() body: unknown) {
    const input = parseBody(timerSchema, body);
    return setTimer(await requireStaff(req), meetingId, input.action, input.durationSec);
  }

  @Get('live/:meetingId/timer')
  async timerView(@Req() req: Request, @Param('meetingId') meetingId: string) {
    await requireStaff(req);
    return getTimer(meetingId);
  }

  @Post('live/:meetingId/motions')
  @RequiresModule('LIVE')
  async motion(@Req() req: Request, @Param('meetingId') meetingId: string, @Body() body: unknown) {
    const input = parseBody(motionSchema, body);
    return createLiveMotion(await requireStaff(req), meetingId, input);
  }

  @Post('live/:meetingId/motions/:motionId/votes')
  @RequiresModule('LIVE')
  async votes(@Req() req: Request, @Param('motionId') motionId: string, @Body() body: unknown) {
    const input = parseBody(votesSchema, body);
    return recordVotes(await requireStaff(req), motionId, input.votes);
  }

  @Post('live/:meetingId/conflicts')
  @RequiresModule('LIVE')
  async conflict(@Req() req: Request, @Param('meetingId') meetingId: string, @Body() body: unknown) {
    const input = parseBody(conflictSchema, body);
    return declareConflict(await requireStaff(req), meetingId, input);
  }

  @Get('meetings/:id/minutes-draft')
  @RequiresModule('MINUTES_AI')
  async draft(@Req() req: Request, @Param('id') id: string) {
    return minutesDraft(await requireStaff(req), id);
  }

  @Post('motions/:id/accept')
  @RequiresModule('MINUTES_AI')
  async accept(@Req() req: Request, @Param('id') id: string) {
    return acceptMotion(await requireStaff(req), id);
  }

  @Patch('motions/:id')
  @RequiresModule('MINUTES_AI')
  async patchMotion(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    const input = parseBody(motionPatchSchema, body);
    return patchMotion(await requireStaff(req), id, input);
  }

  @Post('meetings/:id/adopt-minutes')
  @RequiresModule('MINUTES_AI')
  async adopt(@Req() req: Request, @Param('id') id: string) {
    return adoptMinutes(await requireStaff(req), id);
  }

  @Get('insights/asks')
  @RequiresModule('ASK')
  async insights(@Req() req: Request, @Query('from') from?: string, @Query('to') to?: string) {
    const actor = await requireStaff(req);
    return askInsights(actorGovernmentIds(actor), from ? new Date(from) : undefined, to ? new Date(to) : undefined);
  }

  @Get('boards')
  @RequiresModule('BOARDS')
  async boards(@Req() req: Request) {
    return listBoards(await requireStaff(req));
  }

  @Post('seats')
  @RequiresModule('BOARDS')
  async seat(@Req() req: Request, @Body() body: unknown) {
    const input = parseBody(seatSchema, body);
    return createSeat(await requireStaff(req), input);
  }

  @Post('persons')
  async person(@Req() req: Request, @Body() body: unknown) {
    const input = parseBody(personSchema, body);
    return createPerson(await requireStaff(req), input);
  }

  @Get('persons')
  async persons(@Req() req: Request) {
    const actor = await requireStaff(req);
    return withTenant(scopeFor(actor), (tx) => tx.person.findMany({ orderBy: { fullName: 'asc' }, take: 200 }));
  }

  @Post('terms')
  @RequiresModule('BOARDS')
  async term(@Req() req: Request, @Body() body: unknown) {
    const input = parseBody(termSchema, body);
    return createTerm(await requireStaff(req), input);
  }

  @Post('imports')
  @RequiresModule('MEETINGS')
  async startImport(@Req() req: Request, @Body() body: unknown) {
    const input = parseBody(importSchema, body);
    return startImport(await requireStaff(req), input);
  }

  @Get('imports')
  async imports(@Req() req: Request) {
    return listImports(await requireStaff(req));
  }

  @Get('compliance')
  async compliance(@Req() req: Request) {
    const actor = await requireStaff(req);
    return complianceSnapshot(actorGovernmentIds(actor));
  }

  @Get('jobs/failures')
  async failures(@Req() req: Request) {
    const actor = await requireStaff(req);
    return withTenant(scopeFor(actor), (tx) =>
      tx.jobFailure.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
    );
  }

  @Get('governments/:id/export')
  async download(@Req() req: Request, @Param('id') id: string, @Res() res: Response) {
    const bytes = await exportGovernment(await requireStaff(req), id);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="referendum-export.zip"');
    res.send(bytes);
  }

  @Get('files')
  async file(@Query('key') key: string, @Query('exp') exp: string, @Query('sig') sig: string, @Res() res: Response) {
    if (!key || !verifyFileKey(key, Number(exp), sig)) throw new DomainError(403, 'Invalid file link');
    const bytes = await getObject(key);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(bytes);
  }
}
