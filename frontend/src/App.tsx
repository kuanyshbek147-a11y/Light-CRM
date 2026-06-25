import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { API_BASE_URL } from "./shared/config/api";
import { InboxSidebar } from "./features/inbox/InboxSidebar";
import { InboxThread } from "./features/inbox/InboxThread";
import {
  assignConversationManager as apiAssignConversationManager,
  acknowledgeSlaEscalation as apiAcknowledgeSlaEscalation,
  createConversationTask,
  deferSlaEscalation as apiDeferSlaEscalation,
  loadContactCard,
  loadConversations,
  loadMessages,
  markSlaFollowUpDone as apiMarkSlaFollowUpDone,
  moveConversationStage as apiMoveConversationStage,
  setConversationStatus as apiSetConversationStatus,
  updateConversationPriority as apiUpdateConversationPriority
} from "./features/inbox/api/inboxApi";
import {
  createKnowledgeArticleApi,
  deleteKnowledgeArticleApi,
  removeScript,
  sendConversationTextMessage,
  upsertScript
} from "./features/inbox/api/contentApi";
import type {
  ContactCard,
  Conversation,
  InboxFilters,
  KnowledgeArticle,
  Message,
  MessageScript,
  QuickActionManager,
  SavedInboxFilterPreset
} from "./features/inbox/model/types";
import {
  refreshAfterMessage,
  refreshConversationList,
  refreshKnowledge,
  refreshScripts
} from "./features/inbox/model/actions";
import { IntegrationsPanel } from "./features/integrations/IntegrationsPanel";
import { PlatformPanel } from "./features/platform/PlatformPanel";

type Deal = {
  id: string;
  conversation_id: string;
  stage: string;
  amount: string;
  contact_name: string;
  manager_name: string;
};

type PipelineStage = {
  id: string;
  name: string;
  position: number;
};

type Metrics = {
  sentMessages7d: number;
  handledConversations7d: number;
  firstResponseMinutes: number;
  totalConversations: number;
  openConversations: number;
  closedConversations7d: number;
  messages7d: number;
  openToCloseMinutes: number;
  avgMessagesPerConversation: number;
  whatsappConversations: number;
  telegramConversations: number;
  managersKpi?: Array<{
    managerId: string;
    managerName: string;
    dialogsHandled: number;
    outgoingMessages: number;
  }>;
  stageKpi?: Array<{
    stageName: string;
    dealsCount: number;
    dealsAmount: number;
  }>;
  slaEscalations?: number;
  slaAverageDelayMinutes?: number;
  slaManagers?: Array<{
    managerId: string;
    managerName: string;
    escalatedCount: number;
    avgDelayMinutes: number;
  }>;
  periodDays?: number;
  dailySeries: Array<{
    day: string;
    messages: number;
    dialogs: number;
    closed: number;
  }>;
};

type MetricSnapshot = {
  periodStart: string;
  periodEnd: string;
  totalConversations: number;
  openConversations: number;
  closedConversations: number;
  messages: number;
  createdAt: string;
};

type SessionUser = {
  email: string;
  fullName: string;
  role: string;
  login: string | null;
};

type AutoAssignmentStrategy = "round_robin" | "least_open_load";
type AutoAssignmentLoadItem = {
  managerId: string;
  managerName: string;
  openConversations: number;
};

type ToastKind = "success" | "error";

const API = API_BASE_URL;
const SESSION_TOKEN_KEY = "lightcrm.token";
const SESSION_USER_KEY = "lightcrm.user";
const INBOX_FILTER_PRESETS_KEY = "lightcrm.inboxFilterPresets";
const DEFAULT_INBOX_FILTERS: InboxFilters = {
  city: "",
  inquiryReason: "",
  clientType: "",
  category: "",
  priority: "",
  attention: ""
};
const EMOJI_BUTTON_ICON = "\uD83D\uDE42";
const EMOJI_OPTIONS = [
  "\uD83D\uDE00",
  "\uD83D\uDE01",
  "\uD83D\uDE02",
  "\uD83D\uDE0A",
  "\uD83D\uDE0D",
  "\uD83D\uDE18",
  "\uD83D\uDC4D",
  "\uD83D\uDC4F",
  "\uD83D\uDE4F",
  "\uD83D\uDD25",
  "\uD83C\uDF89",
  "\u2764\uFE0F"
] as const;
const DEFAULT_PIPELINE_STAGES = ["new", "qualified", "proposal", "won", "lost"] as const;

