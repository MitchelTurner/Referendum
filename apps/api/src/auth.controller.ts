import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  completeStaffTotp,
  DomainError,
  getRegion,
  logoutStaff,
  rateLimit,
  residentFromToken,
  startMagicLink,
  startSmsCode,
  startStaffLogin,
  verifyMagicLink,
  verifySmsCode,
} from '@referendum/db';
import { magicLinkSchema, magicVerifySchema, smsStartSchema, smsVerifySchema, staffLoginSchema, totpSchema } from '@referendum/shared';
import type { Request, Response } from 'express';
import { bearer, clientIp, cookieOptions, parseBody, requireStaff, RESIDENT_COOKIE, STAFF_COOKIE } from './common';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  @Post('staff/login')
  async login(@Body() body: unknown, @Req() req: Request) {
    if (!(await rateLimit(`staff-login:${clientIp(req)}`, 10, 600))) throw new DomainError(429, 'Too many attempts');
    const input = parseBody(staffLoginSchema, body);
    return startStaffLogin(input.email, input.password);
  }

  @Post('staff/totp')
  async totp(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = parseBody(totpSchema, body);
    const session = await completeStaffTotp(input.challengeToken, input.code);
    res.cookie(STAFF_COOKIE, session.token, cookieOptions());
    return { actor: session.actor };
  }

  @Post('staff/logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = bearer(req, STAFF_COOKIE);
    if (token) await logoutStaff(token);
    res.clearCookie(STAFF_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Get('staff/me')
  async me(@Req() req: Request) {
    return requireStaff(req);
  }

  @Post('resident/magic')
  async magic(@Body() body: unknown, @Req() req: Request) {
    if (!(await rateLimit(`magic:${clientIp(req)}`, 10, 600))) throw new DomainError(429, 'Too many attempts');
    const input = parseBody(magicLinkSchema, body);
    const region = await getRegion();
    await startMagicLink(region.id, input.email);
    return { sent: true };
  }

  @Post('resident/magic/verify')
  async magicVerify(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = parseBody(magicVerifySchema, body);
    const session = await verifyMagicLink(input.token);
    res.cookie(RESIDENT_COOKIE, session.token, cookieOptions());
    return { residentId: session.residentId };
  }

  @Post('resident/sms')
  async sms(@Body() body: unknown, @Req() req: Request) {
    if (!(await rateLimit(`sms:${clientIp(req)}`, 10, 600))) throw new DomainError(429, 'Too many attempts');
    const input = parseBody(smsStartSchema, body);
    const region = await getRegion();
    await startSmsCode(region.id, input.phone);
    return { sent: true };
  }

  @Post('resident/sms/verify')
  async smsVerify(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = parseBody(smsVerifySchema, body);
    const session = await verifySmsCode(input.phone, input.code);
    res.cookie(RESIDENT_COOKIE, session.token, cookieOptions());
    return { residentId: session.residentId };
  }

  @Get('resident/me')
  async resident(@Req() req: Request) {
    const token = bearer(req, RESIDENT_COOKIE);
    if (!token) throw new DomainError(401, 'Sign in required');
    const resident = await residentFromToken(token);
    if (!resident) throw new DomainError(401, 'Sign in required');
    return resident;
  }

  @Post('resident/logout')
  logoutResident(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(RESIDENT_COOKIE, { path: '/' });
    return { ok: true };
  }
}
