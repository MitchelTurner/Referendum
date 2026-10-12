import { Queue } from 'bullmq';

export type JobPayload = Record<string, string>;
type Handler = (data: JobPayload) => Promise<void>;

const handlers = new Map<string, Handler>();
const queues = new Map<string, Queue>();

export function registerHandler(name: string, handler: Handler): void {
  handlers.set(name, handler);
}

export function getHandler(name: string): Handler | undefined {
  return handlers.get(name);
}

function bullQueue(name: string): Queue {
  const existing = queues.get(name);
  if (existing) return existing;
  const queue = new Queue(name, {
    connection: { url: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', maxRetriesPerRequest: null },
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 200,
      removeOnFail: false,
    },
  });
  queues.set(name, queue);
  return queue;
}

export async function enqueue(name: string, data: JobPayload): Promise<void> {
  if ((process.env.QUEUE_MODE ?? 'inline') !== 'bull') {
    const handler = handlers.get(name);
    if (!handler) throw new Error(`No handler registered for ${name}`);
    try {
      await handler(data);
    } catch (error) {
      const { recordFailure } = await import('./failures');
      await recordFailure(name, `inline-${Date.now()}`, data, error);
      throw error;
    }
    return;
  }
  await bullQueue(name).add(name, data);
}

export const JOBS = [
  'ingest-document',
  'embed-pages',
  'summarize-matter',
  'redline',
  'notify-fanout',
  'send',
  'speaker-two-away',
  'weekly-digest',
  'transcribe',
  'draft-minutes',
  'review-reminder',
  'archive-import',
  'retention-scan',
] as const;
