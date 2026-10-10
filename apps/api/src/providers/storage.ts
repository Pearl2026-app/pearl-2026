import { createHmac } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageProvider, StoredFile } from './types';

export function safeKey(key: string): string {
  const k = normalize(key).replace(/^(\.\.(\/|\\|$))+/, '').replace(/^\/+/, '');
  if (k.includes('..') || !/^[\w\-./]+$/.test(k)) throw new Error('Invalid storage key');
  return k;
}

export function signLocal(secret: string, key: string, exp: number): string {
  return createHmac('sha256', secret).update(`${key}:${exp}`).digest('base64url');
}

/** Development storage on local disk. Public files are served at /media/*, private ones via signed URLs. */
export class LocalStorage implements StorageProvider {
  readonly name = 'local';
  constructor(
    private readonly root: string,
    private readonly apiUrl: string,
    private readonly secret: string,
  ) {}
  private path(key: string, v: 'public' | 'private') {
    return join(this.root, v, safeKey(key));
  }
  async put(key: string, body: Buffer, contentType: string, visibility: 'public' | 'private'): Promise<StoredFile> {
    const p = this.path(key, visibility);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, body);
    return { key: safeKey(key), url: visibility === 'public' ? `/media/${safeKey(key)}` : `private:${safeKey(key)}`, size: body.length, contentType };
  }
  async get(key: string, visibility: 'public' | 'private'): Promise<Buffer | null> {
    try {
      return await readFile(this.path(key, visibility));
    } catch {
      return null;
    }
  }
  async signedUrl(key: string, ttlSeconds = 600): Promise<string> {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const k = safeKey(key);
    return `${this.apiUrl}/api/v1/files/${k}?exp=${exp}&sig=${signLocal(this.secret, k, exp)}`;
  }
  async delete(key: string, visibility: 'public' | 'private'): Promise<void> {
    await rm(this.path(key, visibility), { force: true });
  }
}

/** S3-compatible storage. Public objects live under public/ and are served through the CDN. */
export class S3Storage implements StorageProvider {
  readonly name = 's3';
  private client: S3Client;
  constructor(
    private readonly bucket: string,
    opts: { region: string; endpoint?: string; accessKeyId?: string; secretAccessKey?: string },
    private readonly cdnBaseUrl?: string,
  ) {
    this.client = new S3Client({
      region: opts.region,
      endpoint: opts.endpoint,
      forcePathStyle: !!opts.endpoint,
      credentials: opts.accessKeyId ? { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey ?? '' } : undefined,
    });
  }
  private objectKey(key: string, v: 'public' | 'private') {
    return `${v}/${safeKey(key)}`;
  }
  async put(key: string, body: Buffer, contentType: string, visibility: 'public' | 'private'): Promise<StoredFile> {
    const Key = this.objectKey(key, visibility);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key,
        Body: body,
        ContentType: contentType,
        CacheControl: visibility === 'public' ? 'public, max-age=31536000, immutable' : 'private, no-store',
      }),
    );
    const base = this.cdnBaseUrl?.replace(/\/$/, '');
    return {
      key: safeKey(key),
      url: visibility === 'public' ? (base ? `${base}/${Key}` : `/media/${safeKey(key)}`) : `private:${safeKey(key)}`,
      size: body.length,
      contentType,
    };
  }
  async get(key: string, visibility: 'public' | 'private'): Promise<Buffer | null> {
    try {
      const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key, visibility) }));
      return Buffer.from(await out.Body!.transformToByteArray());
    } catch {
      return null;
    }
  }
  async signedUrl(key: string, ttlSeconds = 600): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key, 'private') }), {
      expiresIn: ttlSeconds,
    });
  }
  async delete(key: string, visibility: 'public' | 'private'): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key, visibility) }));
  }
}
