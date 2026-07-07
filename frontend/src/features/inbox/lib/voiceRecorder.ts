export function pickVoiceRecorderMimeType(): string {
  const candidates = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm", "audio/mp4", ""];
  for (const type of candidates) {
    if (!type || (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type))) {
      return type;
    }
  }
  return "";
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
