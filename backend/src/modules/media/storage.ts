import fs from "fs";
import path from "path";
import { Readable } from "stream";
import type { Request, Response, NextFunction } from "express";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * Внешнее хранилище вложений (S3-совместимое: Cloudflare R2, AWS S3, Backblaze B2…).
 *
 * На Render диск сервера очищается при каждом деплое и перезапуске, и файлы из чатов пропадали.
 * Схема: файл, как и раньше, сначала пишется в uploads/ (отправка в мессенджеры читает его с диска),
 * а затем копируется в хранилище. Если после перезапуска файла на диске нет, /uploads/<имя>
 * берёт его из хранилища и заодно кладёт обратно на диск. Ссылки /uploads/... не меняются.
 *
 * Без переменных окружения S3_* всё работает по-старому, только с диском.
 */

type StorageConfig = {
  bucket: string;
  prefix: string;
  client: S3Client;
};

export function readStorageConfig(env: NodeJS.ProcessEnv = process.env): {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix: string;
} | null {
  const bucket = env.S3_BUCKET?.trim();
  const accessKeyId = env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY?.trim();
  if (!bucket || !accessKeyId || !secretAccessKey) {
    return null;
  }
  return {
    endpoint: env.S3_ENDPOINT?.trim() || undefined,
    region: env.S3_REGION?.trim() || "auto",
    bucket,
    accessKeyId,
    secretAccessKey,
    prefix: (env.S3_PREFIX?.trim() || "uploads").replace(/^\/+|\/+$/g, "")
  };
}

let cached: StorageConfig | null | undefined;

function storage(): StorageConfig | null {
  if (cached !== undefined) {
    return cached;
  }
  const config = readStorageConfig();
  cached = config
    ? {
        bucket: config.bucket,
        prefix: config.prefix,
        client: new S3Client({
          region: config.region,
          endpoint: config.endpoint,
          forcePathStyle: Boolean(config.endpoint),
          credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
        })
      }
    : null;
  if (cached) {
    console.log(`[storage] вложения копируются в хранилище, бакет ${cached.bucket}`);
  }
  return cached;
}

export function isExternalStorageEnabled(): boolean {
  return storage() !== null;
}

/** Имя файла без папок: только такие имена отдаём и копируем (защита от ../). */
export function isSafeUploadName(fileName: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/.test(fileName) && !fileName.includes("..");
}

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".ogg": "audio/ogg",
  ".opus": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".amr": "audio/amr",
  ".wav": "audio/wav",
  ".pdf": "application/pdf"
};

export function guessContentType(fileName: string): string {
  return CONTENT_TYPES[path.extname(fileName).toLowerCase()] || "application/octet-stream";
}

/**
 * Копирует файл из uploads/ в хранилище. Ошибку только логируем: сообщение клиенту важнее,
 * файл остаётся на диске до перезапуска.
 */
export async function mirrorUpload(uploadsDir: string, fileName: string, contentType?: string): Promise<void> {
  const config = storage();
  if (!config || !isSafeUploadName(fileName)) {
    return;
  }
  try {
    const body = await fs.promises.readFile(path.join(uploadsDir, fileName));
    await config.client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: `${config.prefix}/${fileName}`,
        Body: body,
        ContentType: contentType || guessContentType(fileName)
      })
    );
  } catch (error) {
    console.error(`[storage] не удалось скопировать ${fileName} в хранилище:`, error);
  }
}

/**
 * Для /uploads/<имя>: файла нет на диске (сервер перезапускался) — берём из хранилища,
 * отдаём клиенту и кладём обратно на диск, чтобы следующий запрос обслужил express.static.
 */
export function uploadsFallback(uploadsDir: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const config = storage();
    const fileName = decodeURIComponent(req.path.replace(/^\/+/, ""));
    if (!config || (req.method !== "GET" && req.method !== "HEAD") || !isSafeUploadName(fileName)) {
      next();
      return;
    }
    try {
      const object = await config.client.send(
        new GetObjectCommand({ Bucket: config.bucket, Key: `${config.prefix}/${fileName}` })
      );
      if (!object.Body) {
        next();
        return;
      }
      const bytes = Buffer.from(await object.Body.transformToByteArray());
      await fs.promises.mkdir(uploadsDir, { recursive: true });
      await fs.promises.writeFile(path.join(uploadsDir, fileName), bytes).catch(() => undefined);
      res.setHeader("Content-Type", object.ContentType || guessContentType(fileName));
      res.setHeader("Content-Length", String(bytes.length));
      res.setHeader("Cache-Control", "public, max-age=86400");
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      Readable.from(bytes).pipe(res);
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status !== 404 && (error as { name?: string }).name !== "NoSuchKey") {
        console.error(`[storage] не удалось получить ${fileName} из хранилища:`, error);
      }
      next();
    }
  };
}
