import { withTenant } from './client';
import type { JobPayload } from './queue';

export async function recordFailure(queue: string, jobId: string, payload: JobPayload, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : 'Job failed';
  console.error(JSON.stringify({ level: 'error', queue, jobId, msg: message }));
  await withTenant({ governmentIds: 'all' }, async (tx) => {
    await tx.jobFailure.create({
      data: {
        queue,
        jobId,
        governmentId: payload.governmentId || null,
        meetingId: payload.meetingId || null,
        payload,
        error: message,
      },
    });
  });
}