const UI = {
  landingBadge: "\u0043\u0052\u004d \u0434\u043b\u044f WhatsApp \u0438 Telegram",
  landingTitle: "\u0423\u043f\u0440\u0430\u0432\u043b\u044f\u0439\u0442\u0435 \u0432\u0441\u0435\u043c\u0438 \u0434\u0438\u0430\u043b\u043e\u0433\u0430\u043c\u0438 \u0441 \u043a\u043b\u0438\u0435\u043d\u0442\u0430\u043c\u0438 \u0432 \u043e\u0434\u043d\u043e\u043c \u0441\u043e\u0432\u0440\u0435\u043c\u0435\u043d\u043d\u043e\u043c \u043e\u043a\u043d\u0435.",
  landingSubtitle:
    "\u041e\u0442\u0432\u0435\u0447\u0430\u0439\u0442\u0435 \u0431\u044b\u0441\u0442\u0440\u0435\u0435, \u0441\u0435\u0433\u043c\u0435\u043d\u0442\u0438\u0440\u0443\u0439\u0442\u0435 \u043a\u043b\u0438\u0435\u043d\u0442\u043e\u0432, \u043e\u0431\u043d\u043e\u0432\u043b\u044f\u0439\u0442\u0435 \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0438 \u0438 \u043a\u043e\u043d\u0442\u0440\u043e\u043b\u0438\u0440\u0443\u0439\u0442\u0435 \u043f\u0440\u043e\u0434\u0430\u0436\u0438 \u0438\u0437 \u0435\u0434\u0438\u043d\u043e\u0433\u043e inbox.",
  unifiedInbox: "\u0415\u0434\u0438\u043d\u044b\u0439 inbox",
  unifiedInboxHint: "\u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044f \u0438\u0437 WhatsApp \u0438 Telegram \u0432 \u043e\u0434\u043d\u043e\u043c \u0438\u043d\u0442\u0435\u0440\u0444\u0435\u0439\u0441\u0435.",
  smartCohorts: "\u0423\u043c\u043d\u044b\u0435 \u043a\u043e\u0433\u043e\u0440\u0442\u044b",
  smartCohortsHint: "\u0424\u0438\u043b\u044c\u0442\u0440\u0443\u0439\u0442\u0435 \u043f\u043e \u0433\u043e\u0440\u043e\u0434\u0443, \u043f\u0440\u0438\u0447\u0438\u043d\u0435, \u0442\u0438\u043f\u0443 \u0438 \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0438.",
  fastReplies: "\u0411\u044b\u0441\u0442\u0440\u044b\u0435 \u043e\u0442\u0432\u0435\u0442\u044b",
  fastRepliesHint: "\u041e\u0442\u043a\u0440\u044b\u0432\u0430\u0439\u0442\u0435 \u0434\u0438\u0430\u043b\u043e\u0433 \u0438 \u043e\u0442\u0432\u0435\u0447\u0430\u0439\u0442\u0435 \u043a\u043b\u0438\u0435\u043d\u0442\u0430\u043c \u043f\u0440\u044f\u043c\u043e \u0438\u0437 CRM.",
  brandTitle: "Light CRM",
  demoAccess: "\u0414\u0435\u043c\u043e-\u0434\u043e\u0441\u0442\u0443\u043f",
  openWorkspace: "\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u0440\u0430\u0431\u043e\u0447\u0435\u0435 \u043f\u0440\u043e\u0441\u0442\u0440\u0430\u043d\u0441\u0442\u0432\u043e",
  loginText:
    "\u0412\u043e\u0439\u0434\u0438\u0442\u0435 \u043b\u043e\u0433\u0438\u043d \u0438 \u043f\u0430\u0440\u043e\u043b\u044c \u043e\u043f\u0435\u0440\u0430\u0442\u043e\u0440\u0430. \u041c\u043e\u0436\u043d\u043e \u0443\u043a\u0430\u0437\u0430\u0442\u044c \u043b\u043e\u0433\u0438\u043d \u0438\u043b\u0438 email.",
  loginLabel: "\u041b\u043e\u0433\u0438\u043d \u0438\u043b\u0438 email",
  loginPlaceholder: "operator",
  passwordPlaceholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
  signIn: "\u0412\u043e\u0439\u0442\u0438",
  loginFailed: "\u041d\u0435\u0432\u0435\u0440\u043d\u044b\u0439 \u043b\u043e\u0433\u0438\u043d \u0438\u043b\u0438 \u043f\u0430\u0440\u043e\u043b\u044c",
  demoOperatorHint: "\u041e\u043f\u0435\u0440\u0430\u0442\u043e\u0440: \u043b\u043e\u0433\u0438\u043d operator, \u043f\u0430\u0440\u043e\u043b\u044c demo123",
  demoAdminHint:
    "\u0410\u0434\u043c\u0438\u043d: \u043b\u043e\u0433\u0438\u043d admin \u0438\u043b\u0438 admin@demo.local, \u043f\u0430\u0440\u043e\u043b\u044c demo123. \u0421\u0443\u043f\u0435\u0440-\u0430\u0434\u043c\u0438\u043d: superadmin / superadmin123",
  signOut: "\u0412\u044b\u0445\u043e\u0434",
  password: "\u041f\u0430\u0440\u043e\u043b\u044c",
  workspaceMenu: "\u041c\u0435\u043d\u044e",
  menuDialogs: "\u0414\u0438\u0430\u043b\u043e\u0433\u0438",
  menuPipeline: "\u0412\u043e\u0440\u043e\u043d\u043a\u0430",
  menuAnalytics: "\u0410\u043d\u0430\u043b\u0438\u0442\u0438\u043a\u0430",
  menuKnowledgeBase: "\u0411\u0430\u0437\u0430 \u0437\u043d\u0430\u043d\u0438\u0439",
  menuIntegrations: "\u0418\u043d\u0442\u0435\u0433\u0440\u0430\u0446\u0438\u0438",
  menuPlatform: "\u041a\u043e\u043c\u043f\u0430\u043d\u0438\u0438",
  inboxTitle: "\u0414\u0438\u0430\u043b\u043e\u0433\u0438",
  openSearchFilters: "\u041f\u043e\u0438\u0441\u043a \u0438 \u0444\u0438\u043b\u044c\u0442\u0440\u044b",
  chatsSuffix: "\u0447\u0430\u0442\u043e\u0432",
  searchByNameOrPhone: "\u041f\u043e\u0438\u0441\u043a \u043f\u043e \u0438\u043c\u0435\u043d\u0438 \u0438\u043b\u0438 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0443",
  city: "\u0413\u043e\u0440\u043e\u0434",
  reason: "\u041f\u0440\u0438\u0447\u0438\u043d\u0430",
  clientType: "\u0422\u0438\u043f \u043a\u043b\u0438\u0435\u043d\u0442\u0430",
  category: "\u041a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044f",
  noMessages: "\u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0439 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442",
  replyBox: "\u041e\u043a\u043d\u043e \u043e\u0442\u0432\u0435\u0442\u0430",
  customerCard: "\u041a\u0430\u0440\u0442\u043e\u0447\u043a\u0430 \u043a\u043b\u0438\u0435\u043d\u0442\u0430",
  editShort: "\u0418\u0437\u043c.",
  openStatusSuffix: "\u043e\u0442\u043a\u0440\u044b\u0442",
  closedStatusSuffix: "\u0437\u0430\u043a\u0440\u044b\u0442",
  replyScripts: "\u0411\u044b\u0441\u0442\u0440\u044b\u0435 \u043e\u0442\u0432\u0435\u0442\u044b",
  quickScriptHint: "\u0411\u044b\u0441\u0442\u0440\u0430\u044f \u0432\u0441\u0442\u0430\u0432\u043a\u0430 \u0438 \u043e\u0442\u043f\u0440\u0430\u0432\u043a\u0430 \u0438\u0437 \u0432\u0430\u0448\u0435\u0439 \u0431\u0438\u0431\u043b\u0438\u043e\u0442\u0435\u043a\u0438.",
  chooseInstruction: "\u0418\u043d\u0441\u0442\u0440\u0443\u043a\u0446\u0438\u0438",
  openLibrary: "\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u0431\u0438\u0431\u043b\u0438\u043e\u0442\u0435\u043a\u0443",
  showScripts: "\u0421\u043a\u0440\u0438\u043f\u0442\u044b",
  general: "\u041e\u0431\u0449\u0435\u0435",
  insertScript: "\u0412\u0441\u0442\u0430\u0432\u0438\u0442\u044c \u0441\u043a\u0440\u0438\u043f\u0442",
  sendScript: "\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u0441\u043a\u0440\u0438\u043f\u0442",
  noMatchingScripts:
    "\u041f\u043e\u0434\u0445\u043e\u0434\u044f\u0449\u0438\u0445 \u0441\u043a\u0440\u0438\u043f\u0442\u043e\u0432 \u043d\u0435\u0442. \u0421\u043e\u0437\u0434\u0430\u0439\u0442\u0435 \u043d\u043e\u0432\u044b\u0439 \u0438\u043b\u0438 \u0438\u0437\u043c\u0435\u043d\u0438\u0442\u0435 \u043f\u043e\u0438\u0441\u043a\u043e\u0432\u044b\u0439 \u0437\u0430\u043f\u0440\u043e\u0441.",
  knowledgeBase: "\u0411\u0430\u0437\u0430 \u0437\u043d\u0430\u043d\u0438\u0439",
  knowledgeBaseHint: "\u0421\u0442\u0430\u0442\u044c\u0438 \u0438 \u0438\u043d\u0441\u0442\u0440\u0443\u043a\u0446\u0438\u0438 \u0434\u043b\u044f \u043e\u0442\u0432\u0435\u0442\u043e\u0432 \u0432 \u0447\u0430\u0442\u0435.",
  searchKnowledgeBase: "\u041f\u043e\u0438\u0441\u043a \u043f\u043e \u0431\u0430\u0437\u0435 \u0437\u043d\u0430\u043d\u0438\u0439",
  noKnowledgeArticles:
    "\u0421\u0442\u0430\u0442\u0435\u0439 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442. \u0414\u043e\u0431\u0430\u0432\u044c\u0442\u0435 \u043f\u0435\u0440\u0432\u0443\u044e \u0438\u043d\u0441\u0442\u0440\u0443\u043a\u0446\u0438\u044e \u0438\u043b\u0438 \u0433\u0430\u0439\u0434.",
  articleTitle: "\u0417\u0430\u0433\u043e\u043b\u043e\u0432\u043e\u043a \u0441\u0442\u0430\u0442\u044c\u0438",
  articleUrl: "URL \u0441\u0442\u0430\u0442\u044c\u0438",
  articleSummary: "\u041a\u0440\u0430\u0442\u043a\u043e\u0435 \u043e\u043f\u0438\u0441\u0430\u043d\u0438\u0435",
  saveArticle: "\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0441\u0442\u0430\u0442\u044c\u044e",
  sendArticleLink: "\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u0441\u0441\u044b\u043b\u043a\u0443",
  typeMessage: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435...",
  emojis: "\u0421\u043c\u0430\u0439\u043b\u0438\u043a\u0438",
  attachFile: "\u041f\u0440\u0438\u043a\u0440\u0435\u043f\u0438\u0442\u044c \u0444\u0430\u0439\u043b",
  dropMediaHint: "\u041f\u0435\u0440\u0435\u0442\u0430\u0449\u0438\u0442\u0435 \u043a\u0430\u0440\u0442\u0438\u043d\u043a\u0443 \u0438\u043b\u0438 \u0432\u0438\u0434\u0435\u043e \u0441\u044e\u0434\u0430",
  uploadingMedia: "\u041e\u0442\u043f\u0440\u0430\u0432\u043a\u0430...",
  unsupportedMediaFormat: "\u041c\u043e\u0436\u043d\u043e \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u044f\u0442\u044c \u0442\u043e\u043b\u044c\u043a\u043e \u043a\u0430\u0440\u0442\u0438\u043d\u043a\u0438 \u0438 \u0432\u0438\u0434\u0435\u043e.",
  mediaFileTooLarge: "\u0424\u0430\u0439\u043b \u0441\u043b\u0438\u0448\u043a\u043e\u043c \u0431\u043e\u043b\u044c\u0448\u043e\u0439. \u041c\u0430\u043a\u0441\u0438\u043c\u0443\u043c 20 \u041c\u0411.",
  mediaUploadFailed: "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u0444\u0430\u0439\u043b.",
  messageSendFailed: "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435.",
  send: "\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c",
  selectChatHint: "\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0447\u0430\u0442 \u0432 \u0441\u043f\u0438\u0441\u043a\u0435 \u0434\u0438\u0430\u043b\u043e\u0433\u043e\u0432, \u0447\u0442\u043e\u0431\u044b \u043d\u0430\u0447\u0430\u0442\u044c \u043f\u0435\u0440\u0435\u043f\u0438\u0441\u043a\u0443.",
  pipelineAndKpi: "\u0412\u043e\u0440\u043e\u043d\u043a\u0430 \u0438 KPI",
  salesOverview: "\u041e\u0431\u0437\u043e\u0440 \u043f\u0440\u043e\u0434\u0430\u0436",
  min: "\u043c\u0438\u043d",
  firstResponse: "\u041f\u0435\u0440\u0432\u044b\u0439 \u043e\u0442\u0432\u0435\u0442",
  chats7d: "\u0414\u0438\u0430\u043b\u043e\u0433\u043e\u0432 \u0437\u0430 7 \u0434\u043d\u0435\u0439",
  outgoing7d: "\u0418\u0441\u0445\u043e\u0434\u044f\u0449\u0438\u0445 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0439 \u0437\u0430 7 \u0434\u043d\u0435\u0439",
  deals: "\u0421\u0434\u0435\u043b\u043a\u0438",
  client: "\u041a\u043b\u0438\u0435\u043d\u0442",
  amount: "\u0421\u0443\u043c\u043c\u0430",
  stage: "\u042d\u0442\u0430\u043f",
  stageNew: "\u043d\u043e\u0432\u0430\u044f",
  stageQualified: "\u043a\u0432\u0430\u043b\u0438\u0444\u0438\u0446\u0438\u0440\u043e\u0432\u0430\u043d\u0430",
  stageProposal: "\u043f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u0438\u0435",
  stageWon: "\u0432\u044b\u0438\u0433\u0440\u0430\u043d\u0430",
  stageLost: "\u043f\u0440\u043e\u0438\u0433\u0440\u0430\u043d\u0430",
  customerCardTitle: "\u041a\u0430\u0440\u0442\u043e\u0447\u043a\u0430 \u043a\u043b\u0438\u0435\u043d\u0442\u0430",
  customerCardHint: "\u0420\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u0443\u0439\u0442\u0435 \u043f\u0440\u043e\u0444\u0438\u043b\u044c \u0438 \u043a\u0440\u0438\u0442\u0435\u0440\u0438\u0438 \u043a\u043b\u0438\u0435\u043d\u0442\u0430",
  funnel: "\u0412\u043e\u0440\u043e\u043d\u043a\u0430",
  notSelected: "\u041d\u0435 \u0432\u044b\u0431\u0440\u0430\u043d\u043e",
  addStep: "\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u044d\u0442\u0430\u043f",
  deleteStep: "\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u044d\u0442\u0430\u043f",
  manageFunnel: "\u0423\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u0435 \u0432\u043e\u0440\u043e\u043d\u043a\u043e\u0439",
  newStepPlaceholder: "\u041d\u043e\u0432\u044b\u0439 \u044d\u0442\u0430\u043f \u0432\u043e\u0440\u043e\u043d\u043a\u0438",
  stageInUseError: "\u042d\u0442\u0430\u043f \u0443\u0436\u0435 \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u0435\u0442\u0441\u044f \u0432 \u0441\u0434\u0435\u043b\u043a\u0430\u0445, \u0441\u043d\u0430\u0447\u0430\u043b\u0430 \u043f\u0435\u0440\u0435\u0432\u0435\u0434\u0438\u0442\u0435 \u0438\u0445 \u043d\u0430 \u0434\u0440\u0443\u0433\u043e\u0439 \u044d\u0442\u0430\u043f.",
  stageExistsError: "\u0422\u0430\u043a\u043e\u0439 \u044d\u0442\u0430\u043f \u0443\u0436\u0435 \u0435\u0441\u0442\u044c.",
  stageActionFailed: "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u044d\u0442\u0430\u043f\u044b \u0432\u043e\u0440\u043e\u043d\u043a\u0438.",
  stageReorderHint: "\u041f\u0435\u0440\u0435\u0442\u0430\u0449\u0438\u0442\u0435 \u044d\u0442\u0430\u043f \u043c\u044b\u0448\u043a\u043e\u0439, \u0447\u0442\u043e\u0431\u044b \u0438\u0437\u043c\u0435\u043d\u0438\u0442\u044c \u043f\u043e\u0440\u044f\u0434\u043e\u043a.",
  stageReorderFailed: "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u043d\u043e\u0432\u044b\u0439 \u043f\u043e\u0440\u044f\u0434\u043e\u043a \u044d\u0442\u0430\u043f\u043e\u0432.",
  pipelineBoardTitle: "\u0412\u043e\u0440\u043e\u043d\u043a\u0430 \u043a\u043b\u0438\u0435\u043d\u0442\u043e\u0432",
  pipelineBoardHint: "\u041a\u0430\u0440\u0442\u043e\u0447\u043a\u0438 \u0441\u0433\u0440\u0443\u043f\u043f\u0438\u0440\u043e\u0432\u0430\u043d\u044b \u043f\u043e \u0448\u0430\u0433\u0430\u043c \u0438\u0437 \u043f\u0440\u043e\u0444\u0438\u043b\u044f \u043a\u043b\u0438\u0435\u043d\u0442\u0430.",
  noCardsInStage: "\u0412 \u044d\u0442\u043e\u043c \u0448\u0430\u0433\u0435 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442 \u043a\u0430\u0440\u0442\u043e\u0447\u0435\u043a.",
  closeCard: "\u0417\u0430\u043a\u0440\u044b\u0442\u044c",
  reopenCard: "\u041f\u0435\u0440\u0435\u043e\u0442\u043a\u0440\u044b\u0442\u044c",
  openCards: "\u041e\u0442\u043a\u0440\u044b\u0442\u044b\u0435",
  closedCards: "\u0417\u0430\u043a\u0440\u044b\u0442\u044b\u0435",
  analyticsTitle: "\u0410\u043d\u0430\u043b\u0438\u0442\u0438\u043a\u0430 \u043e\u0442\u0434\u0435\u043b\u0430",
  analyticsHint:
    "\u041e\u0441\u043d\u043e\u0432\u043d\u044b\u0435 KPI \u043f\u043e \u0434\u0438\u0430\u043b\u043e\u0433\u0430\u043c, \u0441\u043a\u043e\u0440\u043e\u0441\u0442\u0438 \u043e\u0442\u0432\u0435\u0442\u0430 \u0438 \u0437\u0430\u043a\u0440\u044b\u0442\u0438\u044f\u043c.",
  customRange: "\u041f\u0435\u0440\u0438\u043e\u0434",
  fromDate: "\u0421",
  toDate: "\u041f\u043e",
  totalDialogs: "\u0412\u0441\u0435\u0433\u043e \u0434\u0438\u0430\u043b\u043e\u0433\u043e\u0432",
  openDialogs: "\u041e\u0442\u043a\u0440\u044b\u0442\u044b\u0445 \u0434\u0438\u0430\u043b\u043e\u0433\u043e\u0432",
  closedDialogs7d: "\u0417\u0430\u043a\u0440\u044b\u0442\u043e \u0437\u0430 7 \u0434\u043d\u0435\u0439",
  totalMessages7d: "\u0412\u0441\u0435\u0445 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0439 \u0437\u0430 7 \u0434\u043d\u0435\u0439",
  closeSpeed: "\u041e\u0442 \u043e\u0442\u043a\u0440\u044b\u0442\u0438\u044f \u0434\u043e \u0437\u0430\u043a\u0440\u044b\u0442\u0438\u044f",
  avgMessagesPerDialog: "\u0421\u0440\u0435\u0434\u043d\u0435\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0439 \u043d\u0430 \u0434\u0438\u0430\u043b\u043e\u0433",
  channelSplit: "\u0420\u0430\u0437\u0440\u0435\u0437 \u043f\u043e \u043a\u0430\u043d\u0430\u043b\u0430\u043c",
  managersKpiTitle: "KPI \u043f\u043e \u043c\u0435\u043d\u0435\u0434\u0436\u0435\u0440\u0430\u043c",
  managerLabel: "\u041c\u0435\u043d\u0435\u0434\u0436\u0435\u0440",
  dialogsHandledLabel: "\u0414\u0438\u0430\u043b\u043e\u0433\u043e\u0432",
  outgoingMessagesLabel: "\u0418\u0441\u0445\u043e\u0434\u044f\u0449\u0438\u0445",
  stageKpiTitle: "KPI \u043f\u043e \u044d\u0442\u0430\u043f\u0430\u043c \u0432\u043e\u0440\u043e\u043d\u043a\u0438",
  stageLabel: "\u042d\u0442\u0430\u043f",
  stageDealsLabel: "\u0421\u0434\u0435\u043b\u043e\u043a",
  stageAmountLabel: "\u0421\u0443\u043c\u043c\u0430",
  slaKpiTitle: "SLA \u044d\u0441\u043a\u0430\u043b\u0430\u0446\u0438\u0438",
  slaEscalationsLabel: "\u042d\u0441\u043a\u0430\u043b\u0430\u0446\u0438\u0439 \u0441\u0435\u0439\u0447\u0430\u0441",
  slaDelayLabel: "\u0421\u0440\u0435\u0434\u043d\u044f\u044f \u043f\u0440\u043e\u0441\u0440\u043e\u0447\u043a\u0430 (\u043c\u0438\u043d)",
  slaManagerEscalationsLabel: "\u042d\u0441\u043a\u0430\u043b\u0430\u0446\u0438\u0439",
  slaManagerDelayLabel: "\u0421\u0440. \u043f\u0440\u043e\u0441\u0440\u043e\u0447\u043a\u0430 (\u043c\u0438\u043d)",
  snapshotsTitle: "\u0421\u043d\u0438\u043c\u043a\u0438 KPI",
  createSnapshot: "\u0421\u043e\u0437\u0434\u0430\u0442\u044c \u0441\u043d\u0438\u043c\u043e\u043a",
  exportCsv: "CSV \u044d\u043a\u0441\u043f\u043e\u0440\u0442",
  exportXlsx: "Excel \u044d\u043a\u0441\u043f\u043e\u0440\u0442",
  autoAssignmentTitle: "\u0410\u0432\u0442\u043e\u0440\u0430\u0441\u043f\u0440\u0435\u0434\u0435\u043b\u0435\u043d\u0438\u0435 \u0434\u0438\u0430\u043b\u043e\u0433\u043e\u0432",
  autoAssignmentHint: "\u041d\u043e\u0432\u044b\u0435 \u0434\u0438\u0430\u043b\u043e\u0433\u0438 \u0431\u0443\u0434\u0443\u0442 \u043d\u0430\u0437\u043d\u0430\u0447\u0430\u0442\u044c\u0441\u044f \u043f\u043e \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u043e\u0439 \u0441\u0442\u0440\u0430\u0442\u0435\u0433\u0438\u0438.",
  strategyRoundRobin: "\u041f\u043e \u043e\u0447\u0435\u0440\u0435\u0434\u0438 (round-robin)",
  strategyLeastLoad: "\u041f\u043e \u043c\u0438\u043d\u0438\u043c\u0430\u043b\u044c\u043d\u043e\u0439 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0435",
  saveStrategy: "\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0441\u0442\u0440\u0430\u0442\u0435\u0433\u0438\u044e",
  loadTitle: "\u0422\u0435\u043a\u0443\u0449\u0430\u044f \u043d\u0430\u0433\u0440\u0443\u0437\u043a\u0430 \u043c\u0435\u043d\u0435\u0434\u0436\u0435\u0440\u043e\u0432",
  loadDialogs: "\u041e\u0442\u043a\u0440\u044b\u0442\u044b\u0445 \u0434\u0438\u0430\u043b\u043e\u0433\u043e\u0432",
  refreshNow: "\u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u0441\u0435\u0439\u0447\u0430\u0441",
  updatedAgo: "\u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d\u043e",
  snapshotPeriod: "\u041f\u0435\u0440\u0438\u043e\u0434",
  snapshotTotals: "\u0412\u0441\u0435\u0433\u043e/\u041e\u0442\u043a\u0440./\u0417\u0430\u043a\u0440.",
  snapshotMessages: "\u0421\u043e\u043e\u0431\u0449.",
  whatsappChannel: "WhatsApp",
  telegramChannel: "Telegram",
  dynamics14d: "\u0414\u0438\u043d\u0430\u043c\u0438\u043a\u0430 \u0437\u0430 14 \u0434\u043d\u0435\u0439",
  dynamicsMessages: "\u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044f",
  dynamicsDialogs: "\u041d\u043e\u0432\u044b\u0435 \u0434\u0438\u0430\u043b\u043e\u0433\u0438",
  dynamicsClosed: "\u0417\u0430\u043a\u0440\u044b\u0442\u044b\u0435 \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0438",
  saveStep: "\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u044d\u0442\u0430\u043f",
  cancel: "\u041e\u0442\u043c\u0435\u043d\u0430",
  close: "\u0417\u0430\u043a\u0440\u044b\u0442\u044c",
  name: "\u0418\u043c\u044f",
  phone: "\u0422\u0435\u043b\u0435\u0444\u043e\u043d",
  inquiryReason: "\u041f\u0440\u0438\u0447\u0438\u043d\u0430 \u043e\u0431\u0440\u0430\u0449\u0435\u043d\u0438\u044f",
  save: "\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c",
  scriptLibrary: "\u0411\u0438\u0431\u043b\u0438\u043e\u0442\u0435\u043a\u0430 \u0441\u043a\u0440\u0438\u043f\u0442\u043e\u0432",
  scriptLibraryHint:
    "\u0421\u043e\u0437\u0434\u0430\u0432\u0430\u0439\u0442\u0435, \u0438\u0449\u0438\u0442\u0435, \u0440\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u0443\u0439\u0442\u0435 \u0438 \u0443\u043f\u043e\u0440\u044f\u0434\u043e\u0447\u0438\u0432\u0430\u0439\u0442\u0435 \u0432\u0441\u0435 \u0448\u0430\u0431\u043b\u043e\u043d\u044b \u043e\u0442\u0432\u0435\u0442\u043e\u0432.",
  newScript: "\u041d\u043e\u0432\u044b\u0439 \u0441\u043a\u0440\u0438\u043f\u0442",
  searchScripts: "\u041f\u043e\u0438\u0441\u043a \u043f\u043e \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u044e, \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0438 \u0438\u043b\u0438 \u0442\u0435\u043a\u0441\u0442\u0443",
  variablesLabel: "\u041f\u0435\u0440\u0435\u043c\u0435\u043d\u043d\u044b\u0435",
  edit: "\u0418\u0437\u043c\u0435\u043d\u0438\u0442\u044c",
  delete: "\u0423\u0434\u0430\u043b\u0438\u0442\u044c",
  editScript: "\u0420\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435 \u0441\u043a\u0440\u0438\u043f\u0442\u0430",
  createScript: "\u0421\u043e\u0437\u0434\u0430\u043d\u0438\u0435 \u0441\u043a\u0440\u0438\u043f\u0442\u0430",
  scriptEditorHint:
    "\u0421\u043e\u0437\u0434\u0430\u0432\u0430\u0439\u0442\u0435 \u043f\u0435\u0440\u0435\u0438\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u0435\u043c\u044b\u0435 \u043e\u0442\u0432\u0435\u0442\u044b \u0438 \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u0439\u0442\u0435 \u043f\u0435\u0440\u0435\u043c\u0435\u043d\u043d\u044b\u0435 \u0438\u0437 \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0438 \u043a\u043b\u0438\u0435\u043d\u0442\u0430.",
  scriptTitle: "\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 \u0441\u043a\u0440\u0438\u043f\u0442\u0430",
  scriptText: "\u0422\u0435\u043a\u0441\u0442 \u0441\u043a\u0440\u0438\u043f\u0442\u0430",
  clear: "\u041e\u0447\u0438\u0441\u0442\u0438\u0442\u044c",
  updateScript: "\u041e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u0441\u043a\u0440\u0438\u043f\u0442",
  saveScript: "\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0441\u043a\u0440\u0438\u043f\u0442"
} as const;

