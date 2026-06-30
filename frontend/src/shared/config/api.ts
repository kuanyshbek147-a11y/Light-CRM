const RENDER_API_ORIGIN = "https://light-crm-backend.onrender.com";

function resolveApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_URL as string | undefined;
  if (fromEnv?.trim()) {
    return fromEnv.replace(/\/+$/, "");
  }

  if (typeof window !== "undefined" && window.location.hostname.endsWith("netlify.app")) {
    return "/api";
  }

  return `${RENDER_API_ORIGIN}/api`;
}

export function resolveSocketBaseUrl(): string {
  const api = resolveApiBaseUrl();
  if (api === "/api" || api.startsWith("/")) {
    return RENDER_API_ORIGIN;
  }
  return api.replace(/\/api\/?$/, "") || RENDER_API_ORIGIN;
}

export const API_BASE_URL = resolveApiBaseUrl();
export const SOCKET_BASE_URL = resolveSocketBaseUrl();
