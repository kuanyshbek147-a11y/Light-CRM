import { API_BASE_URL } from "../../../shared/config/api";
import type { ContactCard, Conversation, InboxFilters, Message } from "../model/types";

const API = API_BASE_URL;

export async function loadConversations(
  token: string,
  search: string,
  filters: InboxFilters,
  setConversations: (data: Conversation[]) => void
): Promise<Conversation[]> {
  const params = new URLSearchParams({
    q: search,
    city: filters.city,
    inquiryReason: filters.inquiryReason,
    clientType: filters.clientType,
    category: filters.category,
    priority: filters.priority,
    attention: filters.attention
  });
  const response = await fetch(`${API}/conversations?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = (await response.json()) as Conversation[];
  setConversations(data);
  return data;
}

export async function loadMessages(
  token: string,
  conversationId: string,
  setMessages: (data: Message[]) => void
): Promise<void> {
  const response = await fetch(`${API}/conversations/${conversationId}/messages`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  setMessages(await response.json());
}

export async function loadContactCard(
  token: string,
  conversationId: string,
  setContactCard: (data: ContactCard | null) => void
): Promise<void> {
  const response = await fetch(`${API}/conversations/${conversationId}/contact`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  setContactCard(await response.json());
}

export async function updateConversationPriority(
  token: string,
  conversationId: string,
  priority: string
): Promise<void> {
  await fetch(`${API}/conversations/${conversationId}/priority`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ priority })
  });
}

export async function assignConversationManager(
  token: string,
  conversationId: string,
  managerId: string
): Promise<void> {
  await fetch(`${API}/conversations/${conversationId}/assign-manager`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ managerId })
  });
}

export async function moveConversationStage(
  token: string,
  conversationId: string,
  stage: string
): Promise<void> {
  await fetch(`${API}/deals/conversation/${conversationId}/stage`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ stage })
  });
}

export async function createConversationTask(
  token: string,
  conversationId: string,
  title: string
): Promise<void> {
  await fetch(`${API}/conversations/${conversationId}/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ title })
  });
}

export async function markSlaFollowUpDone(
  token: string,
  conversationId: string
): Promise<void> {
  await fetch(`${API}/conversations/${conversationId}/tasks/sla-follow-up/done`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function acknowledgeSlaEscalation(
  token: string,
  conversationId: string
): Promise<void> {
  await fetch(`${API}/conversations/${conversationId}/sla-escalation/ack`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function deferSlaEscalation(
  token: string,
  conversationId: string,
  minutes = 30
): Promise<void> {
  await fetch(`${API}/conversations/${conversationId}/sla-escalation/defer`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ minutes })
  });
}

export async function setConversationStatus(
  token: string,
  conversationId: string,
  status: "open" | "closed"
): Promise<void> {
  await fetch(`${API}/conversations/${conversationId}/status`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ status })
  });
}
