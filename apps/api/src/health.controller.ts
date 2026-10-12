import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { getPrisma, pingRedis } from '@referendum/db';

@ApiTags('health')
@Controller()
export class HealthController {
  @Get('health')
  async health() {
    let db = false;
    let redis = false;
    try {
      await getPrisma().$queryRaw`SELECT 1`;
      db = true;
    } catch {
      db = false;
    }
    redis = await pingRedis();
    return { ok: db && redis, db, redis };
  }
}
