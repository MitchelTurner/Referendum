import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

function rootDir(): string {
  return path.resolve(process.env.STORAGE_LOCAL_DIR ?? path.join(process.cwd(), 'data/storage'));
}

function secret(): string {
  return process.env.SESSION_SECRET ?? 'dev-only-session-secret';
}

function s3Configured(): boolean {
  return Boolean(process.env.STORAGE_BUCKET && process.env.STORAGE_ACCESS_KEY && process.env.STORAGE_SECRET_KEY);
}

export async function putObject(key: string, body: Buffer, contentType = 'application/octet-stream'): Promise<void> {
  if (s3Configured()) {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client({
      region: process.env.STORAGE_REGION ?? 'auto',
      endpoint: process.env.STORAGE_ENDPOINT || undefined,
      credentials: {
        accessKeyId: process.env.STORAGE_ACCESS_KEY ?? '',
        secretAccessKey: process.env.STORAGE_SECRET_KEY ?? '',
      },
      forcePathStyle: true,
    });
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.STORAGE_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return;
  }
  const full = path.join(rootDir(), key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, body);
}

export async function getObject(key: string): Promise<Buffer> {
  if (s3Configured()) {
    const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
    const client = new S3Client({
      region: process.env.STORAGE_REGION ?? 'auto',
      endpoint: process.env.STORAGE_ENDPOINT || undefined,
      credentials: {
        accessKeyId: process.env.STORAGE_ACCESS_KEY ?? '',
        secretAccessKey: process.env.STORAGE_SECRET_KEY ?? '',
      },
      forcePathStyle: true,
    });
    const result = await client.send(
      new GetObjectCommand({ Bucket: process.env.STORAGE_BUCKET, Key: key }),
    );
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) throw new Error('Empty object');
    return Buffer.from(bytes);
  }
  return readFile(path.join(rootDir(), key));
}

export function signFileKey(key: string, expiresAt: number): string {
  return createHmac('sha256', secret()).update(`${key}.${expiresAt}`).digest('base64url');
}

export function verifyFileKey(key: string, expiresAt: number, signature: string): boolean {
  if (expiresAt < Date.now()) return false;
  const expected = signFileKey(key, expiresAt);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function signedFilePath(key: string, ttlMs = 15 * 60 * 1000): string {
  const expiresAt = Date.now() + ttlMs;
  const signature = signFileKey(key, expiresAt);
  const params = new URLSearchParams({
    key,
    exp: String(expiresAt),
    sig: signature,
  });
  return `/staff/files?${params.toString()}`;
}
