import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export default function globalSetup(): void {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  execSync('pnpm exec tsx src/seed-public-fixture.ts', {
    cwd: path.join(root, 'packages/db'),
    stdio: 'inherit',
    env: process.env,
  });
}
