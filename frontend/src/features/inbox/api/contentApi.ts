import { API_BASE_URL } from "../../../shared/config/api";
import type { KnowledgeArticle, MessageScript } from "../model/types";

const API = API_BASE_URL;

export async function loadScripts(token: string, setScripts: (data: MessageScript[]) => void): Promise<void> {
  const response = await fetch(`${API}/conversations/scripts`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  setScripts(await response.json());
}

export async function upsertScript(
  token: string,
  payload: { title: string; category: string; body: string },
  editingScriptId?: string
): Promise<boolean> {
  const endpoint = editingScriptId
    ? `${API}/conversations/scripts/${editingScriptId}`
    : `${API}/conversations/scripts`;
  const method = editingScriptId ? "PATCH" : "POST";

  const response = await fetch(endpoint, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  return response.ok;
}

export async function removeScript(token: string, scriptId: string): Promise<void> {
  await fetch(`${API}/conversations/scripts/${scriptId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function loadKnowledgeArticles(
  token: string,
  setKnowledgeArticles: (data: KnowledgeArticle[]) => void
): Promise<void> {
  const response = await fetch(`${API}/conversations/knowledge-base`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  setKnowledgeArticles(await response.json());
}

export async function createKnowledgeArticleApi(
  token: string,
  payload: { title: string; url: string; category: string; summary: string }
): Promise<boolean> {
  const response = await fetch(`${API}/conversations/knowledge-base`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  return response.ok;
}

export async function deleteKnowledgeArticleApi(token: string, articleId: string): Promise<void> {
  await fetch(`${API}/conversations/knowledge-base/${articleId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function sendConversationTextMessage(
  token: string,
  conversationId: string,
  body: string
): Promise<void> {
  await fetch(`${API}/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ body })
  });
}