function isSuperAdminUser(user: SessionUser | null | undefined): boolean {
  return user?.role === "superadmin";
}

export function App(): JSX.Element {
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const loginInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const [token, setToken] = useState<string>("");
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [loginInput, setLoginInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [loginError, setLoginError] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string>("");
  const [selectedConversationData, setSelectedConversationData] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageBody, setMessageBody] = useState<string>("");
  const [emojiPickerOpen, setEmojiPickerOpen] = useState<boolean>(false);
  const [isDragOverMessages, setIsDragOverMessages] = useState<boolean>(false);
  const [uploadingMedia, setUploadingMedia] = useState<boolean>(false);
  const [mediaUploadError, setMediaUploadError] = useState<string>("");
  const [searchPanelOpen, setSearchPanelOpen] = useState<boolean>(false);
  const [knowledgeQuickOpen, setKnowledgeQuickOpen] = useState<boolean>(false);
  const [currentSection, setCurrentSection] = useState<
    "dialogs" | "pipeline" | "analytics" | "knowledge" | "integrations" | "platform"
  >("dialogs");
  const [scripts, setScripts] = useState<MessageScript[]>([]);
  const [knowledgeArticles, setKnowledgeArticles] = useState<KnowledgeArticle[]>([]);
  const [selectedScriptId, setSelectedScriptId] = useState<string>("");
  const [scriptLibraryOpen, setScriptLibraryOpen] = useState<boolean>(false);
  const [scriptPanelOpen, setScriptPanelOpen] = useState<boolean>(false);
  const [scriptFormOpen, setScriptFormOpen] = useState<boolean>(false);
  const [scriptSearch, setScriptSearch] = useState<string>("");
  const [knowledgeSearch, setKnowledgeSearch] = useState<string>("");
  const [scriptTitle, setScriptTitle] = useState<string>("");
  const [scriptCategory, setScriptCategory] = useState<string>("");
  const [scriptDraftBody, setScriptDraftBody] = useState<string>("");
  const [articleTitle, setArticleTitle] = useState<string>("");
  const [articleUrl, setArticleUrl] = useState<string>("");
  const [articleCategory, setArticleCategory] = useState<string>("");
  const [articleSummary, setArticleSummary] = useState<string>("");
  const [editingScriptId, setEditingScriptId] = useState<string>("");
  const [deals, setDeals] = useState<Deal[]>([]);
  const [dealStages, setDealStages] = useState<PipelineStage[]>([]);
  const [newDealStageName, setNewDealStageName] = useState<string>("");
  const [customerDealStage, setCustomerDealStage] = useState<string>("");
  const [dealStageError, setDealStageError] = useState<string>("");
  const [pipelineManagerOpen, setPipelineManagerOpen] = useState<boolean>(false);
  const [draggingStageId, setDraggingStageId] = useState<string>("");
  const [reorderingStages, setReorderingStages] = useState<boolean>(false);
  const [editingStageId, setEditingStageId] = useState<string>("");
  const [editingStageName, setEditingStageName] = useState<string>("");
  const [pipelineStatusFilter, setPipelineStatusFilter] = useState<"open" | "closed">("open");
  const [draggingConversationId, setDraggingConversationId] = useState<string>("");
  const [dragOverStageKey, setDragOverStageKey] = useState<string>("");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [analyticsPeriod, setAnalyticsPeriod] = useState<7 | 14 | 30>(14);
  const [analyticsMode, setAnalyticsMode] = useState<"preset" | "custom">("preset");
  const [analyticsFrom, setAnalyticsFrom] = useState<string>(dateOffsetISO(13));
  const [analyticsTo, setAnalyticsTo] = useState<string>(dateOffsetISO(0));
  const [search, setSearch] = useState<string>("");
  const [filters, setFilters] = useState<InboxFilters>(DEFAULT_INBOX_FILTERS);
  const [savedFilterPresets, setSavedFilterPresets] = useState<SavedInboxFilterPreset[]>([]);
  const [quickManagers, setQuickManagers] = useState<QuickActionManager[]>([]);
  const [quickStageByConversation, setQuickStageByConversation] = useState<Record<string, string>>({});
  const [quickManagerByConversation, setQuickManagerByConversation] = useState<Record<string, string>>({});
  const [quickTaskByConversation, setQuickTaskByConversation] = useState<Record<string, string>>({});
  const [quickDeferMinutesByConversation, setQuickDeferMinutesByConversation] = useState<Record<string, number>>({});
  const [customerCardOpen, setCustomerCardOpen] = useState<boolean>(false);
  const [contactCard, setContactCard] = useState<ContactCard | null>(null);
  const [metricSnapshots, setMetricSnapshots] = useState<MetricSnapshot[]>([]);
  const [autoAssignmentStrategy, setAutoAssignmentStrategy] = useState<AutoAssignmentStrategy>("round_robin");
  const [autoAssignmentSaving, setAutoAssignmentSaving] = useState<boolean>(false);
  const [autoAssignmentLoad, setAutoAssignmentLoad] = useState<AutoAssignmentLoadItem[]>([]);
  const [autoAssignmentRefreshing, setAutoAssignmentRefreshing] = useState<boolean>(false);
  const [autoAssignmentLoadUpdatedAt, setAutoAssignmentLoadUpdatedAt] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<string>("");
  const [toastVisible, setToastVisible] = useState<boolean>(false);
  const [toastKind, setToastKind] = useState<ToastKind>("success");
  const toastTimerRef = useRef<number | null>(null);
  const isCustomRangeValid = Boolean(analyticsFrom && analyticsTo && analyticsFrom <= analyticsTo);
  const customRangeDays = isCustomRangeValid ? diffDaysInclusive(analyticsFrom, analyticsTo) : 14;
  const metricsQuery =
    analyticsMode === "custom" && isCustomRangeValid
      ? { days: customRangeDays, from: analyticsFrom, to: analyticsTo }
      : { days: analyticsPeriod };
  const metricsPeriodLabel =
    analyticsMode === "custom" && isCustomRangeValid
      ? `${formatDateRangeLabel(analyticsFrom)} - ${formatDateRangeLabel(analyticsTo)}`
      : `${analyticsPeriod} \u0434\u043d\u0435\u0439`;

  useEffect(() => {
    const socket = io(API.replace("/api", ""));
    socket.on("message:new", () => {
      if (token) {
        void loadConversations(token, search, filters, setConversations);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [token, search, filters]);

  useEffect(() => {
    if (!token) {
      return;
    }
    if (analyticsMode === "custom" && !isCustomRangeValid) {
      return;
    }
    void loadMetrics(token, setMetrics, metricsQuery);
    void loadMetricSnapshots(token, setMetricSnapshots);
  }, [token, analyticsPeriod, analyticsMode, analyticsFrom, analyticsTo, isCustomRangeValid]);

  useEffect(() => {
    if (!token) {
      return;
    }
    void loadAutoAssignmentStrategy(token, setAutoAssignmentStrategy);
    void refreshAutoAssignmentLoad();
  }, [token]);

  useEffect(() => {
    if (!token || sessionUser?.role !== "admin") {
      return;
    }
    if (currentSection !== "analytics") {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshAutoAssignmentLoad();
    }, 15000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [token, sessionUser?.role, currentSection]);

  useEffect(() => {
    const raw = localStorage.getItem(INBOX_FILTER_PRESETS_KEY);
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw) as SavedInboxFilterPreset[];
      if (Array.isArray(parsed)) {
        setSavedFilterPresets(parsed.slice(0, 8));
      }
    } catch {
      localStorage.removeItem(INBOX_FILTER_PRESETS_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(INBOX_FILTER_PRESETS_KEY, JSON.stringify(savedFilterPresets));
  }, [savedFilterPresets]);

  useEffect(() => {
    const savedToken = localStorage.getItem(SESSION_TOKEN_KEY);
    let savedUser: SessionUser | null = null;
    const rawUser = localStorage.getItem(SESSION_USER_KEY);
    if (rawUser) {
      try {
        savedUser = JSON.parse(rawUser) as SessionUser;
      } catch {
        localStorage.removeItem(SESSION_USER_KEY);
      }
    }

    if (!savedToken) {
      return;
    }

    setToken(savedToken);
    setSessionUser(savedUser);

    if (isSuperAdminUser(savedUser)) {
      setCurrentSection("platform");
      return;
    }

    const bootstrapTimeout = window.setTimeout(() => {
      localStorage.removeItem(SESSION_TOKEN_KEY);
      localStorage.removeItem(SESSION_USER_KEY);
      setToken("");
      setSessionUser(null);
    }, 15000);

    void hydrateWorkspace(savedToken)
      .catch(() => {
        localStorage.removeItem(SESSION_TOKEN_KEY);
        localStorage.removeItem(SESSION_USER_KEY);
        setToken("");
        setSessionUser(null);
      })
      .finally(() => {
        window.clearTimeout(bootstrapTimeout);
      });
  }, []);

  useEffect(() => {
    if (!conversations.length) {
      if (selectedConversation) {
        setSelectedConversation("");
        setSelectedConversationData(null);
        setMessages([]);
      }
      return;
    }

    const existingConversation = conversations.find((conversation) => conversation.id === selectedConversation);
    if (existingConversation) {
      setSelectedConversationData(existingConversation);
      if (token) {
        void loadMessages(token, existingConversation.id, setMessages);
        void loadContactCard(token, existingConversation.id, setContactCard);
      }
      return;
    }

    if (conversations[0]) {
      const firstConversation = conversations[0];
      setSelectedConversation(firstConversation.id);
      setSelectedConversationData(firstConversation);
      if (token) {
        void loadMessages(token, firstConversation.id, setMessages);
        void loadContactCard(token, firstConversation.id, setContactCard);
      }
    }
  }, [conversations, selectedConversation, token]);

  useEffect(() => {
    if (!scripts.length) {
      setSelectedScriptId("");
      return;
    }

    const exists = scripts.some((script) => script.id === selectedScriptId);
    if (!exists) {
      setSelectedScriptId(scripts[0].id);
    }
  }, [scripts, selectedScriptId]);

  useEffect(() => {
    if (!messages.length) {
      return;
    }

    requestAnimationFrame(() => {
      const container = messagesContainerRef.current;
      if (!container) {
        return;
      }

      container.scrollTop = container.scrollHeight;
    });
  }, [messages, selectedConversation]);

  useEffect(() => {
    if (!emojiPickerOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent): void => {
      const container = emojiPickerRef.current;
      if (!container) {
        return;
      }

      const target = event.target as Node;
      if (!container.contains(target)) {
        setEmojiPickerOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [emojiPickerOpen]);

  const filteredScripts = scripts.filter((script) => {
    const needle = scriptSearch.trim().toLowerCase();
    if (!needle) {
      return true;
    }

    return [script.title, script.category || "", script.body].some((value) => value.toLowerCase().includes(needle));
  });

  const filteredKnowledgeArticles = knowledgeArticles.filter((article) => {
    const needle = knowledgeSearch.trim().toLowerCase();
    if (!needle) {
      return true;
    }

    return [article.title, article.category || "", article.summary || "", article.url].some((value) =>
      value.toLowerCase().includes(needle)
    );
  });
  const availableStageNames = dealStages.length
    ? dealStages.map((stage) => stage.name)
    : [...DEFAULT_PIPELINE_STAGES];
  const pipelineColumns = availableStageNames.map((stageName) => ({
    key: stageName,
    label: formatStageLabel(stageName, UI)
  }));

  async function hydrateWorkspace(authToken: string): Promise<void> {
    const nextConversations = await loadConversations(authToken, "", filters, setConversations);
    await loadQuickActionsMeta(authToken, setQuickManagers, setDealStages);
    await refreshScripts({ token: authToken, setScripts });
    await refreshKnowledge({ token: authToken, setKnowledgeArticles });
    await loadDeals(authToken, setDeals);
    await loadMetrics(authToken, setMetrics, metricsQuery);
    await loadMetricSnapshots(authToken, setMetricSnapshots);

    if (nextConversations[0]) {
      setSelectedConversation(nextConversations[0].id);
      setSelectedConversationData(nextConversations[0]);
      await loadMessages(authToken, nextConversations[0].id, setMessages);
      await loadContactCard(authToken, nextConversations[0].id, setContactCard);
    }
  }

  async function login(): Promise<void> {
    setLoginError("");
    const loginValue = (loginInput || loginInputRef.current?.value || "").trim();
    const passwordValue = passwordInput || passwordInputRef.current?.value || "";
    if (!loginValue || !passwordValue) {
      setLoginError(UI.loginFailed);
      return;
    }

    try {
      const response = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login: loginValue, password: passwordValue })
      });

      const data = (await response.json()) as { token?: string; user?: SessionUser; error?: string };
      if (!response.ok || !data.token) {
        setLoginError(data.error || UI.loginFailed);
        return;
      }

      setSessionUser(data.user ?? null);
      setToken(data.token);
      localStorage.setItem(SESSION_TOKEN_KEY, data.token);
      localStorage.setItem(SESSION_USER_KEY, JSON.stringify(data.user ?? null));
      if (isSuperAdminUser(data.user ?? null)) {
        setCurrentSection("platform");
        return;
      }
      await hydrateWorkspace(data.token);
    } catch {
      setLoginError("Сервер API недоступен. Проверьте backend или используйте http://localhost:5173");
    }
  }

  function saveCurrentFilterPreset(): void {
    const hasAnyFilter = Object.values(filters).some((value) => value !== "");
    if (!hasAnyFilter) {
      return;
    }
    const presetName = `Фильтр ${savedFilterPresets.length + 1}`;
    setSavedFilterPresets((prev) => [
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        name: presetName,
        filters: { ...filters }
      },
      ...prev
    ].slice(0, 8));
  }

  async function applyFilterPreset(preset: SavedInboxFilterPreset): Promise<void> {
    setFilters(preset.filters);
    await loadConversations(token, search, preset.filters, setConversations);
  }

  function removeFilterPreset(presetId: string): void {
    setSavedFilterPresets((prev) => prev.filter((preset) => preset.id !== presetId));
  }

  function logout(): void {
    localStorage.removeItem(SESSION_TOKEN_KEY);
    localStorage.removeItem(SESSION_USER_KEY);
    setToken("");
    setSessionUser(null);
    setConversations([]);
    setSelectedConversation("");
    setSelectedConversationData(null);
    setMessages([]);
    setMessageBody("");
    setEmojiPickerOpen(false);
    setIsDragOverMessages(false);
    setUploadingMedia(false);
    setSearchPanelOpen(false);
    setKnowledgeQuickOpen(false);
    setCurrentSection("dialogs");
    setScripts([]);
    setKnowledgeArticles([]);
    setSelectedScriptId("");
    setScriptLibraryOpen(false);
    setScriptPanelOpen(false);
    setScriptFormOpen(false);
    setScriptSearch("");
    setKnowledgeSearch("");
    setScriptTitle("");
    setScriptCategory("");
    setScriptDraftBody("");
    setArticleTitle("");
    setArticleUrl("");
    setArticleCategory("");
    setArticleSummary("");
    setEditingScriptId("");
    setDeals([]);
    setDealStages([]);
    setNewDealStageName("");
    setCustomerDealStage("");
    setDealStageError("");
    setPipelineManagerOpen(false);
    setEditingStageId("");
    setEditingStageName("");
    setMetrics(null);
    setSearch("");
    setFilters(DEFAULT_INBOX_FILTERS);
    setCustomerCardOpen(false);
    setContactCard(null);
  }

  async function onSelectConversation(id: string): Promise<void> {
    const nextConversation = conversations.find((conversation) => conversation.id === id) || null;
    setSelectedConversation(id);
    setSelectedConversationData(nextConversation);
    await loadMessages(token, id, setMessages);
    await loadContactCard(token, id, setContactCard);
  }

  async function updateConversationPriority(conversationId: string, priority: InboxFilters["priority"]): Promise<void> {
    if (!token || !priority) {
      return;
    }
    await apiUpdateConversationPriority(token, conversationId, priority);
    await refreshConversationList({ token, search, filters, setConversations });
  }

  async function assignConversationManager(conversationId: string, managerId: string): Promise<void> {
    if (!token) {
      return;
    }
    await apiAssignConversationManager(token, conversationId, managerId);
    await refreshConversationList({ token, search, filters, setConversations });
  }

  async function moveConversationStage(conversationId: string, stage: string): Promise<void> {
    if (!token || !stage) {
      return;
    }
    await apiMoveConversationStage(token, conversationId, stage);
    await refreshConversationList({ token, search, filters, setConversations });
    await loadDeals(token, setDeals);
  }

  async function createQuickTask(conversationId: string): Promise<void> {
    const title = (quickTaskByConversation[conversationId] || "").trim();
    if (!token || !title) {
      return;
    }
    await createConversationTask(token, conversationId, title);
    setQuickTaskByConversation((prev) => ({ ...prev, [conversationId]: "" }));
    await refreshConversationList({ token, search, filters, setConversations });
  }

  async function markSlaFollowUpDone(conversationId: string): Promise<void> {
    if (!token) {
      return;
    }
    await apiMarkSlaFollowUpDone(token, conversationId);
    await refreshConversationList({ token, search, filters, setConversations });
  }

  async function acknowledgeSlaEscalation(conversationId: string): Promise<void> {
    if (!token) {
      return;
    }
    try {
      await apiAcknowledgeSlaEscalation(token, conversationId);
      await refreshConversationList({ token, search, filters, setConversations });
      showToast("Диалог взят в работу", "success");
    } catch {
      showToast("Не удалось взять диалог в работу", "error");
    }
  }

  async function deferSlaEscalation(conversationId: string, minutes: number): Promise<void> {
    if (!token) {
      return;
    }
    try {
      await apiDeferSlaEscalation(token, conversationId, minutes);
      await refreshConversationList({ token, search, filters, setConversations });
      showToast(`SLA отложен на ${minutes} мин`, "success");
    } catch {
      showToast("Не удалось отложить SLA", "error");
    }
  }

  function showToast(message: string, kind: ToastKind): void {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToastMessage(message);
    setToastKind(kind);
    setToastVisible(true);
    toastTimerRef.current = window.setTimeout(() => {
      setToastVisible(false);
    }, 2200);
  }

  function closeToast(): void {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToastVisible(false);
  }

  function pauseToastAutoHide(): void {
    if (!toastTimerRef.current) {
      return;
    }
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = null;
  }

  function resumeToastAutoHide(): void {
    if (!toastVisible || toastTimerRef.current) {
      return;
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastVisible(false);
    }, 1400);
  }

  async function sendMessage(): Promise<void> {
    if (!messageBody.trim() || !selectedConversation || !token || uploadingMedia) {
      return;
    }

    setMediaUploadError("");
    try {
      const response = await fetch(`${API}/conversations/${selectedConversation}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ body: messageBody })
      });
      if (!response.ok) {
        setMediaUploadError(UI.messageSendFailed);
        return;
      }

      setMessageBody("");
      setEmojiPickerOpen(false);
      await refreshAfterMessage({
        token,
        conversationId: selectedConversation,
        search,
        filters,
        metricsQuery,
        setMessages,
        setConversations,
        setMetrics,
        loadMetrics
      });
    } catch {
      setMediaUploadError(UI.messageSendFailed);
    }
  }

  async function sendMediaFile(file: File): Promise<void> {
    if (!selectedConversation || !token) {
      return;
    }
    setMediaUploadError("");
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      setMediaUploadError(UI.unsupportedMediaFormat);
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setMediaUploadError(UI.mediaFileTooLarge);
      return;
    }

    const payload = new FormData();
    payload.append("body", messageBody.trim());
    payload.append("file", file);
    setUploadingMedia(true);

    try {
      const response = await fetch(`${API}/conversations/${selectedConversation}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: payload
      });
      if (!response.ok) {
        setMediaUploadError(UI.mediaUploadFailed);
        return;
      }

      setMessageBody("");
      setEmojiPickerOpen(false);
      await refreshAfterMessage({
        token,
        conversationId: selectedConversation,
        search,
        filters,
        metricsQuery,
        setMessages,
        setConversations,
        setMetrics,
        loadMetrics
      });
    } catch {
      setMediaUploadError(UI.mediaUploadFailed);
    } finally {
      setUploadingMedia(false);
    }
  }

  function getMediaUrl(attachmentUrl: string): string {
    if (attachmentUrl.startsWith("http://") || attachmentUrl.startsWith("https://")) {
      return attachmentUrl;
    }
    return `${API.replace("/api", "")}${attachmentUrl}`;
  }

  async function createScript(): Promise<void> {
    if (!scriptTitle.trim() || !scriptDraftBody.trim()) {
      return;
    }

    const created = await upsertScript(
      token,
      {
        title: scriptTitle,
        category: scriptCategory,
        body: scriptDraftBody
      },
      editingScriptId || undefined
    );

    if (!created) {
      return;
    }

    await refreshScripts({ token, setScripts });
    setScriptTitle("");
    setScriptCategory("");
    setScriptDraftBody("");
    setEditingScriptId("");
    setScriptFormOpen(false);
  }

  async function sendScript(script: MessageScript): Promise<void> {
    const renderedBody = applyScriptVariables(script.body, contactCard, selectedConversationData);
    setMessageBody(renderedBody);
    await sendConversationTextMessage(token, selectedConversation, renderedBody);

    setMessageBody("");
    await refreshAfterMessage({
      token,
      conversationId: selectedConversation,
      search,
      filters,
      metricsQuery,
      setMessages,
      setConversations,
      setMetrics,
      loadMetrics
    });
  }

  async function deleteScript(scriptId: string): Promise<void> {
    await removeScript(token, scriptId);

    await refreshScripts({ token, setScripts });
    if (editingScriptId === scriptId) {
      resetScriptForm();
    }
  }

  async function createKnowledgeArticle(): Promise<void> {
    if (!articleTitle.trim() || !articleUrl.trim()) {
      return;
    }

    const created = await createKnowledgeArticleApi(token, {
        title: articleTitle,
        url: articleUrl,
        category: articleCategory,
        summary: articleSummary
    });

    if (!created) {
      return;
    }

    await refreshKnowledge({ token, setKnowledgeArticles });
    setArticleTitle("");
    setArticleUrl("");
    setArticleCategory("");
    setArticleSummary("");
  }

  async function deleteKnowledgeArticle(articleId: string): Promise<void> {
    await deleteKnowledgeArticleApi(token, articleId);

    await refreshKnowledge({ token, setKnowledgeArticles });
  }

  async function sendKnowledgeArticleLink(article: KnowledgeArticle): Promise<void> {
    if (!selectedConversation) {
      setMessageBody(`${article.title}\n${article.url}`);
      setScriptLibraryOpen(false);
      return;
    }

    const body = `${article.title}\n${article.url}`;
    await sendConversationTextMessage(token, selectedConversation, body);

    setScriptLibraryOpen(false);
    await refreshAfterMessage({
      token,
      conversationId: selectedConversation,
      search,
      filters,
      metricsQuery,
      setMessages,
      setConversations,
      setMetrics,
      loadMetrics
    });
  }

  async function createMetricSnapshot(): Promise<void> {
    if (!token) {
      return;
    }
    const payload =
      analyticsMode === "custom" && isCustomRangeValid
        ? { from: analyticsFrom, to: analyticsTo }
        : {};
    await fetch(`${API}/metrics/snapshots/rebuild`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    await loadMetricSnapshots(token, setMetricSnapshots);
  }

  async function saveAutoAssignmentStrategy(): Promise<void> {
    if (!token || sessionUser?.role !== "admin") {
      return;
    }
    setAutoAssignmentSaving(true);
    try {
      await updateAutoAssignmentStrategy(token, autoAssignmentStrategy);
      await refreshAutoAssignmentLoad();
    } finally {
      setAutoAssignmentSaving(false);
    }
  }

  async function refreshAutoAssignmentLoad(): Promise<void> {
    if (!token) {
      return;
    }
    setAutoAssignmentRefreshing(true);
    try {
      await loadAutoAssignmentLoad(token, setAutoAssignmentLoad);
      setAutoAssignmentLoadUpdatedAt(Date.now());
    } finally {
      setAutoAssignmentRefreshing(false);
    }
  }

  async function exportMetricsCsv(): Promise<void> {
    if (!token) {
      return;
    }
    const params = new URLSearchParams();
    params.set("days", String(metricsQuery.days));
    if ("from" in metricsQuery && metricsQuery.from && "to" in metricsQuery && metricsQuery.to) {
      params.set("from", metricsQuery.from);
      params.set("to", metricsQuery.to);
    }

    const response = await fetch(`${API}/metrics/export.csv?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    if (!response.ok) {
      return;
    }

    const blob = await response.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download =
      analyticsMode === "custom" && isCustomRangeValid
        ? `analytics-${analyticsFrom}-${analyticsTo}.csv`
        : `analytics-${analyticsPeriod}d.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(objectUrl);
  }

  async function exportMetricsXlsx(): Promise<void> {
    if (!token) {
      return;
    }
    const params = new URLSearchParams();
    params.set("days", String(metricsQuery.days));
    if ("from" in metricsQuery && metricsQuery.from && "to" in metricsQuery && metricsQuery.to) {
      params.set("from", metricsQuery.from);
      params.set("to", metricsQuery.to);
    }

    const response = await fetch(`${API}/metrics/export.xlsx?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    if (!response.ok) {
      return;
    }

    const blob = await response.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download =
      analyticsMode === "custom" && isCustomRangeValid
        ? `analytics-${analyticsFrom}-${analyticsTo}.xlsx`
        : `analytics-${analyticsPeriod}d.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(objectUrl);
  }

  function startEditingScript(script: MessageScript): void {
    setEditingScriptId(script.id);
    setScriptTitle(script.title);
    setScriptCategory(script.category || "");
    setScriptDraftBody(script.body);
    setScriptFormOpen(true);
  }

  function resetScriptForm(): void {
    setEditingScriptId("");
    setScriptTitle("");
    setScriptCategory("");
    setScriptDraftBody("");
    setScriptFormOpen(false);
  }

  async function updateDealStage(dealId: string, stage: string): Promise<void> {
    await fetch(`${API}/deals/${dealId}/stage`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ stage })
    });

    await loadDeals(token, setDeals);
    await loadConversations(token, search, filters, setConversations);
  }

  async function upsertDealStageByConversation(conversationId: string, stage: string): Promise<void> {
    await fetch(`${API}/deals/conversation/${conversationId}/stage`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ stage })
    });

    await loadDeals(token, setDeals);
    await loadConversations(token, search, filters, setConversations);
  }

  async function setConversationStatus(conversationId: string, status: "open" | "closed"): Promise<void> {
    if (!token) {
      return;
    }
    await apiSetConversationStatus(token, conversationId, status);
    await refreshConversationList({ token, search, filters, setConversations });
  }

  async function toggleConversationStatus(conversationId: string, currentStatus: "open" | "closed"): Promise<void> {
    const nextStatus = currentStatus === "open" ? "closed" : "open";
    await setConversationStatus(conversationId, nextStatus);
  }

  async function moveConversationToStage(conversationId: string, nextStage: string): Promise<void> {
    if (!nextStage) {
      return;
    }
    const existingDeal = deals.find((deal) => deal.conversation_id === conversationId);
    if (existingDeal) {
      await updateDealStage(existingDeal.id, nextStage);
      return;
    }
    await upsertDealStageByConversation(conversationId, nextStage);
  }

  async function addDealStage(): Promise<void> {
    const stageName = newDealStageName.trim();
    if (!stageName) {
      return;
    }
    setDealStageError("");
    const response = await fetch(`${API}/deals/stages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ name: stageName })
    });
    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { error?: string };
      if (errorData.error === "stage_already_exists") {
        setDealStageError(UI.stageExistsError);
      } else {
        setDealStageError(UI.stageActionFailed);
      }
      return;
    }
    setNewDealStageName("");
    await loadDealStages(token, setDealStages);
  }

  async function deleteDealStage(stageNameToDelete?: string): Promise<void> {
    const targetStageName = stageNameToDelete || customerDealStage;
    if (!targetStageName) {
      return;
    }
    const stageToDelete = dealStages.find((stage) => stage.name === targetStageName);
    if (!stageToDelete) {
      return;
    }
    setDealStageError("");
    const response = await fetch(`${API}/deals/stages/${stageToDelete.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { error?: string };
      if (errorData.error === "stage_in_use") {
        setDealStageError(UI.stageInUseError);
      } else {
        setDealStageError(UI.stageActionFailed);
      }
      return;
    }
    const nextStages = await loadDealStages(token, setDealStages);
    if (!nextStages.some((stage) => stage.name === targetStageName)) {
      setCustomerDealStage(nextStages[0]?.name || "");
    }
  }

  async function reorderDealStages(draggedId: string, targetId: string): Promise<void> {
    if (!draggedId || !targetId || draggedId === targetId || reorderingStages) {
      return;
    }
    const fromIndex = dealStages.findIndex((stage) => stage.id === draggedId);
    const toIndex = dealStages.findIndex((stage) => stage.id === targetId);
    if (fromIndex < 0 || toIndex < 0) {
      return;
    }

    const next = [...dealStages];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setDealStages(next.map((stage, index) => ({ ...stage, position: (index + 1) * 10 })));
    setReorderingStages(true);
    setDealStageError("");

    try {
      const response = await fetch(`${API}/deals/stages/reorder`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ orderedStageIds: next.map((stage) => stage.id) })
      });
      if (!response.ok) {
        setDealStageError(UI.stageReorderFailed);
        await loadDealStages(token, setDealStages);
      }
    } catch {
      setDealStageError(UI.stageReorderFailed);
      await loadDealStages(token, setDealStages);
    } finally {
      setReorderingStages(false);
      setDraggingStageId("");
    }
  }

  async function saveEditedDealStage(): Promise<void> {
    if (!editingStageId) {
      return;
    }
    const cleanName = editingStageName.trim();
    if (!cleanName) {
      setDealStageError(UI.stageActionFailed);
      return;
    }
    setDealStageError("");

    const response = await fetch(`${API}/deals/stages/${editingStageId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ name: cleanName })
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { error?: string };
      if (errorData.error === "stage_already_exists") {
        setDealStageError(UI.stageExistsError);
      } else {
        setDealStageError(UI.stageActionFailed);
      }
      return;
    }

    setEditingStageId("");
    setEditingStageName("");
    await loadDealStages(token, setDealStages);
    await loadDeals(token, setDeals);
  }

  async function saveContactCard(): Promise<void> {
    if (!selectedConversation || !contactCard) {
      return;
    }

    await fetch(`${API}/conversations/${selectedConversation}/contact`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        name: contactCard.name,
        phone: contactCard.phone,
        city: contactCard.city || "",
        inquiryReason: contactCard.inquiry_reason || "",
        clientType: contactCard.client_type || "",
        category: contactCard.category || ""
      })
    });

    const currentDeal = deals.find((deal) => deal.conversation_id === selectedConversation);
    if (currentDeal && customerDealStage && currentDeal.stage !== customerDealStage) {
      await updateDealStage(currentDeal.id, customerDealStage);
    } else if (!currentDeal && customerDealStage) {
      await upsertDealStageByConversation(selectedConversation, customerDealStage);
    }

    await loadConversations(token, search, filters, setConversations);
    await loadContactCard(token, selectedConversation, setContactCard);
    setCustomerCardOpen(false);
  }

  useEffect(() => {
    if (!selectedConversation) {
      setCustomerDealStage("");
      return;
    }
    const currentDeal = deals.find((deal) => deal.conversation_id === selectedConversation);
    if (currentDeal) {
      setCustomerDealStage(currentDeal.stage);
      return;
    }
    setCustomerDealStage("");
  }, [selectedConversation, deals, dealStages]);

  if (!token) {
    return (
      <main className="landingPage">
        <section className="landingHero">
          <div className="landingBadge">{UI.landingBadge}</div>
          <h1 className="landingTitle">{UI.landingTitle}</h1>
          <p className="landingSubtitle">{UI.landingSubtitle}</p>

          <div className="landingHighlights">
            <div className="landingHighlightCard">
              <strong>{UI.unifiedInbox}</strong>
              <span>{UI.unifiedInboxHint}</span>
            </div>
            <div className="landingHighlightCard">
              <strong>{UI.smartCohorts}</strong>
              <span>{UI.smartCohortsHint}</span>
            </div>
            <div className="landingHighlightCard">
              <strong>{UI.fastReplies}</strong>
              <span>{UI.fastRepliesHint}</span>
            </div>
          </div>
        </section>

        <aside className="loginCard">
          <div className="loginCardTop">
            <div className="brand">
              <div className="brandMark" />
              <div className="brandText">
                <div className="brandTitle">{UI.brandTitle}</div>
                <div className="brandSubtitle">{UI.demoAccess}</div>
              </div>
            </div>
          </div>

          <div className="loginCardBody">
            <h2 className="loginTitle">{UI.openWorkspace}</h2>
            <p className="loginText">{UI.loginText}</p>
            <div className="loginForm">
              <label className="loginField">
                <span className="loginFieldLabel">{UI.loginLabel}</span>
                <input
                  ref={loginInputRef}
                  className="loginInput"
                  type="text"
                  autoComplete="username"
                  value={loginInput}
                  placeholder={UI.loginPlaceholder}
                  onChange={(event) => setLoginInput(event.target.value)}
                />
              </label>
              <label className="loginField">
                <span className="loginFieldLabel">{UI.password}</span>
                <input
                  ref={passwordInputRef}
                  className="loginInput"
                  type="password"
                  autoComplete="current-password"
                  value={passwordInput}
                  placeholder={UI.passwordPlaceholder}
                  onChange={(event) => setPasswordInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void login();
                    }
                  }}
                />
              </label>
              {loginError ? <p className="loginError">{loginError}</p> : null}
              <button
                className="landingButton"
                type="button"
                onClick={() => void login()}
              >
                {UI.signIn}
              </button>
            </div>

            <div className="demoCredentials">
              <span>{UI.demoOperatorHint}</span>
              <span>{UI.demoAdminHint}</span>
            </div>
          </div>
        </aside>
      </main>
    );
  }

  return (
    <div className="appShell">
      <header className="topbar">
        <div className="brand">
          <div className="brandMark" />
          <div className="brandText">
            <div className="brandTitle">{UI.brandTitle}</div>
            <div className="brandSubtitle">{UI.landingBadge}</div>
          </div>
        </div>

        <div className="topbarSearch">
          <input
            className="topbarSearchInput"
            placeholder="Search across deals and dialogues..."
            aria-label="Search across deals and dialogues"
          />
        </div>

        <div className="topbarRight">
          <div className="topbarIconGroup" aria-label="notifications and settings">
            <button type="button" className="topbarIconButton" title="Notifications">
              {"\uD83D\uDD14"}
            </button>
            <button
              type="button"
              className="topbarIconButton"
              title="Settings"
              onClick={() => {
                if (sessionUser?.role === "admin") {
                  setCurrentSection("integrations");
                }
              }}
            >
              {"\u2699"}
            </button>
          </div>
          <div className="userChip">
            <span className="userAvatar" aria-hidden="true">
              {(sessionUser?.fullName || sessionUser?.email || "?").trim().slice(0, 1).toUpperCase()}
            </span>
            <span className="userEmail">
              {sessionUser?.login ? `${sessionUser.fullName} (${sessionUser.login})` : sessionUser?.email || ""}
            </span>
            <button type="button" className="userChipLogout" onClick={logout} title={UI.signOut}>
              {UI.signOut}
            </button>
          </div>
        </div>
      </header>

      <main className="workspaceLayout">
        <aside className="leftMenu card">
          <div className="leftMenuTitle">{UI.workspaceMenu}</div>
          {isSuperAdminUser(sessionUser) ? (
            <button
              type="button"
              className={`leftMenuButton ${currentSection === "platform" ? "active" : ""}`}
              onClick={() => setCurrentSection("platform")}
            >
              <span className="leftMenuButtonIcon" aria-hidden="true">
                {"\u25A3"}
              </span>
              <span>{UI.menuPlatform}</span>
            </button>
          ) : (
            <>
          <button
            type="button"
            className={`leftMenuButton ${currentSection === "dialogs" ? "active" : ""}`}
            onClick={() => setCurrentSection("dialogs")}
          >
            <span className="leftMenuButtonIcon" aria-hidden="true">
              {"\u25AD"}
            </span>
            <span>{UI.menuDialogs}</span>
          </button>
          <button
            type="button"
            className={`leftMenuButton ${currentSection === "pipeline" ? "active" : ""}`}
            onClick={() => setCurrentSection("pipeline")}
          >
            <span className="leftMenuButtonIcon" aria-hidden="true">
              {"\u29D2"}
            </span>
            <span>{UI.menuPipeline}</span>
          </button>
          <button
            type="button"
            className={`leftMenuButton ${currentSection === "analytics" ? "active" : ""}`}
            onClick={() => setCurrentSection("analytics")}
          >
            <span className="leftMenuButtonIcon" aria-hidden="true">
              {"\u25F4"}
            </span>
            <span>{UI.menuAnalytics}</span>
          </button>
          <button
            type="button"
            className={`leftMenuButton ${currentSection === "knowledge" ? "active" : ""}`}
            onClick={() => setCurrentSection("knowledge")}
          >
            <span className="leftMenuButtonIcon" aria-hidden="true">
              {"\u25A6"}
            </span>
            <span>{UI.menuKnowledgeBase}</span>
          </button>
          {sessionUser?.role === "admin" ? (
            <button
              type="button"
              className={`leftMenuButton ${currentSection === "integrations" ? "active" : ""}`}
              onClick={() => setCurrentSection("integrations")}
            >
              <span className="leftMenuButtonIcon" aria-hidden="true">
                {"\u2699"}
              </span>
              <span>{UI.menuIntegrations}</span>
            </button>
          ) : null}
            </>
          )}
        </aside>

        {currentSection === "platform" ? (
          token ? <PlatformPanel authToken={token} /> : null
        ) : currentSection === "dialogs" ? (
        <div className="appGrid">
          <InboxSidebar
            ui={{
              inboxTitle: UI.inboxTitle,
              chatsSuffix: UI.chatsSuffix,
              openSearchFilters: UI.openSearchFilters,
              searchByNameOrPhone: UI.searchByNameOrPhone,
              city: UI.city,
              reason: UI.reason,
              clientType: UI.clientType,
              category: UI.category,
              noMessages: UI.noMessages,
              closeCard: UI.closeCard,
              reopenCard: UI.reopenCard
            }}
            conversations={conversations}
            selectedConversation={selectedConversation}
            searchPanelOpen={searchPanelOpen}
            search={search}
            filters={filters}
            savedFilterPresets={savedFilterPresets}
            quickManagers={quickManagers}
            quickManagerByConversation={quickManagerByConversation}
            quickStageByConversation={quickStageByConversation}
            quickTaskByConversation={quickTaskByConversation}
            quickDeferMinutesByConversation={quickDeferMinutesByConversation}
            availableStageNames={availableStageNames}
            getStageLabel={(stageName) => formatStageLabel(stageName, UI)}
            onToggleSearchPanel={() => setSearchPanelOpen((prev) => !prev)}
            onSearchChange={(next) => {
              setSearch(next);
              void loadConversations(token, next, filters, setConversations);
            }}
            onFiltersChange={(next) => setFilters(next)}
            onApplyFilters={() => void loadConversations(token, search, filters, setConversations)}
            onSaveFilterPreset={saveCurrentFilterPreset}
            onResetFilters={() => {
              setFilters(DEFAULT_INBOX_FILTERS);
              void loadConversations(token, search, DEFAULT_INBOX_FILTERS, setConversations);
            }}
            onApplyFilterPreset={(preset) => void applyFilterPreset(preset)}
            onRemoveFilterPreset={removeFilterPreset}
            onSelectConversation={(id) => void onSelectConversation(id)}
            onQuickManagerChange={(conversationId, value) => {
              setQuickManagerByConversation((prev) => ({ ...prev, [conversationId]: value }));
              void assignConversationManager(conversationId, value);
            }}
            onQuickStageChange={(conversationId, value) => {
              setQuickStageByConversation((prev) => ({ ...prev, [conversationId]: value }));
              if (value) {
                void moveConversationStage(conversationId, value);
              }
            }}
            onQuickTaskChange={(conversationId, value) =>
              setQuickTaskByConversation((prev) => ({ ...prev, [conversationId]: value }))
            }
            onQuickDeferMinutesChange={(conversationId, minutes) =>
              setQuickDeferMinutesByConversation((prev) => ({ ...prev, [conversationId]: minutes }))
            }
            onCreateQuickTask={(conversationId) => void createQuickTask(conversationId)}
            onToggleConversationStatus={(conversationId, status) =>
              void toggleConversationStatus(conversationId, status)
            }
            onMarkSlaFollowUpDone={(conversationId) => void markSlaFollowUpDone(conversationId)}
            onAcknowledgeSlaEscalation={(conversationId) => void acknowledgeSlaEscalation(conversationId)}
            onDeferSlaEscalation={(conversationId, minutes) => void deferSlaEscalation(conversationId, minutes)}
          />

          <InboxThread
            ui={{
              replyBox: UI.replyBox,
              customerCard: UI.customerCard,
              openStatusSuffix: UI.openStatusSuffix,
              closedStatusSuffix: UI.closedStatusSuffix,
              noMatchingScripts: UI.noMatchingScripts,
              knowledgeBase: UI.knowledgeBase,
              searchKnowledgeBase: UI.searchKnowledgeBase,
              noKnowledgeArticles: UI.noKnowledgeArticles,
              sendArticleLink: UI.sendArticleLink,
              general: UI.general,
              emojis: UI.emojis,
              typeMessage: UI.typeMessage,
              attachFile: UI.attachFile,
              uploadingMedia: UI.uploadingMedia,
              send: UI.send,
              selectChatHint: UI.selectChatHint,
              quickScriptHint: UI.quickScriptHint,
              replyScripts: UI.replyScripts,
              searchScripts: UI.searchScripts,
              noMessages: UI.noMessages
            }}
            selectedConversationData={selectedConversationData}
            messages={messages}
            isDragOverMessages={isDragOverMessages}
            messagesContainerRef={messagesContainerRef}
            emojiPickerRef={emojiPickerRef}
            scriptPanelOpen={scriptPanelOpen}
            knowledgeQuickOpen={knowledgeQuickOpen}
            scriptSearch={scriptSearch}
            knowledgeSearch={knowledgeSearch}
            filteredScripts={filteredScripts}
            filteredKnowledgeArticles={filteredKnowledgeArticles}
            selectedScriptId={selectedScriptId}
            messageBody={messageBody}
            uploadingMedia={uploadingMedia}
            mediaUploadError={mediaUploadError}
            emojiPickerOpen={emojiPickerOpen}
            emojiOptions={EMOJI_OPTIONS}
            emojiButtonIcon={EMOJI_BUTTON_ICON}
            getMediaUrl={getMediaUrl}
            onSetPriority={(conversationId, priority) => void updateConversationPriority(conversationId, priority)}
            onOpenCustomerCard={() => setCustomerCardOpen(true)}
            onMessagesDragOver={(event) => {
              event.preventDefault();
              setIsDragOverMessages(true);
            }}
            onMessagesDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                setIsDragOverMessages(false);
              }
            }}
            onMessagesDrop={(event) => {
              event.preventDefault();
              setIsDragOverMessages(false);
              const droppedFile = event.dataTransfer.files?.[0];
              if (droppedFile) {
                void sendMediaFile(droppedFile);
              }
            }}
            onToggleScriptPanel={() =>
              setScriptPanelOpen((prev) => {
                const next = !prev;
                if (next) {
                  setKnowledgeQuickOpen(false);
                }
                return next;
              })
            }
            onToggleKnowledgeQuick={() =>
              setKnowledgeQuickOpen((prev) => {
                const next = !prev;
                if (next) {
                  setScriptPanelOpen(false);
                }
                return next;
              })
            }
            onScriptSearchChange={(value) => setScriptSearch(value)}
            onKnowledgeSearchChange={(value) => setKnowledgeSearch(value)}
            onSelectScript={(scriptId, body) => {
              setSelectedScriptId(scriptId);
              setMessageBody(body);
            }}
            onSelectKnowledgeArticle={(body) => setMessageBody(body)}
            onSendKnowledgeArticleLink={(article) => void sendKnowledgeArticleLink(article)}
            onToggleEmojiPicker={() => setEmojiPickerOpen((prev) => !prev)}
            onMessageBodyChange={(value) => {
              setMessageBody(value);
              if (mediaUploadError) {
                setMediaUploadError("");
              }
            }}
            onPickFile={(file) => {
              void sendMediaFile(file);
            }}
            onSendMessage={() => void sendMessage()}
            onAppendEmoji={(emoji) => {
              setMessageBody((prev) => `${prev}${emoji}`);
              setEmojiPickerOpen(false);
            }}
            onAcknowledgeSlaEscalation={(conversationId) => void acknowledgeSlaEscalation(conversationId)}
            onDeferSlaEscalation={(conversationId, minutes) => void deferSlaEscalation(conversationId, minutes)}
          />

          <aside className="rightRail card">
          <div className="railHeader">
            <div>
              <div className="sidebarTitle">{UI.pipelineAndKpi}</div>
              <div className="sidebarHint">{UI.salesOverview}</div>
            </div>
          </div>

          <div className="kpiGrid">
            <div className="kpiCard">
              <div className="kpiValue">{metrics?.firstResponseMinutes ?? 0} {UI.min}</div>
              <div className="kpiLabel">{UI.firstResponse}</div>
            </div>
            <div className="kpiCard">
              <div className="kpiValue">{metrics?.handledConversations7d ?? 0}</div>
              <div className="kpiLabel">{UI.chats7d}</div>
            </div>
            <div className="kpiCard">
              <div className="kpiValue">{metrics?.sentMessages7d ?? 0}</div>
              <div className="kpiLabel">{UI.outgoing7d}</div>
            </div>
          </div>

          <div className="tableSection">
            <div className="tableTitle">{UI.deals}</div>
            <table className="dealTable">
              <thead>
                <tr>
                  <th>{UI.client}</th>
                  <th>{UI.amount}</th>
                  <th>{UI.stage}</th>
                </tr>
              </thead>
              <tbody>
                {deals.map((deal) => (
                  <tr key={deal.id}>
                    <td>{deal.contact_name}</td>
                    <td>{deal.amount}</td>
                    <td>
                      <select
                        className="stageSelect"
                        value={deal.stage}
                        onChange={(event) => void updateDealStage(deal.id, event.target.value)}
                      >
                        {availableStageNames.map((stageName) => (
                          <option key={stageName} value={stageName}>
                            {formatStageLabel(stageName, UI)}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </aside>
        </div>
        ) : currentSection === "knowledge" ? (
          <section className="knowledgePage card">
            <div className="railHeader">
              <div>
                <div className="sidebarTitle">{UI.knowledgeBase}</div>
                <div className="sidebarHint">{UI.knowledgeBaseHint}</div>
              </div>
            </div>

            <div className="knowledgePageGrid">
              <div className="knowledgeListCard">
                <input
                  className="searchInput"
                  placeholder={UI.searchKnowledgeBase}
                  value={knowledgeSearch}
                  onChange={(event) => setKnowledgeSearch(event.target.value)}
                />

                <div className="knowledgeArticlesList">
                  {filteredKnowledgeArticles.length ? (
                    filteredKnowledgeArticles.map((article) => (
                      <div key={article.id} className="scriptCard">
                        <div className="scriptCardMain">
                          <span className="scriptCardTop">
                            <span className="scriptCardTitle">{article.title}</span>
                            <span className="scriptBadge">{article.category || UI.general}</span>
                          </span>
                          <span className="scriptCardBody">{article.summary || article.url}</span>
                        </div>
                        <div className="scriptCardActions">
                          <button type="button" className="textButton" onClick={() => void sendKnowledgeArticleLink(article)}>
                            {UI.sendArticleLink}
                          </button>
                          <button
                            type="button"
                            className="textButton dangerButton"
                            onClick={() => void deleteKnowledgeArticle(article.id)}
                          >
                            {UI.delete}
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="emptyScriptState">{UI.noKnowledgeArticles}</div>
                  )}
                </div>
              </div>

              <div className="knowledgeFormCard">
                <div className="scriptPanelTitle">{UI.newScript}</div>
                <div className="scriptForm">
                  <input
                    className="filterInput"
                    placeholder={UI.articleTitle}
                    value={articleTitle}
                    onChange={(event) => setArticleTitle(event.target.value)}
                  />
                  <input
                    className="filterInput"
                    placeholder={UI.articleUrl}
                    value={articleUrl}
                    onChange={(event) => setArticleUrl(event.target.value)}
                  />
                  <input
                    className="filterInput"
                    placeholder={UI.category}
                    value={articleCategory}
                    onChange={(event) => setArticleCategory(event.target.value)}
                  />
                  <textarea
                    className="scriptTextarea scriptTextareaLarge"
                    placeholder={UI.articleSummary}
                    value={articleSummary}
                    onChange={(event) => setArticleSummary(event.target.value)}
                  />
                  <button type="button" className="primaryButton" onClick={() => void createKnowledgeArticle()}>
                    {UI.saveArticle}
                  </button>
                </div>
              </div>
            </div>
          </section>
        ) : currentSection === "integrations" ? (
          token ? <IntegrationsPanel authToken={token} /> : null
        ) : currentSection === "analytics" ? (
          <section className="analyticsPage card">
            <div className="railHeader">
              <div>
                <div className="sidebarTitle">{UI.analyticsTitle}</div>
                <div className="sidebarHint">{UI.analyticsHint}</div>
              </div>
              <div className="pipelineFilterButtons">
                {[7, 14, 30].map((period) => (
                  <button
                    key={`analytics-period-${period}`}
                    type="button"
                    className={`leftMenuButton ${analyticsPeriod === period ? "active" : ""}`}
                    onClick={() => {
                      setAnalyticsMode("preset");
                      setAnalyticsPeriod(period as 7 | 14 | 30);
                    }}
                  >
                    {`${period} \u0434\u043d.`}
                  </button>
                ))}
                <button
                  type="button"
                  className={`leftMenuButton ${analyticsMode === "custom" ? "active" : ""}`}
                  onClick={() => setAnalyticsMode("custom")}
                >
                  {UI.customRange}
                </button>
              </div>
            </div>
            {analyticsMode === "custom" ? (
              <div className="analyticsDateFilters">
                <label className="analyticsDateField">
                  <span>{UI.fromDate}</span>
                  <input
                    type="date"
                    value={analyticsFrom}
                    onChange={(event) => setAnalyticsFrom(event.target.value)}
                  />
                </label>
                <label className="analyticsDateField">
                  <span>{UI.toDate}</span>
                  <input
                    type="date"
                    value={analyticsTo}
                    onChange={(event) => setAnalyticsTo(event.target.value)}
                  />
                </label>
                {!isCustomRangeValid ? <div className="analyticsDateError">������� ���������� �������� ���.</div> : null}
              </div>
            ) : null}
            {sessionUser?.role === "admin" ? (
              <div className="analyticsSettingsCard">
                <div className="analyticsSettingsColumn">
                  <div>
                    <div className="analyticsLabel">{UI.autoAssignmentTitle}</div>
                    <div className="sidebarHint">{UI.autoAssignmentHint}</div>
                  </div>
                  <div className="pipelineFilterButtons">
                    <select
                      className="filterInput"
                      value={autoAssignmentStrategy}
                      onChange={(event) => setAutoAssignmentStrategy(event.target.value as AutoAssignmentStrategy)}
                    >
                      <option value="round_robin">{UI.strategyRoundRobin}</option>
                      <option value="least_open_load">{UI.strategyLeastLoad}</option>
                    </select>
                    <button
                      type="button"
                      className="secondaryButton"
                      disabled={autoAssignmentSaving}
                      onClick={() => void saveAutoAssignmentStrategy()}
                    >
                      {UI.saveStrategy}
                    </button>
                  </div>
                </div>
                <div className="analyticsSettingsColumn">
                  <div className="analyticsLoadHeader">
                    <div className="analyticsLabel">{UI.loadTitle}</div>
                    <button
                      type="button"
                      className="secondaryButton"
                      disabled={autoAssignmentRefreshing}
                      onClick={() => void refreshAutoAssignmentLoad()}
                    >
                      {UI.refreshNow}
                    </button>
                  </div>
                  <div className="analyticsLoadMeta">
                    {autoAssignmentLoadUpdatedAt
                      ? `${UI.updatedAgo} ${formatSecondsAgo(autoAssignmentLoadUpdatedAt)}`
                      : null}
                  </div>
                  <div className="analyticsLoadList">
                    {autoAssignmentLoad.map((row) => (
                      <div key={row.managerId} className="analyticsLoadRow">
                        <span>{row.managerName}</span>
                        <strong>{`${row.openConversations} ${UI.loadDialogs}`}</strong>
                      </div>
                    ))}
                    {autoAssignmentLoad.length ? null : (
                      <div className="analyticsManagersEmpty">Нет активных менеджеров.</div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
            <div className="analyticsGrid">
              <div className="analyticsCard">
                <div className="analyticsValue">{metrics?.totalConversations ?? 0}</div>
                <div className="analyticsLabel">{UI.totalDialogs}</div>
              </div>
              <div className="analyticsCard">
                <div className="analyticsValue">{metrics?.openConversations ?? 0}</div>
                <div className="analyticsLabel">{UI.openDialogs}</div>
              </div>
              <div className="analyticsCard">
                <div className="analyticsValue">{metrics?.closedConversations7d ?? 0}</div>
                <div className="analyticsLabel">{`������� �� ${metrics?.periodDays ?? analyticsPeriod} ��.`}</div>
              </div>
              <div className="analyticsCard">
                <div className="analyticsValue">{metrics?.firstResponseMinutes ?? 0} {UI.min}</div>
                <div className="analyticsLabel">{UI.firstResponse}</div>
              </div>
              <div className="analyticsCard">
                <div className="analyticsValue">{metrics?.openToCloseMinutes ?? 0} {UI.min}</div>
                <div className="analyticsLabel">{UI.closeSpeed}</div>
              </div>
              <div className="analyticsCard">
                <div className="analyticsValue">{metrics?.messages7d ?? 0}</div>
                <div className="analyticsLabel">{`���� ��������� �� ${metrics?.periodDays ?? analyticsPeriod} ��.`}</div>
              </div>
              <div className="analyticsCard">
                <div className="analyticsValue">{metrics?.avgMessagesPerConversation ?? 0}</div>
                <div className="analyticsLabel">{UI.avgMessagesPerDialog}</div>
              </div>
              <div className="analyticsCard analyticsCardWide">
                <div className="analyticsLabel">{UI.channelSplit}</div>
                <div className="analyticsChannels">
                  <div className="analyticsChannelItem">
                    <span>{UI.whatsappChannel}</span>
                    <strong>{metrics?.whatsappConversations ?? 0}</strong>
                  </div>
                  <div className="analyticsChannelItem">
                    <span>{UI.telegramChannel}</span>
                    <strong>{metrics?.telegramConversations ?? 0}</strong>
                  </div>
                </div>
              </div>
              <div className="analyticsCard analyticsCardWide">
                <div className="analyticsLabel">{UI.managersKpiTitle}</div>
                <div className="analyticsManagersTable">
                  <div className="analyticsManagersHead">
                    <span>{UI.managerLabel}</span>
                    <span>{UI.dialogsHandledLabel}</span>
                    <span>{UI.outgoingMessagesLabel}</span>
                  </div>
                  {(metrics?.managersKpi || []).map((row) => (
                    <div key={row.managerId} className="analyticsManagersRow">
                      <span>{row.managerName}</span>
                      <strong>{row.dialogsHandled}</strong>
                      <strong>{row.outgoingMessages}</strong>
                    </div>
                  ))}
                  {metrics?.managersKpi?.length ? null : (
                    <div className="analyticsManagersEmpty">Нет данных по менеджерам за выбранный период.</div>
                  )}
                </div>
              </div>
              <div className="analyticsCard analyticsCardWide">
                <div className="analyticsLabel">{UI.stageKpiTitle}</div>
                <div className="analyticsManagersTable">
                  <div className="analyticsManagersHead">
                    <span>{UI.stageLabel}</span>
                    <span>{UI.stageDealsLabel}</span>
                    <span>{UI.stageAmountLabel}</span>
                  </div>
                  {(metrics?.stageKpi || []).map((row) => (
                    <div key={row.stageName} className="analyticsManagersRow">
                      <span>{formatStageLabel(row.stageName, UI)}</span>
                      <strong>{row.dealsCount}</strong>
                      <strong>{row.dealsAmount.toLocaleString("ru-RU")}</strong>
                    </div>
                  ))}
                  {metrics?.stageKpi?.length ? null : (
                    <div className="analyticsManagersEmpty">Нет данных по этапам за выбранный период.</div>
                  )}
                </div>
              </div>
              <div className="analyticsCard analyticsCardWide">
                <div className="analyticsLabel">{UI.slaKpiTitle}</div>
                <div className="analyticsManagersTable">
                  <div className="analyticsManagersHead">
                    <span>{UI.managerLabel}</span>
                    <span>{UI.slaManagerEscalationsLabel}</span>
                    <span>{UI.slaManagerDelayLabel}</span>
                  </div>
                  {(metrics?.slaManagers || []).map((row) => (
                    <div key={row.managerId} className="analyticsManagersRow">
                      <span>{row.managerName}</span>
                      <strong>{row.escalatedCount}</strong>
                      <strong>{row.avgDelayMinutes}</strong>
                    </div>
                  ))}
                  {metrics?.slaManagers?.length ? null : (
                    <div className="analyticsManagersEmpty">Нет SLA-эскалаций за выбранный период.</div>
                  )}
                </div>
                <div className="analyticsChannels">
                  <div className="analyticsChannelItem">
                    <span>{UI.slaEscalationsLabel}</span>
                    <strong>{metrics?.slaEscalations ?? 0}</strong>
                  </div>
                  <div className="analyticsChannelItem">
                    <span>{UI.slaDelayLabel}</span>
                    <strong>{metrics?.slaAverageDelayMinutes ?? 0}</strong>
                  </div>
                </div>
              </div>
              <div className="analyticsCard analyticsCardChart">
                <div className="analyticsLabel">{`\u0414\u0438\u043d\u0430\u043c\u0438\u043a\u0430: ${metricsPeriodLabel}`}</div>
                <div className="analyticsMiniCharts">
                  <MiniBars
                    title={UI.dynamicsMessages}
                    values={(metrics?.dailySeries || []).map((item) => item.messages)}
                    labels={(metrics?.dailySeries || []).map((item) => item.day)}
                  />
                  <MiniBars
                    title={UI.dynamicsDialogs}
                    values={(metrics?.dailySeries || []).map((item) => item.dialogs)}
                    labels={(metrics?.dailySeries || []).map((item) => item.day)}
                  />
                  <MiniBars
                    title={UI.dynamicsClosed}
                    values={(metrics?.dailySeries || []).map((item) => item.closed)}
                    labels={(metrics?.dailySeries || []).map((item) => item.day)}
                  />
                </div>
              </div>
              <div className="analyticsCard analyticsCardWide">
                <div className="analyticsLabel">{UI.snapshotsTitle}</div>
                <div className="pipelineFilterButtons">
                  <button type="button" className="secondaryButton" onClick={() => void exportMetricsCsv()}>
                    {UI.exportCsv}
                  </button>
                  <button type="button" className="secondaryButton" onClick={() => void exportMetricsXlsx()}>
                    {UI.exportXlsx}
                  </button>
                  <button type="button" className="secondaryButton" onClick={() => void createMetricSnapshot()}>
                    {UI.createSnapshot}
                  </button>
                </div>
                <div className="analyticsSnapshotsList">
                  {metricSnapshots.map((snapshot) => (
                    <div key={`${snapshot.periodStart}-${snapshot.periodEnd}-${snapshot.createdAt}`} className="analyticsSnapshotRow">
                      <span>{`${snapshot.periodStart} - ${snapshot.periodEnd}`}</span>
                      <span>{`${snapshot.totalConversations}/${snapshot.openConversations}/${snapshot.closedConversations}`}</span>
                      <span>{snapshot.messages}</span>
                    </div>
                  ))}
                  {metricSnapshots.length ? null : <div className="analyticsManagersEmpty">Снимков пока нет.</div>}
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section className="pipelinePage card">
            <div className="railHeader">
              <div>
                <div className="sidebarTitle">{UI.pipelineBoardTitle}</div>
                <div className="sidebarHint">{UI.pipelineBoardHint}</div>
              </div>
              <div className="pipelineFilterButtons">
                <button
                  type="button"
                  className={`leftMenuButton ${pipelineStatusFilter === "open" ? "active" : ""}`}
                  onClick={() => setPipelineStatusFilter("open")}
                >
                  {UI.openCards}
                </button>
                <button
                  type="button"
                  className={`leftMenuButton ${pipelineStatusFilter === "closed" ? "active" : ""}`}
                  onClick={() => setPipelineStatusFilter("closed")}
                >
                  {UI.closedCards}
                </button>
              </div>
            </div>
            <div className="pipelineBoardGrid">
              {pipelineColumns.map((column) => {
                const columnConversations = conversations.filter(
                  (conversation) => conversation.status === pipelineStatusFilter && (conversation.stage || "") === column.key
                );
                return (
                  <div
                    className={`pipelineBoardColumn ${dragOverStageKey === column.key ? "dragOver" : ""}`}
                    key={column.key || "empty-stage"}
                    onDragOver={(event) => {
                      event.preventDefault();
                      if (pipelineStatusFilter === "open") {
                        setDragOverStageKey(column.key);
                      }
                    }}
                    onDragLeave={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                        setDragOverStageKey("");
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const conversationId = event.dataTransfer.getData("text/plain") || draggingConversationId;
                      setDragOverStageKey("");
                      setDraggingConversationId("");
                      if (pipelineStatusFilter !== "open" || !conversationId) {
                        return;
                      }
                      void moveConversationToStage(conversationId, column.key);
                    }}
                  >
                    <div className="pipelineBoardColumnHeader">
                      <span className="pipelineBoardColumnTitle">{column.label}</span>
                      <span className="pipelineBoardColumnCount">{columnConversations.length}</span>
                    </div>
                    <div className="pipelineBoardCards">
                      {columnConversations.length ? (
                        columnConversations.map((conversation) => (
                          <button
                            type="button"
                            className="pipelineBoardCard"
                            key={conversation.id}
                            draggable={pipelineStatusFilter === "open"}
                            onDragStart={(event) => {
                              event.dataTransfer.setData("text/plain", conversation.id);
                              setDraggingConversationId(conversation.id);
                            }}
                            onDragEnd={() => {
                              setDraggingConversationId("");
                              setDragOverStageKey("");
                            }}
                            onClick={() => {
                              setCurrentSection("dialogs");
                              void onSelectConversation(conversation.id);
                            }}
                          >
                            <div className="pipelineBoardCardName">{conversation.contact_name}</div>
                            <div className="pipelineBoardCardMeta">{conversation.phone}</div>
                            <div className="pipelineBoardCardSnippet">
                              {conversation.last_message_body || UI.noMessages}
                            </div>
                            <div className="pipelineBoardCardActions">
                              <button
                                type="button"
                                className="textButton dangerButton"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void setConversationStatus(
                                    conversation.id,
                                    pipelineStatusFilter === "open" ? "closed" : "open"
                                  );
                                }}
                              >
                                {pipelineStatusFilter === "open" ? UI.closeCard : UI.reopenCard}
                              </button>
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="emptyScriptState">{UI.noCardsInStage}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>

      {customerCardOpen && contactCard ? (
        <div className="drawerOverlay" onClick={() => setCustomerCardOpen(false)}>
          <aside className="customerDrawer" onClick={(event) => event.stopPropagation()}>
            <div className="drawerHeader">
              <div>
                <div className="sidebarTitle">{UI.customerCardTitle}</div>
                <div className="sidebarHint">{UI.customerCardHint}</div>
              </div>
              <button type="button" className="drawerClose" onClick={() => setCustomerCardOpen(false)}>
                {UI.close}
              </button>
            </div>

            <div className="drawerForm">
              <label className="fieldLabel">
                {UI.name}
                <input
                  className="filterInput"
                  value={contactCard.name}
                  onChange={(event) => setContactCard((prev) => (prev ? { ...prev, name: event.target.value } : prev))}
                />
              </label>
              <label className="fieldLabel">
                {UI.phone}
                <input
                  className="filterInput"
                  value={contactCard.phone}
                  onChange={(event) => setContactCard((prev) => (prev ? { ...prev, phone: event.target.value } : prev))}
                />
              </label>
              <label className="fieldLabel">
                {UI.city}
                <input
                  className="filterInput"
                  value={contactCard.city || ""}
                  onChange={(event) => setContactCard((prev) => (prev ? { ...prev, city: event.target.value } : prev))}
                />
              </label>
              <label className="fieldLabel">
                {UI.inquiryReason}
                <input
                  className="filterInput"
                  value={contactCard.inquiry_reason || ""}
                  onChange={(event) =>
                    setContactCard((prev) => (prev ? { ...prev, inquiry_reason: event.target.value } : prev))
                  }
                />
              </label>
              <label className="fieldLabel">
                {UI.clientType}
                <input
                  className="filterInput"
                  value={contactCard.client_type || ""}
                  onChange={(event) =>
                    setContactCard((prev) => (prev ? { ...prev, client_type: event.target.value } : prev))
                  }
                />
              </label>
              <label className="fieldLabel">
                {UI.category}
                <input
                  className="filterInput"
                  value={contactCard.category || ""}
                  onChange={(event) =>
                    setContactCard((prev) => (prev ? { ...prev, category: event.target.value } : prev))
                  }
                />
              </label>
              <label className="fieldLabel">
                {UI.funnel}
                <select
                  className="stageSelect"
                  value={customerDealStage}
                  onChange={(event) => {
                    setCustomerDealStage(event.target.value);
                    if (dealStageError) {
                      setDealStageError("");
                    }
                  }}
                >
                  <option value="">{UI.notSelected}</option>
                  {availableStageNames.map((stageName) => (
                    <option key={stageName} value={stageName}>
                      {formatStageLabel(stageName, UI)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="secondaryButton"
                onClick={() => {
                  setPipelineManagerOpen(true);
                  setDealStageError("");
                }}
              >
                {UI.manageFunnel}
              </button>
              <div className="drawerActions">
                <button type="button" className="primaryButton" onClick={() => void saveContactCard()}>
                  {UI.save}
                </button>
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {pipelineManagerOpen ? (
        <div
          className="drawerOverlay"
          onClick={() => {
            setPipelineManagerOpen(false);
            setEditingStageId("");
            setEditingStageName("");
          }}
        >
          <aside className="pipelineManagerModal" onClick={(event) => event.stopPropagation()}>
            <div className="drawerHeader">
              <div>
                <div className="sidebarTitle">{UI.manageFunnel}</div>
                <div className="sidebarHint">{UI.funnel}</div>
              </div>
              <button
                type="button"
                className="drawerClose"
                onClick={() => {
                  setPipelineManagerOpen(false);
                  setEditingStageId("");
                  setEditingStageName("");
                }}
              >
                {UI.close}
              </button>
            </div>
            <div className="stageManagerRow">
              <input
                className="filterInput"
                placeholder={UI.newStepPlaceholder}
                value={newDealStageName}
                onChange={(event) => {
                  setNewDealStageName(event.target.value);
                  if (dealStageError) {
                    setDealStageError("");
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void addDealStage();
                  }
                }}
              />
              <button type="button" className="secondaryButton" onClick={() => void addDealStage()}>
                {UI.addStep}
              </button>
            </div>
            <div className="sidebarHint">{UI.stageReorderHint}</div>
            <div className="pipelineStageList">
              {(dealStages.length ? dealStages : []).map((stage) => (
                <div
                  className={`pipelineStageRow ${draggingStageId === stage.id ? "dragging" : ""}`}
                  key={stage.id}
                  draggable={!reorderingStages}
                  onClick={() => {
                    setEditingStageId(stage.id);
                    setEditingStageName(stage.name);
                    setDealStageError("");
                  }}
                  onDragStart={() => setDraggingStageId(stage.id)}
                  onDragOver={(event) => {
                    event.preventDefault();
                  }}
                  onDrop={() => void reorderDealStages(draggingStageId, stage.id)}
                  onDragEnd={() => setDraggingStageId("")}
                >
                  {editingStageId === stage.id ? (
                    <>
                      <span className="pipelineStageLabel pipelineStageEditor">
                        <span className="pipelineDragHandle" aria-hidden="true">
                          {"\u22EE\u22EE"}
                        </span>
                        <input
                          className="filterInput"
                          value={editingStageName}
                          onChange={(event) => setEditingStageName(event.target.value)}
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              void saveEditedDealStage();
                            }
                            if (event.key === "Escape") {
                              setEditingStageId("");
                              setEditingStageName("");
                            }
                          }}
                        />
                      </span>
                      <div className="pipelineStageActions">
                        <button
                          type="button"
                          className="textButton"
                          onClick={(event) => {
                            event.stopPropagation();
                            void saveEditedDealStage();
                          }}
                        >
                          {UI.saveStep}
                        </button>
                        <button
                          type="button"
                          className="textButton"
                          onClick={(event) => {
                            event.stopPropagation();
                            setEditingStageId("");
                            setEditingStageName("");
                          }}
                        >
                          {UI.cancel}
                        </button>
                        <button
                          type="button"
                          className="textButton dangerButton"
                          onClick={(event) => {
                            event.stopPropagation();
                            void deleteDealStage(stage.name);
                          }}
                        >
                          {UI.deleteStep}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="pipelineStageLabel">
                        <span className="pipelineDragHandle" aria-hidden="true">
                          {"\u22EE\u22EE"}
                        </span>
                        <span>{formatStageLabel(stage.name, UI)}</span>
                      </span>
                      <button
                        type="button"
                        className="textButton dangerButton"
                        onClick={(event) => {
                          event.stopPropagation();
                          void deleteDealStage(stage.name);
                        }}
                      >
                        {UI.deleteStep}
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
            {dealStageError ? <div className="drawerInlineError">{dealStageError}</div> : null}
          </aside>
        </div>
      ) : null}

      {scriptLibraryOpen ? (
        <div
          className="drawerOverlay"
          onClick={() => {
            setScriptLibraryOpen(false);
            resetScriptForm();
          }}
        >
          <aside className="scriptLibraryDrawer" onClick={(event) => event.stopPropagation()}>
            <div className="drawerHeader">
              <div>
                <div className="sidebarTitle">{UI.scriptLibrary}</div>
                <div className="sidebarHint">{UI.scriptLibraryHint}</div>
              </div>
              <button
                type="button"
                className="drawerClose"
                onClick={() => {
                  setScriptLibraryOpen(false);
                  resetScriptForm();
                }}
              >
                {UI.close}
              </button>
            </div>

            <div className="scriptLibraryContent">
              <div className="scriptLibrarySidebar">
                <button
                  type="button"
                  className="primaryButton"
                  onClick={() => {
                    resetScriptForm();
                    setScriptFormOpen(true);
                  }}
                >
                  {UI.newScript}
                </button>

                <input
                  className="searchInput"
                  placeholder={UI.searchScripts}
                  value={scriptSearch}
                  onChange={(event) => setScriptSearch(event.target.value)}
                />

                <div className="scriptVariables">
                  {UI.variablesLabel}: `{"{name}"}` `{"{city}"}` `{"{phone}"}` `{"{reason}"}` `{"{client_type}"}` `{"{category}"}`
                </div>

                <div className="scriptLibraryList">
                  {filteredScripts.map((script) => {
                    const isSelected = script.id === selectedScriptId;
                    const preview = applyScriptVariables(script.body, contactCard, selectedConversationData);

                    return (
                      <div key={script.id} className={`scriptCard ${isSelected ? "active" : ""}`}>
                        <button
                          type="button"
                          className="scriptCardMain"
                          onClick={() => {
                            setSelectedScriptId(script.id);
                            setMessageBody(preview);
                          }}
                        >
                          <span className="scriptCardTop">
                            <span className="scriptCardTitle">{script.title}</span>
                            <span className="scriptBadge">{script.category || UI.general}</span>
                          </span>
                          <span className="scriptCardBody">{preview}</span>
                        </button>
                        <div className="scriptCardActions">
                          <button type="button" className="textButton" onClick={() => startEditingScript(script)}>
                            {UI.edit}
                          </button>
                          <button type="button" className="textButton dangerButton" onClick={() => void deleteScript(script.id)}>
                            {UI.delete}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

              </div>

              <div className="scriptLibraryEditor">
                <div className="scriptPanelTitle">{editingScriptId ? UI.editScript : UI.createScript}</div>
                <div className="sidebarHint">{UI.scriptEditorHint}</div>

                <div className="scriptForm">
                  <input
                    className="filterInput"
                    placeholder={UI.scriptTitle}
                    value={scriptTitle}
                    onChange={(event) => setScriptTitle(event.target.value)}
                  />
                  <input
                    className="filterInput"
                    placeholder={UI.category}
                    value={scriptCategory}
                    onChange={(event) => setScriptCategory(event.target.value)}
                  />
                  <textarea
                    className="scriptTextarea scriptTextareaLarge"
                    placeholder={UI.scriptText}
                    value={scriptDraftBody}
                    onChange={(event) => setScriptDraftBody(event.target.value)}
                  />
                  <div className="scriptFormActions">
                    <button type="button" className="secondaryButton" onClick={() => resetScriptForm()}>
                      {UI.clear}
                    </button>
                    <button type="button" className="primaryButton" onClick={() => void createScript()}>
                      {editingScriptId ? UI.updateScript : UI.saveScript}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      ) : null}
      {toastVisible ? (
        <div
          className={`appToast ${toastKind}`}
          onMouseEnter={pauseToastAutoHide}
          onMouseLeave={resumeToastAutoHide}
        >
          <span>{toastMessage}</span>
          <button type="button" className="appToastClose" onClick={closeToast} aria-label="Закрыть уведомление">
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}

async function loadDeals(token: string, setDeals: (data: Deal[]) => void): Promise<void> {
  const response = await fetch(`${API}/deals`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  setDeals(await response.json());
}

async function loadDealStages(
  token: string,
  setDealStages: (data: PipelineStage[]) => void
): Promise<PipelineStage[]> {
  const response = await fetch(`${API}/deals/stages`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = (await response.json()) as PipelineStage[];
  setDealStages(data);
  return data;
}

async function loadQuickActionsMeta(
  token: string,
  setManagers: (data: QuickActionManager[]) => void,
  setDealStages: (data: PipelineStage[]) => void
): Promise<void> {
  const response = await fetch(`${API}/conversations/quick-actions-meta`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = (await response.json()) as { managers?: QuickActionManager[]; stages?: PipelineStage[] };
  setManagers(data.managers || []);
  if (data.stages?.length) {
    setDealStages(data.stages);
  }
}

async function loadMetrics(
  token: string,
  setMetrics: (data: Metrics) => void,
  query: number | { days: number; from?: string; to?: string } = 14
): Promise<void> {
  const days = typeof query === "number" ? query : query.days;
  const params = new URLSearchParams({ days: String(days) });
  if (typeof query !== "number" && query.from && query.to) {
    params.set("from", query.from);
    params.set("to", query.to);
  }

  const response = await fetch(`${API}/metrics/overview?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  setMetrics(await response.json());
}

async function loadMetricSnapshots(
  token: string,
  setMetricSnapshots: (data: MetricSnapshot[]) => void
): Promise<void> {
  const response = await fetch(`${API}/metrics/snapshots`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  setMetricSnapshots(await response.json());
}

async function loadAutoAssignmentStrategy(
  token: string,
  setStrategy: (strategy: AutoAssignmentStrategy) => void
): Promise<void> {
  const response = await fetch(`${API}/metrics/auto-assignment-strategy`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    return;
  }
  const data = (await response.json()) as { strategy?: AutoAssignmentStrategy };
  if (data.strategy === "least_open_load" || data.strategy === "round_robin") {
    setStrategy(data.strategy);
  }
}

async function updateAutoAssignmentStrategy(
  token: string,
  strategy: AutoAssignmentStrategy
): Promise<void> {
  await fetch(`${API}/metrics/auto-assignment-strategy`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ strategy })
  });
}

