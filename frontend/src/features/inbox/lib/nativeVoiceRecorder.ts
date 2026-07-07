import { Capacitor } from "@capacitor/core";

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
  const mimeType = recording.mimeType || "audio/mp4";
  const extension = recording.format || "m4a";
  const dataUrl = recording.dataUrl || `data:${mimeType};base64,${recording.base64String}`;
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], `voice-${Date.now()}.${extension}`, { type: mimeType });
}
