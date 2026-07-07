import { Capacitor } from "@capacitor/core";
import { mimeTypeFromAudioFileName, normalizeVoiceFile } from "./voiceRecorder";

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

export async function startNativeVoiceRecording(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error("native_only");
  }
  const { Microphone } = await import("@mozartec/capacitor-microphone");
  await Microphone.startRecording();
}

export async function stopNativeVoiceRecording(): Promise<File> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error("native_only");
  }
  const { Microphone } = await import("@mozartec/capacitor-microphone");
  const recording = await Microphone.stopRecording();
  const extension = recording.format || "m4a";
  const mimeType = recording.mimeType || mimeTypeFromAudioFileName(`voice.${extension}`);
  const fileName = `voice-${Date.now()}.${extension}`;

  if (recording.base64String) {
    const blob = base64ToBlob(recording.base64String, mimeType);
    return normalizeVoiceFile(new File([blob], fileName, { type: mimeType }));
  }

  const dataUrl = recording.dataUrl || `data:${mimeType};base64,${recording.base64String || ""}`;
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return normalizeVoiceFile(new File([blob], fileName, { type: mimeType }));
}
