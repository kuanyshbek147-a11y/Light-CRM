import { loadConversations, loadMessages } from "../api/inboxApi";
import { loadKnowledgeArticles, loadScripts } from "../api/contentApi";
import type { Conversation, InboxFilters, Message } from "./types";
import type { KnowledgeArticle, MessageScript } from "./types";

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
  const {
    token,
    conversationId,
    search,
    filters,
    metricsQuery,
    setMessages,
    setConversations,
    setMetrics,
    loadMetrics
  } = params;
  await loadMessages(token, conversationId, setMessages);
  await loadConversations(token, search, filters, setConversations);
  await loadMetrics(token, setMetrics, metricsQuery);
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
