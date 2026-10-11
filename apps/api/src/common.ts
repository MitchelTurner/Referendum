import {
  type ArgumentsHost,
  Catch,
  type CanActivate,
  type ExecutionContext,
  Injectable,
  SetMetadata,
  type ExceptionFilter,
} from '@nestjs/common';
import type { ModuleKey } from '@referendum/shared';
import { actorGovernmentIds, DomainError, staffFromToken, withTenant, type StaffActor } from '@referendum/db';
import type { Request, Response } from 'express';
import type { ZodType } from 'zod';

export const STAFF_COOKIE = 'ref_staff';
export const RESIDENT_COOKIE = 'ref_resident';

export function RequiresModule(module: ModuleKey) {
  return SetMetadata('module', module);
}

export function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) return forwarded.split(',')[0]!.trim();
  return req.ip || 'local';
}

export function bearer(req: Request, cookieName: string): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const cookie = req.cookies?.[cookieName];
  return typeof cookie === 'string' ? cookie : null;
}

export async function requireStaff(req: Request): Promise<StaffActor> {
  const token = bearer(req, STAFF_COOKIE);
  if (!token) throw new DomainError(401, 'Sign in required');
  const actor = await staffFromToken(token);
  if (!actor) throw new DomainError(401, 'Sign in required');
  return actor;
}

export async function optionalResident(req: Request): Promise<string | undefined> {
  const token = bearer(req, RESIDENT_COOKIE);
  if (!token) return undefined;
  const { residentFromToken } = await import('@referendum/db');
  const resident = await residentFromToken(token);
  return resident?.id;
}

export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new DomainError(400, result.error.issues[0]?.message ?? 'Invalid request');
  }
  return result.data;
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };
}

@Injectable()
export class ModuleGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const module =
      (Reflect.getMetadata('module', context.getHandler()) as ModuleKey | undefined) ??
      (Reflect.getMetadata('module', context.getClass()) as ModuleKey | undefined);
    if (!module) return true;
    const req = context.switchToHttp().getRequest<Request>();
    const actor = await requireStaff(req);
    const enabled = await withTenant({ governmentIds: actorGovernmentIds(actor), userId: actor.id }, async (tx) =>
      tx.governmentModule.findFirst({
        where: { governmentId: { in: actorGovernmentIds(actor) }, module, enabled: true },
      }),
    );
    if (!enabled) throw new DomainError(404, 'Module is not enabled');
    return true;
  }
}

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (response.headersSent) return;
    if (exception instanceof DomainError) {
      response.status(exception.status).json({ message: exception.message, ...(exception.details ?? {}) });
      return;
    }
    const status =
      exception && typeof exception === 'object' && 'getStatus' in exception && typeof exception.getStatus === 'function'
        ? (exception.getStatus() as number)
        : 500;
    const message = exception instanceof Error ? exception.message : 'Internal error';
    if (status >= 500) console.error(exception);
    response.status(status).json({ message: status >= 500 ? 'Internal error' : message });
  }
}
