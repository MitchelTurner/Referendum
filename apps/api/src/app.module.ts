import { Module, type OnModuleInit } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { registerJobHandlers } from '@referendum/db';
import { AuthController } from './auth.controller';
import { ModuleGuard } from './common';
import { EmbedController } from './embed.controller';
import { HealthController } from './health.controller';
import { OpenController } from './open.controller';
import { PublicController } from './public.controller';
import { StaffController } from './staff.controller';

@Module({
  controllers: [HealthController, AuthController, PublicController, StaffController, OpenController, EmbedController],
  providers: [{ provide: APP_GUARD, useClass: ModuleGuard }],
})
export class AppModule implements OnModuleInit {
  onModuleInit(): void {
    registerJobHandlers();
  }
}
