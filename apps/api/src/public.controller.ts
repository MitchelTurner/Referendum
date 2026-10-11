import { Body, Controller, Delete, Get, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  addComment,
  applyForSeat,
  askPackets,
  confirmSubscription,
  createSubscription,
  deleteSubscription,
  DomainError,
  getRegion,
  publicCalendar,
  publicItem,
  publicLive,
  publicMatter,
  publicMeeting,
  publicPage,
  publicPageById,
  publicSearch,
  rateLimit,
  readUnsubscribeToken,
  signUpSpeaker,
} from '@referendum/db';
import { applicationSchema, askSchema, commentSchema, speakerSchema, subscriptionSchema } from '@referendum/shared';
import type { Request, Response } from 'express';
import { clientIp, optionalResident, parseBody } from './common';

@ApiTags('public')
@Controller('public')
export class PublicController {
  @Get('region')
  region() {
    return getRegion();
  }

  @Get('calendar')
  calendar(@Query('from') from?: string, @Query('to') to?: string, @Query('governmentIds') governmentIds?: string | string[], @Query('q') q?: string) {
    const ids = typeof governmentIds === 'string' ? [governmentIds] : governmentIds;
    return publicCalendar({
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      governmentIds: ids,
      q,
    });
  }

  @Get('search')
  search(@Query('q') q = '') {
    return publicSearch(q);
  }

  @Get('meetings/:id')
  meeting(@Param('id') id: string) {
    return publicMeeting(id);
  }

  @Get('items/:id')
  item(@Param('id') id: string) {
    return publicItem(id);
  }

  @Get('matters/:id')
  matter(@Param('id') id: string) {
    return publicMatter(id);
  }

  @Get('pages/:pageId')
  pageById(@Param('pageId') pageId: string) {
    return publicPageById(pageId);
  }

  @Get('documents/:documentId/pages/:pageNumber')
  page(@Param('documentId') documentId: string, @Param('pageNumber') pageNumber: string) {
    return publicPage(documentId, Number(pageNumber));
  }

  @Post('ask')
  ask(@Body() body: unknown, @Req() req: Request) {
    const input = parseBody(askSchema, body);
    return askPackets({ regionSlug: 'ketchikan', question: input.question, matterId: input.matterId, ip: clientIp(req) });
  }

  @Post('items/:id/comments')
  async comment(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const input = parseBody(commentSchema, body);
    const residentId = await optionalResident(req);
    return addComment({
      itemId: id,
      name: input.name,
      address: input.address,
      position: input.position,
      body: input.body,
      turnstileToken: input.turnstileToken,
      residentId,
      ip: clientIp(req),
    });
  }

  @Post('items/:id/speakers')
  async speaker(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const input = parseBody(speakerSchema, body);
    const residentId = await optionalResident(req);
    return signUpSpeaker({
      itemId: id,
      displayName: input.displayName,
      mode: input.mode,
      phone: input.phone,
      turnstileToken: input.turnstileToken,
      residentId,
      ip: clientIp(req),
    });
  }

  @Post('subscriptions')
  async subscribe(@Body() body: unknown, @Req() req: Request) {
    if (!(await rateLimit(`subscribe:${clientIp(req)}`, 20, 600))) throw new DomainError(429, 'Too many requests');
    const input = parseBody(subscriptionSchema, body);
    const region = await getRegion();
    return createSubscription({ ...input, regionId: region.id });
  }

  @Get('subscriptions/confirm')
  confirm(@Query('token') token: string) {
    return confirmSubscription(token);
  }

  @Delete('subscriptions/:id')
  async unsubscribe(@Param('id') id: string, @Query('token') token: string | undefined, @Req() req: Request) {
    const residentId = await optionalResident(req);
    const subscriptionId = token ? readUnsubscribeToken(token) : id;
    await deleteSubscription(subscriptionId, token ? undefined : residentId);
    return { ok: true };
  }

  @Post('boards/applications')
  async apply(@Body() body: unknown, @Req() req: Request) {
    if (!(await rateLimit(`apply:${clientIp(req)}`, 10, 600))) throw new DomainError(429, 'Too many requests');
    const input = parseBody(applicationSchema, body);
    const residentId = await optionalResident(req);
    return applyForSeat({ ...input, residentId });
  }

  @Get('live')
  live() {
    return publicLive();
  }

  @Get('live/stream')
  async stream(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    const send = async () => {
      const rows = await publicLive();
      res.write(`data: ${JSON.stringify(rows)}\n\n`);
    };
    await send();
    const timer = setInterval(() => {
      void send().catch(() => undefined);
    }, 1000);
    res.on('close', () => clearInterval(timer));
  }
}
