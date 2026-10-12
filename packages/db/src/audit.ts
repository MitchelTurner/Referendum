import type { Prisma } from '@prisma/client';
import type { Tx } from './client';

export async function writeAudit(
  tx: Tx,
  entry: {
    governmentId?: string | null;
    actorUserId?: string | null;
    actorResidentId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    before?: Prisma.InputJsonValue;
    after?: Prisma.InputJsonValue;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      governmentId: entry.governmentId ?? null,
      actorUserId: entry.actorUserId ?? null,
      actorResidentId: entry.actorResidentId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: entry.before,
      after: entry.after,
    },
  });
}
