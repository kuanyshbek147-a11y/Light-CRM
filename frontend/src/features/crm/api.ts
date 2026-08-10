import { API_BASE_URL } from "../../shared/config/api";

const API = API_BASE_URL;

export type CrmTask = {
  id: string;
  title: string;
  status: string;
  due_at: string | null;
  created_at: string;
  updated_at?: string;
  conversation_id: string | null;
  deal_id: string | null;
  contact_name: string | null;
  channel: string | null;
  deal_stage: string | null;
  owner_name: string | null;
};

export type CrmContactListItem = {
  id: string;
  name: string;
  phone: string;
  city: string | null;
  client_type: string | null;
  category: string | null;
  channels: string[];
  conversations_count: number;
  deals_count: number;
  last_activity_at: string | null;
};

export type CrmContactDetails = {
  contact: {
    id: string;
    name: string;
    phone: string;
    city: string | null;
    inquiry_reason: string | null;
    client_type: string | null;
    category: string | null;
    created_at: string;
  };
  conversations: Array<{
    id: string;
    channel: string;
    status: string;
    updated_at: string;
    assigned_manager_id: string | null;
  }>;
  deals: Array<{
    id: string;
    conversation_id: string;
    stage: string;
    amount: string;
    next_step_at: string | null;
    updated_at: string;
  }>;
  timeline: Array<{
    id: string;
    kind: string;
    title: string;
    detail: string | null;
    created_at: string;
    conversation_id: string | null;
  }>;
};

export type GlobalSearchResult = {
  conversations: Array<{
    id: string;
    contact_name: string;
    phone: string | null;
    channel: string;
    status: string;
  }>;
  contacts: Array<{ id: string; name: string; phone: string; city: string | null }>;
  deals: Array<{
    id: string;
    conversation_id: string;
    stage: string;
    amount: string;
    contact_name: string;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    due_at: string | null;
    conversation_id: string | null;
    contact_name: string | null;
  }>;
};

export async function loadCrmTasks(token: string, status: "open" | "done" | "all" = "open"): Promise<CrmTask[]> {
  const response = await fetch(`${API}/tasks?status=${status}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    return [];
  }
  return (await response.json()) as CrmTask[];
}

export async function createCrmTask(
  token: string,
  payload: { title: string; dueAt?: string | null; conversationId?: string | null }
): Promise<CrmTask | null> {
  const response = await fetch(`${API}/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as CrmTask;
}

export async function updateCrmTask(
  token: string,
  taskId: string,
  payload: { title?: string; status?: string; dueAt?: string | null }
): Promise<CrmTask | null> {
  const response = await fetch(`${API}/tasks/${taskId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as CrmTask;
}

export async function loadCrmContacts(token: string, q = ""): Promise<CrmContactListItem[]> {
  const params = new URLSearchParams();
  if (q.trim()) {
    params.set("q", q.trim());
  }
  const response = await fetch(`${API}/contacts?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    return [];
  }
  return (await response.json()) as CrmContactListItem[];
}

export async function loadCrmContactDetails(token: string, contactId: string): Promise<CrmContactDetails | null> {
  const response = await fetch(`${API}/contacts/${contactId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as CrmContactDetails;
}

export async function mergeCrmContacts(
  token: string,
  targetContactId: string,
  sourceContactId: string
): Promise<boolean> {
  const response = await fetch(`${API}/contacts/${targetContactId}/merge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ sourceContactId })
  });
  return response.ok;
}

export async function updateDealDetails(
  token: string,
  dealId: string,
  payload: { stage?: string; amount?: number; next_step_at?: string | null }
): Promise<boolean> {
  const response = await fetch(`${API}/deals/${dealId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  return response.ok;
}

export async function globalSearch(token: string, q: string): Promise<GlobalSearchResult> {
  const response = await fetch(`${API}/search?q=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    return { conversations: [], contacts: [], deals: [], tasks: [] };
  }
  return (await response.json()) as GlobalSearchResult;
}

export type FollowUpSettings = {
  enabled: boolean;
  onStageChange: boolean;
  stageDueHours: number;
  onSilence: boolean;
  silenceHours: number;
  skipClosedStages: boolean;
};

export async function loadFollowUpSettings(token: string): Promise<FollowUpSettings | null> {
  const response = await fetch(`${API}/follow-up/settings`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as FollowUpSettings;
}

export async function saveFollowUpSettingsApi(
  token: string,
  payload: FollowUpSettings
): Promise<FollowUpSettings | null> {
  const response = await fetch(`${API}/follow-up/settings`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as FollowUpSettings;
}
