export function pickVoiceRecorderMimeType(): string {
  const candidates = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm", "audio/mp4", ""];
  for (const type of candidates) {
    if (!type || (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type))) {
      return type;
    }
  }
  return "";
}

export function mimeTypeFromAudioFileName(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".ogg") || lower.endsWith(".opus")) {
    return "audio/ogg";
  }
  if (lower.endsWith(".mp3")) {
    return "audio/mpeg";
  }
  if (lower.endsWith(".m4a") || lower.endsWith(".aac")) {
    return "audio/mp4";
  }
  if (lower.endsWith(".amr") || lower.endsWith(".3gp")) {
    return "audio/amr";
  }
  if (lower.endsWith(".webm")) {
    return "audio/webm";
  }
  return "audio/mp4";
}

export function isAudioFile(file: File): boolean {
  const type = file.type.toLowerCase();
  if (type.startsWith("audio/")) {
    return true;
  }
  return /\.(ogg|opus|m4a|aac|mp3|webm|amr|3gp|wav)$/i.test(file.name);
}

export function normalizeVoiceFile(file: File): File {
  const type = file.type.toLowerCase();
  if (type === "audio/aac" || type === "audio/x-m4a") {
    return new File([file], file.name, { type: "audio/mp4", lastModified: file.lastModified });
  }
  if (type.startsWith("audio/") && type !== "application/octet-stream") {
    return file;
  }
  const mimeType = mimeTypeFromAudioFileName(file.name);
  return new File([file], file.name, { type: mimeType, lastModified: file.lastModified });
}

export function extensionForRecordedAudio(mimeType: string): string {
  const mime = mimeType.toLowerCase();
  if (mime.includes("ogg")) {
    return "ogg";
  }
  if (mime.includes("mp4") || mime.includes("aac")) {
    return "m4a";
  }
  return "webm";
}

export function formatRecordingDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
