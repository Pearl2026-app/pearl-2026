import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { badRequest } from '../../common/errors';
import { config } from '../../config/config';
import { STORAGE, type StorageProvider } from '../../providers/types';

/** 48 megapixels: far above any camera photo, and refuses images built to exhaust memory when decoded. */
const MAX_PIXELS = 48_000_000;

export const IMAGE_WIDTHS = [400, 800, 1200, 1600] as const;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'image/heif', 'image/tiff'];
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
const DOC_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export interface UploadedImage {
  url: string;
  variants: Record<string, string>;
  width: number;
  height: number;
}

export interface IncomingFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

/** Uploads: images are cropped/compressed into WebP variants; documents and video are stored as-is. */
@Injectable()
export class MediaService {
  constructor(@Inject(STORAGE) private readonly storage: StorageProvider) {}

  async saveImage(file: IncomingFile, folder: string, opts: { square?: boolean } = {}): Promise<UploadedImage> {
    if (!IMAGE_TYPES.includes(file.mimetype)) throw badRequest('UNSUPPORTED_FILE', 'Upload a JPG, PNG, WebP or AVIF image.');
    if (file.size > 25 * 1024 * 1024) throw badRequest('FILE_TOO_LARGE', 'Images must be under 25 MB.');
    let meta: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
    try {
      meta = await sharp(file.buffer, { limitInputPixels: MAX_PIXELS }).metadata();
    } catch {
      throw badRequest('UNSUPPORTED_FILE', 'That file is not a readable image.');
    }
    const id = randomUUID();
    const base = sharp(file.buffer, { failOn: 'error', limitInputPixels: MAX_PIXELS }).rotate(); // apply EXIF orientation, strip metadata
    const srcW = meta.autoOrient?.width ?? meta.width ?? 1600;
    const srcH = meta.autoOrient?.height ?? meta.height ?? 1600;
    const variants: Record<string, string> = {};
    let last = { width: 0, height: 0, url: '' };
    for (const w of IMAGE_WIDTHS) {
      if (w > srcW && w !== IMAGE_WIDTHS[0]) break;
      const pipeline = base.clone();
      const out = opts.square
        ? pipeline.resize(w, w, { fit: 'cover', position: 'attention' })
        : pipeline.resize({ width: w, withoutEnlargement: true });
      const { data, info } = await out.webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
      const stored = await this.storage.put(`${folder}/${id}-${w}.webp`, data, 'image/webp', 'public');
      variants[String(w)] = stored.url;
      last = { width: info.width, height: info.height, url: stored.url };
    }
    const url = variants['1200'] ?? last.url;
    const width = opts.square ? Math.min(1200, last.width) : last.width;
    return { url, variants, width: width || srcW, height: opts.square ? width || srcH : last.height || srcH };
  }

  async saveVideo(file: IncomingFile, folder: string) {
    if (!VIDEO_TYPES.includes(file.mimetype)) throw badRequest('UNSUPPORTED_FILE', 'Upload an MP4, WebM or MOV video.');
    if (file.size > config().MAX_UPLOAD_MB * 1024 * 1024) throw badRequest('FILE_TOO_LARGE', `Videos must be under ${config().MAX_UPLOAD_MB} MB.`);
    const ext = file.mimetype === 'video/webm' ? 'webm' : file.mimetype === 'video/quicktime' ? 'mov' : 'mp4';
    return this.storage.put(`${folder}/${randomUUID()}.${ext}`, file.buffer, file.mimetype, 'public');
  }

  /** Private documents (resumes, design files). Returned URL is `private:<key>`; use signedUrl() to read. */
  async saveDocument(file: IncomingFile, folder: string, visibility: 'public' | 'private' = 'private', allowImages = false) {
    const allowed = allowImages ? [...DOC_TYPES, ...IMAGE_TYPES] : DOC_TYPES;
    if (!allowed.includes(file.mimetype)) throw badRequest('UNSUPPORTED_FILE', allowImages ? 'Upload a PDF, Word document or image.' : 'Upload a PDF or Word document.');
    if (file.size > 10 * 1024 * 1024) throw badRequest('FILE_TOO_LARGE', 'Files must be under 10 MB.');
    // Check magic bytes so a renamed executable is not accepted as a PDF.
    const head = file.buffer.subarray(0, 8);
    const isPdf = head.subarray(0, 4).toString() === '%PDF';
    const isZip = head[0] === 0x50 && head[1] === 0x4b; // docx
    const isOle = head[0] === 0xd0 && head[1] === 0xcf; // doc
    const isImage = file.mimetype.startsWith('image/');
    if (!isImage && !(isPdf || isZip || isOle)) throw badRequest('UNSUPPORTED_FILE', 'That file does not look like a PDF or Word document.');
    if (isImage) {
      try {
        await sharp(file.buffer, { limitInputPixels: MAX_PIXELS }).metadata();
      } catch {
        throw badRequest('UNSUPPORTED_FILE', 'That file is not a readable image.');
      }
    }
    const ext = isPdf ? 'pdf' : isZip ? 'docx' : isOle ? 'doc' : (file.mimetype.split('/')[1] ?? 'bin');
    return this.storage.put(`${folder}/${randomUUID()}.${ext}`, file.buffer, file.mimetype, visibility);
  }

  /** Turn a stored URL into something a browser can open. Private files get a short-lived signed URL. */
  async resolve(url: string | null | undefined, ttlSeconds = 600): Promise<string | null> {
    if (!url) return null;
    if (url.startsWith('private:')) return this.storage.signedUrl(url.slice('private:'.length), ttlSeconds);
    return url;
  }

  putBuffer(key: string, body: Buffer, contentType: string, visibility: 'public' | 'private') {
    return this.storage.put(key, body, contentType, visibility);
  }
}