async function loadAutoAssignmentLoad(
  token: string,
  setLoad: (data: AutoAssignmentLoadItem[]) => void
): Promise<void> {
  const response = await fetch(`${API}/metrics/auto-assignment-load`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    return;
  }
  setLoad((await response.json()) as AutoAssignmentLoadItem[]);
}

function dateOffsetISO(daysBeforeToday: number): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysBeforeToday);
  return date.toISOString().slice(0, 10);
}

function diffDaysInclusive(from: string, to: string): number {
  const fromDate = new Date(`${from}T00:00:00`);
  const toDate = new Date(`${to}T00:00:00`);
  const diffMs = Math.max(0, toDate.getTime() - fromDate.getTime());
  return Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1;
}

function formatSecondsAgo(timestampMs: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestampMs) / 1000));
  if (seconds < 60) {
    return `${seconds} сек. назад`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes} мин. назад`;
}

function formatDateRangeLabel(value: string): string {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) {
    return value;
  }
  return `${day}.${month}`;
}

function applyScriptVariables(
  template: string,
  contactCard: ContactCard | null,
  conversation: Conversation | null
): string {
  const replacements: Record<string, string> = {
    "{name}": contactCard?.name || conversation?.contact_name || "",
    "{city}": contactCard?.city || conversation?.city || "",
    "{phone}": contactCard?.phone || conversation?.phone || "",
    "{reason}": contactCard?.inquiry_reason || conversation?.inquiry_reason || "",
    "{client_type}": contactCard?.client_type || conversation?.client_type || "",
    "{category}": contactCard?.category || conversation?.category || ""
  };

  return Object.entries(replacements).reduce((result, [key, value]) => result.split(key).join(value), template);
}

function formatStageLabel(stage: string, ui: typeof UI): string {
  switch (stage) {
    case "new":
      return ui.stageNew;
    case "qualified":
      return ui.stageQualified;
    case "proposal":
      return ui.stageProposal;
    case "won":
      return ui.stageWon;
    case "lost":
      return ui.stageLost;
    default:
      return stage;
  }
}

function MiniBars({ title, values, labels }: { title: string; values: number[]; labels: string[] }): JSX.Element {
  const maxValue = Math.max(1, ...values);
  const pointsCount = Math.max(1, values.length);
  return (
    <div className="miniBars">
      <div className="miniBarsTitle">{title}</div>
      <div className="miniBarsTrack" style={{ gridTemplateColumns: `repeat(${pointsCount}, minmax(0, 1fr))` }}>
        {values.map((value, index) => (
          <div
            key={`${title}-${labels[index] || index}`}
            className="miniBar"
            title={`${labels[index] || ""}: ${value}`}
            style={{ height: `${Math.max(6, Math.round((value / maxValue) * 56))}px` }}
          />
        ))}
      </div>
      <div className="miniBarsFooter">
        <span>{labels[0] || ""}</span>
        <span>{labels[labels.length - 1] || ""}</span>
      </div>
    </div>
  );
}
