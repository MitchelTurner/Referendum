import { PrismaClient, type Prisma } from '@prisma/client';

export type Tx = Prisma.TransactionClient;

export type TenantScope = {
  governmentIds: string[] | 'all';
  userId?: string | null;
  residentId?: string | null;
};

let client: PrismaClient | undefined;

export function databaseUrl(): string {
  if (process.env.NODE_ENV === 'test') {
    return (
      process.env.DATABASE_URL_TEST ??
      process.env.DATABASE_URL ??
      'postgresql://referendum:referendum@127.0.0.1:5432/referendum_test'
    );
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return url;
}

export function getPrisma(): PrismaClient {
  if (!client) {
    client = new PrismaClient({ datasources: { db: { url: databaseUrl() } } });
  }
  return client;
}

/** Sets the RLS session variables for one transaction. Spec §3.2. */
export async function withTenant<T>(scope: TenantScope, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const prisma = getPrisma();
  return prisma.$transaction(
    async (tx) => {
      const bypass = scope.governmentIds === 'all' ? 'on' : 'off';
      const ids = scope.governmentIds === 'all' ? '' : scope.governmentIds.join(',');
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', ${bypass}, true)`;
      await tx.$executeRaw`SELECT set_config('app.government_ids', ${ids}, true)`;
      await tx.$executeRaw`SELECT set_config('app.user_id', ${scope.userId ?? ''}, true)`;
      await tx.$executeRaw`SELECT set_config('app.resident_id', ${scope.residentId ?? ''}, true)`;
      return fn(tx);
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}

export async function disconnectPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}
