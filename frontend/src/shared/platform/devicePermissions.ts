import { Capacitor } from "@capacitor/core";

export type PermissionRequestResult = "granted" | "denied" | "unavailable";

async function getMicrophonePlugin() {
  if (!Capacitor.isNativePlatform()) {
    return null;
  }
  const { Microphone } = await import("@mozartec/capacitor-microphone");
  return Microphone;
}

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export async function ensureMicrophonePermission(): Promise<PermissionRequestResult> {
  if (!Capacitor.isNativePlatform()) {
    return "granted";
  }

  try {
    const Microphone = await getMicrophonePlugin();
    if (!Microphone) {
      return "unavailable";
    }

    const current = await Microphone.checkPermissions();
    if (current.microphone === "granted" || current.microphone === "limited") {
      return "granted";
    }

    const requested = await Microphone.requestPermissions();
    if (requested.microphone === "granted" || requested.microphone === "limited") {
      return "granted";
    }

    return "denied";
  } catch {
    return "unavailable";
  }
}

export async function ensureCameraPermission(): Promise<PermissionRequestResult> {
  if (!Capacitor.isNativePlatform()) {
    return "granted";
  }

  try {
    const { Camera } = await import("@capacitor/camera");
    const current = await Camera.checkPermissions();
    if (current.camera === "granted" || current.camera === "limited") {
      return "granted";
    }

    const requested = await Camera.requestPermissions({ permissions: ["camera", "photos"] });
    if (requested.camera === "granted" || requested.camera === "limited") {
      return "granted";
    }

    return "denied";
  } catch {
    return "granted";
  }
}
