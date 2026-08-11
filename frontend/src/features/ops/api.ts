import { API_BASE_URL } from "../../shared/config/api";

const API = API_BASE_URL;

export type QueueItem = {
  id: string;
  contact_name: string;
  phone: string | null;
  channel: string;
  status: string;
  priority: string | null;
  first_response_due_at: string | null;
  updated_at: string;
  sla_overdue: boolean;
};

export async function loadOpsQueue(token: string): Promise<QueueItem[]> {
  const response = await fetch(`${API}/ops/queue`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) return [];
  return (await response.json()) as QueueItem[];
}

export async function createOpsBackup(
  token: string
): Promise<{ fileName: string; relativePath: string; bytes: number } | null> {
  const response = await fetch(`${API}/ops/backups`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) return null;
  return (await response.json()) as { fileName: string; relativePath: string; bytes: number };
}

export async function saveOpsAlertChat(
  token: string,
  telegramChatId: string
): Promise<boolean> {
  const response = await fetch(`${API}/ops/alerts`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ telegramChatId })
  });
  return response.ok;
}
