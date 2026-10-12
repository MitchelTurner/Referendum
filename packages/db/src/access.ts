import { ModuleKey } from '@prisma/client';
import { can, type Action, type StaffRole } from '@referendum/shared';
import type { TenantScope, Tx } from './client';
import { DomainError } from './errors';

export type MembershipView = {
  governmentId: string;
  role: StaffRole;
  personId: string | null;
};

export type StaffActor = {
  id: string;
  email: string;
  name: string;
  memberships: MembershipView[];
};

export function actorGovernmentIds(actor: StaffActor): string[] {
  return [...new Set(actor.memberships.map((membership) => membership.governmentId))];
}

export function scopeFor(actor: StaffActor): TenantScope {
  return { governmentIds: actorGovernmentIds(actor), userId: actor.id };
}

export function assertCan(
  actor: StaffActor,
  action: Action,
  resource: { governmentId: string; owns?: boolean; assigned?: boolean },
): void {
  const membership = actor.memberships.find((item) => item.governmentId === resource.governmentId);
  if (
    !membership ||
    !can({
      role: membership.role,
      action,
      ownsResource: resource.owns,
      assigned: resource.assigned,
    })
  ) {
    throw new DomainError(403, 'Forbidden');
  }
}

export async function requireMeeting(tx: Tx, meetingId: string) {
  const meeting = await tx.meeting.findUnique({
    where: { id: meetingId },
    include: { body: { include: { government: true } } },
  });
  if (!meeting) throw new DomainError(404, 'Meeting not found');
  return meeting;
}

export async function requireItem(tx: Tx, itemId: string) {
  const item = await tx.agendaItem.findUnique({
    where: { id: itemId },
    include: {
      meeting: { include: { body: { include: { government: true } } } },
      matter: true,
      reviews: { orderBy: { order: 'asc' } },
    },
  });
  if (!item) throw new DomainError(404, 'Item not found');
  return item;
}

export async function assertModule(tx: Tx, governmentId: string, module: ModuleKey): Promise<void> {
  const row = await tx.governmentModule.findUnique({
    where: { governmentId_module: { governmentId, module } },
  });
  const now = new Date();
  const enabled =
    !!row &&
    row.enabled &&
    (!row.startsAt || row.startsAt <= now) &&
    (!row.endsAt || row.endsAt >= now);
  if (!enabled) throw new DomainError(404, 'Module is not enabled');
}
