import { API_BASE_URL } from "../../shared/config/api";

const API = API_BASE_URL;

export type StaffMember = {
  id: string;
  full_name: string;
  role: string;
  color: string | null;
};

export type StaffMessage = {
  id: string;
  thread_id: string;
  workspace_id: string;
  author_user_id: string | null;
  author_name: string | null;
  author_color: string | null;
  body: string;
  task_id: string | null;
  conversation_id: string | null;
  is_system: boolean;
  created_at: string;
};

export type StaffThread = {
  id: string;
  workspace_id: string;
  kind: "channel" | "dm";
  title: string;
  dm_key: string | null;
  updated_at: string;
  created_at: string;
  last_message_body: string | null;
  last_message_at: string | null;
  unread_count: number;
  peer_user_id?: string | null;
  peer_name?: string | null;
};

async function authJson<T>(token: string, path: string, init?: RequestInit): Promise<T | null> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {})
    }
  });
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as T;
}

export async function loadStaffMembers(token: string): Promise<StaffMember[]> {
  return (await authJson<StaffMember[]>(token, "/staff/members")) || [];
}

export async function loadStaffThreads(token: string): Promise<StaffThread[]> {
  return (await authJson<StaffThread[]>(token, "/staff/threads")) || [];
}

export async function loadStaffUnreadCount(token: string): Promise<number> {
  const result = await authJson<{ count: number }>(token, "/staff/unread-count");
  return Number(result?.count || 0);
}

export async function openStaffDm(token: string, userId: string): Promise<StaffThread | null> {
  return authJson<StaffThread>(token, "/staff/threads/dm", {
    method: "POST",
    body: JSON.stringify({ userId })
  });
}

export async function loadStaffMessages(
  token: string,
  threadId: string
): Promise<StaffMessage[]> {
  return (await authJson<StaffMessage[]>(token, `/staff/threads/${threadId}/messages`)) || [];
}

export async function sendStaffMessage(
  token: string,
  threadId: string,
  payload: { body: string; conversationId?: string | null }
): Promise<StaffMessage | null> {
  return authJson<StaffMessage>(token, `/staff/threads/${threadId}/messages`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function markStaffThreadRead(token: string, threadId: string): Promise<boolean> {
  const result = await authJson<{ ok: true }>(token, `/staff/threads/${threadId}/read`, {
    method: "POST",
    body: "{}"
  });
  return Boolean(result?.ok);
}

export async function createStaffThreadTask(
  token: string,
  threadId: string,
  payload: {
    title: string;
    ownerUserId: string;
    dueAt?: string | null;
    conversationId?: string | null;
  }
): Promise<{ taskId: string; message: StaffMessage } | null> {
  return authJson(token, `/staff/threads/${threadId}/tasks`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}
