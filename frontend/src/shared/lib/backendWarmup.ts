import { SOCKET_BASE_URL } from "../config/api";

const HEALTH_URL = `${SOCKET_BASE_URL.replace(/\/+$/, "")}/health`;
const KEEP_ALIVE_MS = 8 * 60 * 1000;
const WARMUP_STORAGE_KEY = "crm_backend_warmup_at";

let keepAliveTimer: number | null = null;
let warmupInFlight: Promise<boolean> | null = null;

/** Ping backend so Render Free wakes before login / stays warm while the tab is open. */
export function pingBackendHealth(timeoutMs = 25_000): Promise<boolean> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  return fetch(HEALTH_URL, {
    method: "GET",
    cache: "no-store",
    signal: controller.signal
  })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => window.clearTimeout(timer));
}

export function warmupBackend(): Promise<boolean> {
  if (warmupInFlight) {
    return warmupInFlight;
  }
  warmupInFlight = pingBackendHealth().finally(() => {
    try {
      window.sessionStorage.setItem(WARMUP_STORAGE_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    window.setTimeout(() => {
      warmupInFlight = null;
    }, 5_000);
  });
  return warmupInFlight;
}

export function startBackendKeepAlive(): void {
  if (typeof window === "undefined") {
    return;
  }
  void warmupBackend();
  if (keepAliveTimer !== null) {
    return;
  }
  keepAliveTimer = window.setInterval(() => {
    if (document.visibilityState === "hidden") {
      return;
    }
    void pingBackendHealth(15_000);
  }, KEEP_ALIVE_MS);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void warmupBackend();
    }
  });
}
