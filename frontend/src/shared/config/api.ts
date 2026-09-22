const RENDER_API_ORIGIN = "https://light-crm-backend.onrender.com";
const LOCAL_API_ORIGIN = "http://localhost:4000";

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function resolveApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_URL as string | undefined;
  if (fromEnv?.trim()) {
    return fromEnv.replace(/\/+$/, "");
  }

  if (typeof window !== "undefined" && window.location.hostname.endsWith("netlify.app")) {
    return "/api";
  }

  // Vite local/dev without VITE_API_URL must hit the local backend, not production Render.
  if (typeof window !== "undefined" && isLocalHostname(window.location.hostname)) {
    return `${LOCAL_API_ORIGIN}/api`;
  }

  if (import.meta.env.DEV) {
    return `${LOCAL_API_ORIGIN}/api`;
  }

  return `${RENDER_API_ORIGIN}/api`;
}

export function resolveSocketBaseUrl(): string {
  const api = resolveApiBaseUrl();
  if (api === "/api" || api.startsWith("/")) {
    if (typeof window !== "undefined" && isLocalHostname(window.location.hostname)) {
      return LOCAL_API_ORIGIN;
    }
    return RENDER_API_ORIGIN;
  }
  return api.replace(/\/api\/?$/, "") || RENDER_API_ORIGIN;
}

export const API_BASE_URL = resolveApiBaseUrl();
export const SOCKET_BASE_URL = resolveSocketBaseUrl();
