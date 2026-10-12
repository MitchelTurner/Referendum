import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Controller, Get, NotFoundException, Res } from '@nestjs/common';
import type { Response } from 'express';

function embedPath(): string | null {
  const candidates = [
    path.resolve(__dirname, '../../../packages/embeds/dist/referendum.js'),
    path.resolve(process.cwd(), 'packages/embeds/dist/referendum.js'),
    path.resolve(process.cwd(), '../../packages/embeds/dist/referendum.js'),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

@Controller('embed/v1')
export class EmbedController {
  @Get('referendum.js')
  script(@Res() res: Response): void {
    const file = embedPath();
    if (!file) throw new NotFoundException('Embed script is not built');
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(readFileSync(file));
  }
}
