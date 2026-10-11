import 'reflect-metadata';
import { Controller, Get, Module, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Queue, Worker, type Job } from 'bullmq';
import { config } from 'dotenv';
import path from 'node:path';
import { getHandler, getPrisma, JOBS, pingRedis, recordFailure, registerJobHandlers, type JobPayload } from '@referendum/db';

config({ path: path.resolve(__dirname, '../../../.env') });

function connection() {
  return { url: process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', maxRetriesPerRequest: null as null };
}

@Controller()
class HealthController {
  @Get('health')
  async health() {
    let db = false;
    try {
      await getPrisma().$queryRaw`SELECT 1`;
      db = true;
    } catch {
      db = false;
    }
    const redis = await pingRedis();
    return { ok: db && redis, db, redis, role: 'worker' };
  }
}

@Module({ controllers: [HealthController] })
class WorkerModule implements OnModuleInit, OnModuleDestroy {
  private workers: Worker[] = [];
  private queues: Queue[] = [];

  async onModuleInit(): Promise<void> {
    registerJobHandlers();
    if ((process.env.QUEUE_MODE ?? 'inline') !== 'bull') {
      console.log(JSON.stringify({ level: 'info', msg: 'worker idle', queueMode: process.env.QUEUE_MODE ?? 'inline' }));
      return;
    }
    for (const name of JOBS) {
      const queue = new Queue(name, { connection: connection() });
      this.queues.push(queue);
      const worker = new Worker(
        name,
        async (job: Job) => {
          const handler = getHandler(name);
          if (!handler) throw new Error(`No handler registered for ${name}`);
          console.log(JSON.stringify({ level: 'info', queue: name, jobId: job.id, msg: 'start' }));
          await handler(job.data as JobPayload);
          console.log(JSON.stringify({ level: 'info', queue: name, jobId: job.id, msg: 'done' }));
        },
        { connection: connection(), concurrency: 2 },
      );
      worker.on('failed', (job, error) => {
        const attempts = job?.opts.attempts ?? 1;
        console.error(JSON.stringify({ level: 'error', queue: name, jobId: job?.id, msg: error.message, attemptsMade: job?.attemptsMade }));
        if (job && job.attemptsMade >= attempts) {
          void recordFailure(name, job.id ?? 'unknown', (job.data ?? {}) as JobPayload, error);
        }
      });
      this.workers.push(worker);
    }
    const digest = this.queues.find((queue) => queue.name === 'weekly-digest');
    const reminder = this.queues.find((queue) => queue.name === 'review-reminder');
    const retention = this.queues.find((queue) => queue.name === 'retention-scan');
    await digest?.upsertJobScheduler('weekly-digest', { pattern: '0 8 * * 5', tz: 'America/Anchorage' }, { name: 'weekly-digest', data: {} });
    await reminder?.upsertJobScheduler('review-reminder', { pattern: '0 9 * * *', tz: 'America/Anchorage' }, { name: 'review-reminder', data: {} });
    await retention?.upsertJobScheduler('retention-scan', { pattern: '0 6 1 * *', tz: 'America/Anchorage' }, { name: 'retention-scan', data: {} });
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.close()));
    await Promise.all(this.queues.map((queue) => queue.close()));
  }
}

async function bootstrap() {
  const app = await NestFactory.create(WorkerModule, { logger: ['error', 'warn'] });
  await app.listen(process.env.WORKER_PORT ?? 3002);
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
