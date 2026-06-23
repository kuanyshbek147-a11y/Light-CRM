function resolveApiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_URL as string | undefined;
  if (fromEnv?.trim()) {
    return fromEnv.replace(/\/+$/, "");
  }

  if (typeof window !== "undefined" && window.location.hostname.endsWith("netlify.app")) {
    return "/api";
  }

  return "https://light-crm-backend.onrender.com/api";
}

export const API_BASE_URL = resolveApiBaseUrl();
