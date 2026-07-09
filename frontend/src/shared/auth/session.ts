import { API_BASE_URL } from "../config/api";

export const SESSION_TOKEN_KEY = "lightcrm.token";
export const SESSION_USER_KEY = "lightcrm.user";

export type SessionUser = {
  id?: string;
  email: string;
  fullName: string;
  role: string;
  login: string | null;
  color?: string | null;
};

export function readStoredSession(): { token: string; user: SessionUser | null } {
  if (typeof window === "undefined") {
    return { token: "", user: null };
  }

  const token = localStorage.getItem(SESSION_TOKEN_KEY) || "";
  const rawUser = localStorage.getItem(SESSION_USER_KEY);
  if (!rawUser) {
    return { token, user: null };
  }

  try {
    return { token, user: JSON.parse(rawUser) as SessionUser };
  } catch {
    localStorage.removeItem(SESSION_USER_KEY);
    return { token, user: null };
  }
}

export function persistSession(token: string, user: SessionUser | null): void {
  localStorage.setItem(SESSION_TOKEN_KEY, token);
  if (user) {
    localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(SESSION_USER_KEY);
  }
}

export function clearStoredSession(): void {
  localStorage.removeItem(SESSION_TOKEN_KEY);
  localStorage.removeItem(SESSION_USER_KEY);
}

export type SessionValidationResult =
  | { status: "valid"; user: SessionUser }
  | { status: "invalid" }
  | { status: "unreachable" };

export async function validateStoredSession(token: string): Promise<SessionValidationResult> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.status === 401 || response.status === 403) {
      return { status: "invalid" };
    }

    if (!response.ok) {
      return { status: "unreachable" };
    }

    const data = (await response.json()) as { user?: SessionUser };
    if (!data.user) {
      return { status: "invalid" };
    }

    return { status: "valid", user: data.user };
  } catch {
    return { status: "unreachable" };
  }
}
