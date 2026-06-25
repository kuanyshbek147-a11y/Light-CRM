import { API_BASE_URL } from "../../shared/config/api";

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };
}

export type PlatformWorkspace = {
  id: string;
  name: string;
  createdAt: string;
  usersCount: number;
  conversationsCount: number;
  whatsappConnected: boolean;
  whatsappPhoneNumberId: string | null;
};

export type PlatformWorkspaceUser = {
  id: string;
  fullName: string;
  email: string;
  login: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
};

export type PlatformWorkspaceDetail = {
  workspace: {
    id: string;
    name: string;
    createdAt: string;
  };
  users: PlatformWorkspaceUser[];
  whatsapp: {
    connected: boolean;
    wabaId: string | null;
    phoneNumberId: string | null;
    connectedAt: string | null;
  };
};

export async function loadPlatformWorkspaces(token: string): Promise<PlatformWorkspace[]> {
  const response = await fetch(`${API_BASE_URL}/platform/workspaces`, {
    headers: authHeaders(token)
  });
  const data = (await response.json()) as { workspaces?: PlatformWorkspace[]; error?: string };
  if (!response.ok) {
    throw new Error(data.error || "Не удалось загрузить компании");
  }
  return data.workspaces || [];
}

export async function createPlatformWorkspace(
  token: string,
  payload: {
    name: string;
    adminFullName: string;
    adminEmail: string;
    adminLogin: string;
    adminPassword: string;
  }
): Promise<{ workspaceId: string }> {
  const response = await fetch(`${API_BASE_URL}/platform/workspaces`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  const data = (await response.json()) as { workspaceId?: string; error?: string };
  if (!response.ok || !data.workspaceId) {
    throw new Error(data.error || "Не удалось создать компанию");
  }
  return { workspaceId: data.workspaceId };
}

export async function loadPlatformWorkspaceDetail(
  token: string,
  workspaceId: string
): Promise<PlatformWorkspaceDetail> {
  const response = await fetch(`${API_BASE_URL}/platform/workspaces/${workspaceId}`, {
    headers: authHeaders(token)
  });
  const data = (await response.json()) as PlatformWorkspaceDetail & { error?: string };
  if (!response.ok || !data.workspace) {
    throw new Error(data.error || "Компания не найдена");
  }
  return data;
}

export async function createPlatformWorkspaceUser(
  token: string,
  workspaceId: string,
  payload: {
    fullName: string;
    email: string;
    login: string;
    password: string;
    role: "admin" | "manager";
  }
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/platform/workspaces/${workspaceId}/users`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  const data = (await response.json()) as { error?: string };
  if (!response.ok) {
    throw new Error(data.error || "Не удалось создать пользователя");
  }
}

export async function updatePlatformUser(
  token: string,
  userId: string,
  payload: { isActive?: boolean; password?: string; fullName?: string }
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/platform/users/${userId}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  const data = (await response.json()) as { error?: string };
  if (!response.ok) {
    throw new Error(data.error || "Не удалось обновить пользователя");
  }
}
