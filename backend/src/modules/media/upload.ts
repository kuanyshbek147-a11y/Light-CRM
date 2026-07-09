import fs from "fs";
import multer from "multer";
import path from "path";

export const uploadsDir = path.join(process.cwd(), "uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/ogg",
  "audio/ogg; codecs=opus",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/webm",
  "audio/amr",
  "audio/x-m4a",
  "audio/3gpp"
]);

export function resolveAttachmentType(mimeType: string): "image" | "video" | "audio" | null {
  if (mimeType.startsWith("video/")) {
    return "video";
  }
  if (mimeType.startsWith("image/")) {
    return "image";
  }
  if (mimeType.startsWith("audio/")) {
    return "audio";
  }
  return null;
}

export function resolveUploadMimeType(file: Express.Multer.File): string {
  const mime = file.mimetype.toLowerCase();
  if (mime.startsWith("audio/") || mime.startsWith("image/") || mime.startsWith("video/")) {
    return mime;
  }
  const name = file.originalname.toLowerCase();
  if (/\.(ogg|opus)$/.test(name)) {
    return "audio/ogg";
  }
  if (/\.(m4a|aac)$/.test(name)) {
    return "audio/mp4";
  }
  if (/\.(mp3)$/.test(name)) {
    return "audio/mpeg";
  }
  if (/\.(amr|3gp)$/.test(name)) {
    return "audio/amr";
  }
  if (/\.webm$/.test(name) && name.includes("voice")) {
    return "audio/webm";
  }
  if (/\.(png|webp|gif|jpe?g)$/.test(name)) {
    return mime || "image/jpeg";
  }
  if (/\.(mp4|mov)$/.test(name)) {
    return "video/mp4";
  }
  return mime;
}

export function placeholderBodyForAttachment(attachmentType: "image" | "video" | "audio" | null): string {
  if (attachmentType === "audio") {
    return "[Голосовое сообщение]";
  }
  if (attachmentType === "image") {
    return "[Изображение]";
  }
  if (attachmentType === "video") {
    return "[Видео]";
  }
  return "[Медиа]";
}

export const mediaUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      const uniquePrefix = `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
      cb(null, `${uniquePrefix}-${safeName}`);
    }
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = file.mimetype.toLowerCase();
    const name = file.originalname.toLowerCase();
    const hasAudioExtension = /\.(ogg|opus|m4a|aac|mp3|webm|amr|3gp|wav)$/.test(name);
    const allowed =
      allowedMimeTypes.has(mime) ||
      mime.startsWith("audio/") ||
      mime.startsWith("image/") ||
      mime.startsWith("video/") ||
      ((mime === "application/octet-stream" || mime === "") && hasAudioExtension);
    cb(null, allowed);
  }
});
