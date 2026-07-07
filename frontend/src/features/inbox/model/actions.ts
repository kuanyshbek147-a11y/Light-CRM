import { loadConversations, loadMessages } from "../api/inboxApi";
import { loadKnowledgeArticles, loadScripts } from "../api/contentApi";
import type { Conversation, InboxFilters, Message } from "./types";
import type { KnowledgeArticle, MessageScript } from "./types";

export type CreatedMessageResponse = {
  id: string;
  created_at: string;
  direction?: "outgoing";
  body?: string;
  attachment_url?: string | null;
  attachment_type?: Message["attachment_type"];
  attachment_name?: string | null;
  meta_media_id?: string | null;
  whatsappDeliveryPending?: boolean;
  whatsappDeliveryFailed?: boolean;
  deliveryError?: string | null;
};

export function appendOutgoingMessage(
  setMessages: (updater: (prev: Message[]) => Message[]) => void,
  created: CreatedMessageResponse
): void {
  setMessages((prev) => {
    if (prev.some((message) => message.id === created.id)) {
      return prev;
    }
    return [
      ...prev,
      {
        id: created.id,
        direction: "outgoing",
        body: created.body || "",
        attachment_url: created.attachment_url ?? null,
        attachment_type: created.attachment_type ?? null,
        attachment_name: created.attachment_name ?? null,
        meta_media_id: created.meta_media_id ?? null,
        created_at: created.created_at
      }
    ];
  });
}

export function patchOutgoingMessage(
  setMessages: (updater: (prev: Message[]) => Message[]) => void,
  payload: {
    messageId: string;
    metaMediaId?: string | null;
  }
): void {
  setMessages((prev) =>
    prev.map((message) =>
      message.id === payload.messageId
        ? {
            ...message,
            meta_media_id: payload.metaMediaId ?? message.meta_media_id ?? null
          }
        : message
    )
  );
}

type MetricsQuery = number | { days: number; from?: string; to?: string };

type RefreshConversationListParams = {
  token: string;
  search: string;
  filters: InboxFilters;
  setConversations: (data: Conversation[]) => void;
};

type RefreshAfterMessageParams<TMetrics> = {
  token: string;
  conversationId: string;
  search: string;
  filters: InboxFilters;
  metricsQuery: MetricsQuery;
  setMessages: (data: Message[]) => void;
  setConversations: (data: Conversation[]) => void;
  setMetrics: (data: TMetrics) => void;
  loadMetrics: (token: string, setMetrics: (data: TMetrics) => void, query: MetricsQuery) => Promise<void>;
};

export async function refreshConversationList(params: RefreshConversationListParams): Promise<void> {
  const { token, search, filters, setConversations } = params;
  await loadConversations(token, search, filters, setConversations);
}

export async function refreshAfterMessage<TMetrics>(params: RefreshAfterMessageParams<TMetrics>): Promise<void> {
  const { token, conversationId, search, filters, setMessages, setConversations, setMetrics, loadMetrics, metricsQuery } =
    params;
  await loadMessages(token, conversationId, setMessages);
  void loadConversations(token, search, filters, setConversations);
  void loadMetrics(token, setMetrics, metricsQuery);
}

export function refreshConversationListBackground(params: RefreshConversationListParams): void {
  void refreshConversationList(params);
}

type RefreshScriptsParams = {
  token: string;
  setScripts: (data: MessageScript[]) => void;
};

type RefreshKnowledgeParams = {
  token: string;
  setKnowledgeArticles: (data: KnowledgeArticle[]) => void;
};

export async function refreshScripts(params: RefreshScriptsParams): Promise<void> {
  const { token, setScripts } = params;
  await loadScripts(token, setScripts);
}

export async function refreshKnowledge(params: RefreshKnowledgeParams): Promise<void> {
  const { token, setKnowledgeArticles } = params;
  await loadKnowledgeArticles(token, setKnowledgeArticles);
}
