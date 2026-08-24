import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { io } from "socket.io-client";
import { API_BASE_URL, SOCKET_BASE_URL } from "./shared/config/api";
import { buildDemoTelegramUrl, buildDemoWhatsAppUrl } from "./shared/config/demoContacts";
import {
  isNotificationSoundEnabled,
  playIncomingMessageSound,
  setNotificationSoundEnabled,
  unlockNotificationSound
} from "./shared/lib/notificationSound";
import {
  clearStoredSession,
  persistSession,
  readStoredSession,
  SESSION_TOKEN_KEY,
  SESSION_USER_KEY,
  validateStoredSession,
  type SessionUser
} from "./shared/auth/session";
import { InboxSidebar } from "./features/inbox/InboxSidebar";
import { InboxThread } from "./features/inbox/InboxThread";
import { LandingWebChat } from "./features/landing/LandingWebChat";
import { IosHomeScreenHint } from "./features/pwa/IosHomeScreenHint";
import { BottomNav, type MobileNavSection } from "./shared/ui/BottomNav";
import { NotificationBellButton } from "./shared/ui/NotificationBellButton";
import {
  canRecordVoiceForWhatsApp,
  extensionForRecordedAudio,
  formatRecordingDuration,
  isAudioFile,
  normalizeVoiceFile,
  pickVoiceRecorderMimeType
} from "./features/inbox/lib/voiceRecorder";
import { startNativeVoiceRecording, stopNativeVoiceRecording } from "./features/inbox/lib/nativeVoiceRecorder";
import {
  ensureCameraPermission,
  ensureMicrophonePermission,
  isNativeApp
} from "./shared/platform/devicePermissions";
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
  loadKnowledgeSettings,
  saveKnowledgeSettingsApi,
  updateKnowledgeArticleApi,
  removeScript,
  sendConversationTextMessage,
  upsertScript,
  loadScripts
} from "./features/inbox/api/contentApi";
import type {
  ContactCard,
  Conversation,
  InboxFilters,
  KnowledgeArticle,
  KnowledgeSettings,
  Message,
  MessageScript,
  QuickActionManager,
  SavedInboxFilterPreset
} from "./features/inbox/model/types";
import {
  appendOutgoingMessage,
  patchOutgoingMessage,
  refreshAfterMessage,
  refreshConversationList,
  refreshConversationListBackground,
  refreshKnowledge,
  refreshScripts,
  type CreatedMessageResponse
} from "./features/inbox/model/actions";
import { IntegrationsPanel } from "./features/integrations/IntegrationsPanel";
import { MarketingPanel } from "./features/marketing/MarketingPanel";
import { OpsPanel } from "./features/ops/OpsPanel";
import { PlatformPanel } from "./features/platform/PlatformPanel";
import { FunnelKpiPanel } from "./features/funnel/FunnelKpiPanel";
import { AnalyticsCharts } from "./features/analytics/AnalyticsCharts";
import { OwnerDashboard } from "./features/analytics/OwnerDashboard";
import { StaffChatPanel } from "./features/staff/StaffChatPanel";
import { TelephonySoftphone } from "./features/telephony/TelephonySoftphone";
import { requestTelephonyDial, type CallLogResult } from "./features/telephony/api";
import { loadStaffUnreadCount, shareConversationToStaff } from "./features/staff/api";
import {
  createCrmTask,
  globalSearch,
  loadCrmContactDetails,
  loadCrmContacts,
  loadCrmTasks,
  loadFollowUpSettings,
  mergeCrmContacts,
  saveFollowUpSettingsApi,
  updateCrmTask,
  updateDealDetails,
  type CrmContactDetails,
  type CrmContactListItem,
  type CrmTask,
  type FollowUpSettings,
  type GlobalSearchResult
} from "./features/crm/api";

type Deal = {
  id: string;
  conversation_id: string;
  stage: string;
  amount: string;
  next_step_at?: string | null;
  contact_name: string;
  manager_name: string;
  contact_id?: string;
};

type StageOutcome = "open" | "won" | "lost";

type PipelineStage = {
  id: string;
  name: string;
  position: number;
  outcome?: StageOutcome;
};

type ContactRequiredFieldKey = "city" | "inquiry_reason" | "client_type" | "category";

const CONTACT_REQUIRED_FIELD_OPTIONS: ContactRequiredFieldKey[] = [
  "city",
  "inquiry_reason",
  "client_type",
  "category"
];

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
  instagramConversations?: number;
  emailConversations?: number;
  webConversations?: number;
  salesKpi?: {
    totalDeals: number;
    wonDeals: number;
    lostDeals: number;
    wonAmount: number;
    pipelineAmount: number;
    winRate: number;
  };
  managersKpi?: Array<{
    managerId: string;
    managerName: string;
    dialogsHandled: number;
    outgoingMessages: number;
    wonDeals?: number;
    lostDeals?: number;
    wonAmount?: number;
    winRate?: number;
    avgFirstResponseMinutes?: number;
    overdueSlaCount?: number;
  }>;
  ownerKpi?: {
    revenueWon: number;
    pipelineAmount: number;
    winRate: number;
    avgFirstResponseMinutes: number;
    leads?: number;
    wonDeals?: number;
    conversion?: number;
  };
  laggingManagers?: Array<{
    managerId: string;
    managerName: string;
    wonAmount?: number;
    winRate?: number;
    avgFirstResponseMinutes?: number;
    overdueSlaCount?: number;
    dialogsHandled?: number;
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
    won?: number;
    lost?: number;
    winRate?: number;
  }>;
  weeklySeries?: Array<{
    week: string;
    messages: number;
    dialogs: number;
    closed: number;
    won: number;
    lost: number;
    winRate: number;
  }>;
  managersLoadSeries?: Array<{
    day: string;
    managerId: string;
    managerName: string;
    dialogsHandled: number;
    outgoingMessages: number;
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

type AutoAssignmentStrategy = "round_robin" | "least_open_load";
type AutoAssignmentLoadItem = {
  managerId: string;
  managerName: string;
  openConversations: number;
};

type ToastKind = "success" | "error";

const API = API_BASE_URL;
const INBOX_FILTER_PRESETS_KEY = "lightcrm.inboxFilterPresets";
const LEFT_MENU_COLLAPSED_KEY = "lightcrm.leftMenuCollapsed";
const DEFAULT_INBOX_FILTERS: InboxFilters = {
  city: "",
  inquiryReason: "",
  clientType: "",
  category: "",
  priority: "",
  attention: "",
  source: ""
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
  bookDemo: "\u0417\u0430\u043f\u0438\u0441\u0430\u0442\u044c\u0441\u044f \u043d\u0430 \u0434\u0435\u043c\u043e",
  bookDemoWhatsApp: "WhatsApp",
  bookDemoTelegram: "Telegram",
  bookDemoHint: "\u041f\u0438\u043b\u043e\u0442 14 \u0434\u043d\u0435\u0439 \u043f\u043e\u0434 \u043a\u043b\u044e\u0447 \u00b7 \u043f\u043e\u0441\u043b\u0435 \u043f\u0438\u043b\u043e\u0442\u0430 29 900 \u20b8/\u043c\u0435\u0441",
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
  demoAdminHint: "\u0410\u0434\u043c\u0438\u043d: \u043b\u043e\u0433\u0438\u043d admin \u0438\u043b\u0438 admin@demo.local, \u043f\u0430\u0440\u043e\u043b\u044c demo123",
  demoSuperAdminHint: "\u0421\u0443\u043f\u0435\u0440-\u0430\u0434\u043c\u0438\u043d: superadmin / superadmin123",
  sessionRestoring: "\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043c \u0441\u0435\u0440\u0432\u0435\u0440\u2026 \u043e\u0431\u044b\u0447\u043d\u043e 30\u201360 \u0441\u0435\u043a",
  signOut: "\u0412\u044b\u0445\u043e\u0434",
  password: "\u041f\u0430\u0440\u043e\u043b\u044c",
  workspaceMenu: "\u041c\u0435\u043d\u044e",
  collapseMenu: "\u0421\u0432\u0435\u0440\u043d\u0443\u0442\u044c \u043c\u0435\u043d\u044e",
  expandMenu: "\u0420\u0430\u0437\u0432\u0435\u0440\u043d\u0443\u0442\u044c \u043c\u0435\u043d\u044e",
  menuDialogs: "\u0414\u0438\u0430\u043b\u043e\u0433\u0438",
  menuPipeline: "\u0412\u043e\u0440\u043e\u043d\u043a\u0430",
  menuFunnelKpi: "\u0412\u043e\u0440\u043e\u043d\u043a\u0430 \u0438 KPI",
  funnelKpiTab: "KPI \u0438 \u0441\u0434\u0435\u043b\u043a\u0438",
  funnelBoardTab: "\u0414\u043e\u0441\u043a\u0430 \u0432\u043e\u0440\u043e\u043d\u043a\u0438",
  menuTasks: "\u0417\u0430\u0434\u0430\u0447\u0438",
  menuStaff: "\u041a\u043e\u043c\u0430\u043d\u0434\u0430",
  shareToTeam: "\u041f\u0435\u0440\u0435\u0434\u0430\u0442\u044c \u0432 \u041a\u043e\u043c\u0430\u043d\u0434\u0443",
  shareToTeamShort: "\u0412 \u041a\u043e\u043c\u0430\u043d\u0434\u0443",
  shareToTeamDone: "\u0414\u0438\u0430\u043b\u043e\u0433 \u043f\u0435\u0440\u0435\u0434\u0430\u043d \u0432 \u041a\u043e\u043c\u0430\u043d\u0434\u0443",
  menuContacts: "\u041a\u043b\u0438\u0435\u043d\u0442\u044b",
  menuProfile: "\u041f\u0440\u043e\u0444\u0438\u043b\u044c",
  sectionDialogsCenter: "Dialogs Center",
  sectionFunnel: "\u0412\u043e\u0440\u043e\u043d\u043a\u0430 \u043a\u043b\u0438\u0435\u043d\u0442\u043e\u0432",
  sectionTasks: "\u0417\u0430\u0434\u0430\u0447\u0438",
  sectionStaff: "\u041a\u043e\u043c\u0430\u043d\u0434\u0430",
  sectionContacts: "\u041a\u043b\u0438\u0435\u043d\u0442\u044b",
  sectionProfile: "\u041f\u0440\u043e\u0444\u0438\u043b\u044c",
  globalSearchPlaceholder: "\u041f\u043e\u0438\u0441\u043a: \u0434\u0438\u0430\u043b\u043e\u0433\u0438, \u043a\u043b\u0438\u0435\u043d\u0442\u044b, \u0441\u0434\u0435\u043b\u043a\u0438...",
  newTaskPlaceholder: "\u041d\u043e\u0432\u0430\u044f \u0437\u0430\u0434\u0430\u0447\u0430",
  markTaskDone: "\u0413\u043e\u0442\u043e\u0432\u043e",
  reopenTask: "\u0412\u0435\u0440\u043d\u0443\u0442\u044c",
  openTasksTab: "\u041e\u0442\u043a\u0440\u044b\u0442\u044b\u0435",
  doneTasksTab: "\u0412\u044b\u043f\u043e\u043b\u043d\u0435\u043d\u043d\u044b\u0435",
  noTasks: "\u0417\u0430\u0434\u0430\u0447 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442",
  followUpSettings: "\u0410\u0432\u0442\u043e follow-up",
  followUpEnabled: "\u0412\u043a\u043b\u044e\u0447\u0438\u0442\u044c \u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0447\u0435\u0441\u043a\u0438\u0435 \u043d\u0430\u043f\u043e\u043c\u0438\u043d\u0430\u043d\u0438\u044f",
  followUpOnStage: "\u041f\u0440\u0438 \u0441\u043c\u0435\u043d\u0435 \u044d\u0442\u0430\u043f\u0430 \u0441\u0434\u0435\u043b\u043a\u0438",
  followUpStageHours: "\u0427\u0435\u0440\u0435\u0437 \u0441\u043a\u043e\u043b\u044c\u043a\u043e \u0447\u0430\u0441\u043e\u0432 \u043d\u0430\u043f\u043e\u043c\u043d\u0438\u0442\u044c (\u044d\u0442\u0430\u043f)",
  followUpOnSilence: "\u0415\u0441\u043b\u0438 \u0434\u043e\u043b\u0433\u043e \u043d\u0435\u0442 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0439 \u0432 \u0434\u0438\u0430\u043b\u043e\u0433\u0435",
  followUpSilenceHours: "\u0422\u0438\u0448\u0438\u043d\u0430, \u0447\u0430\u0441\u043e\u0432",
  followUpSkipClosed: "\u041d\u0435 \u0441\u043e\u0437\u0434\u0430\u0432\u0430\u0442\u044c \u043d\u0430 \u0432\u044b\u0438\u0433\u0440\u0430\u043d\u043d\u044b\u0445/\u043f\u0440\u043e\u0438\u0433\u0440\u0430\u043d\u043d\u044b\u0445 \u044d\u0442\u0430\u043f\u0430\u0445",
  saveFollowUp: "\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c follow-up",
  contactTimeline: "\u0418\u0441\u0442\u043e\u0440\u0438\u044f",
  mergeContact: "\u0421\u043a\u043b\u0435\u0438\u0442\u044c \u0441...",
  dealAmount: "\u0421\u0443\u043c\u043c\u0430",
  dealNextStep: "\u0421\u043b\u0435\u0434\u0443\u044e\u0449\u0438\u0439 \u0448\u0430\u0433",
  saveDeal: "\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0441\u0434\u0435\u043b\u043a\u0443",
  salesConversion: "\u041a\u043e\u043d\u0432\u0435\u0440\u0441\u0438\u044f \u043f\u0440\u043e\u0434\u0430\u0436",
  winRate: "Win rate",
  wonAmount: "\u0412\u044b\u0440\u0443\u0447\u043a\u0430",
  pipelineAmountLabel: "\u0412 \u0432\u043e\u0440\u043e\u043d\u043a\u0435",
  sendToMessenger: "\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u0432 \u043c\u0435\u0441\u0441\u0435\u043d\u0434\u0436\u0435\u0440",
  menuAnalytics: "\u0410\u043d\u0430\u043b\u0438\u0442\u0438\u043a\u0430",
  menuKnowledgeBase: "\u0411\u0430\u0437\u0430 \u0437\u043d\u0430\u043d\u0438\u0439",
  menuMarketing: "\u041c\u0430\u0440\u043a\u0435\u0442\u0438\u043d\u0433",
  menuOps: "\u041e\u043f\u0435\u0440\u0430\u0446\u0438\u0438",
  backToChats: "\u041a \u0447\u0430\u0442\u0430\u043c",
  menuIntegrations: "\u0418\u043d\u0442\u0435\u0433\u0440\u0430\u0446\u0438\u0438",
  menuPlatform: "\u041a\u043e\u043c\u043f\u0430\u043d\u0438\u0438",
  inboxTitle: "\u0414\u0438\u0430\u043b\u043e\u0433\u0438",
  searchClients: "\u041f\u043e\u0438\u0441\u043a \u043a\u043b\u0438\u0435\u043d\u0442\u043e\u0432",
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
  knowledgeBaseHint: "\u0421\u043e\u0437\u0434\u0430\u0432\u0430\u0439\u0442\u0435 \u0438\u043d\u0441\u0442\u0440\u0443\u043a\u0446\u0438\u0438 \u0438 \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u044f\u0439\u0442\u0435 \u043a\u043b\u0438\u0435\u043d\u0442\u0443 \u043f\u043e\u043d\u044f\u0442\u043d\u0443\u044e \u0441\u0441\u044b\u043b\u043a\u0443.",
  searchKnowledgeBase: "\u041f\u043e\u0438\u0441\u043a \u043f\u043e \u0431\u0430\u0437\u0435 \u0437\u043d\u0430\u043d\u0438\u0439",
  noKnowledgeArticles:
    "\u0421\u0442\u0430\u0442\u0435\u0439 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442. \u0414\u043e\u0431\u0430\u0432\u044c\u0442\u0435 \u043f\u0435\u0440\u0432\u0443\u044e \u0438\u043d\u0441\u0442\u0440\u0443\u043a\u0446\u0438\u044e \u0438\u043b\u0438 \u0433\u0430\u0439\u0434.",
  noShareableKnowledge:
    "\u041d\u0435\u0442 \u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d\u043d\u044b\u0445 \u0441\u0442\u0430\u0442\u0435\u0439. \u041e\u043f\u0443\u0431\u043b\u0438\u043a\u0443\u0439\u0442\u0435 \u0438\u0445 \u0432 \u0411\u0430\u0437\u0435 \u0437\u043d\u0430\u043d\u0438\u0439.",
  articleTitle: "\u0417\u0430\u0433\u043e\u043b\u043e\u0432\u043e\u043a \u0441\u0442\u0430\u0442\u044c\u0438",
  articleUrl: "\u0412\u043d\u0435\u0448\u043d\u044f\u044f \u0441\u0441\u044b\u043b\u043a\u0430 (\u043d\u0435\u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u043e)",
  articleBody: "\u0422\u0435\u043a\u0441\u0442 \u0441\u0442\u0430\u0442\u044c\u0438 / \u0438\u043d\u0441\u0442\u0440\u0443\u043a\u0446\u0438\u0438 (\u043c\u043e\u0436\u043d\u043e ## \u0437\u0430\u0433\u043e\u043b\u043e\u0432\u043a\u0438 \u0438 \u0441\u043f\u0438\u0441\u043a\u0438)",
  articleSummary: "\u041a\u0440\u0430\u0442\u043a\u043e\u0435 \u043e\u043f\u0438\u0441\u0430\u043d\u0438\u0435",
  articleStatus: "\u0421\u0442\u0430\u0442\u0443\u0441",
  articleDraft: "\u0427\u0435\u0440\u043d\u043e\u0432\u0438\u043a",
  articlePublished: "\u041e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d\u043e",
  articleExpires: "Срок ссылки (необязательно)",
  articlePinned: "\u0417\u0430\u043a\u0440\u0435\u043f\u0438\u0442\u044c",
  articleArchived: "\u0412 \u0430\u0440\u0445\u0438\u0432",
  articleViews: "\u043f\u0440\u043e\u0441\u043c\u043e\u0442\u0440\u043e\u0432",
  articleExpired: "\u0418\u0441\u0442\u0435\u043a\u043b\u0430",
  openArticleLink: "\u041e\u0442\u043a\u0440\u044b\u0442\u044c",
  insertArticleText: "\u0412\u0441\u0442\u0430\u0432\u0438\u0442\u044c \u0442\u0435\u043a\u0441\u0442",
  knowledgeAllCategories: "\u0412\u0441\u0435",
  knowledgeActiveTab: "\u0410\u043a\u0442\u0438\u0432\u043d\u044b\u0435",
  knowledgeArchiveTab: "\u0410\u0440\u0445\u0438\u0432",
  knowledgeBrandSettings: "\u0421\u0442\u0440\u0430\u043d\u0438\u0446\u0430 \u0434\u043b\u044f \u043a\u043b\u0438\u0435\u043d\u0442\u0430",
  knowledgeBrandName: "\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435 \u043a\u043e\u043c\u043f\u0430\u043d\u0438\u0438",
  knowledgeContactUrl: "\u0421\u0441\u044b\u043b\u043a\u0430 \u00ab\u041d\u0430\u043f\u0438\u0441\u0430\u0442\u044c \u043d\u0430\u043c\u00bb (https://...)",
  saveKnowledgeSettings: "\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438",
  knowledgeTemplates: "\u0428\u0430\u0431\u043b\u043e\u043d\u044b",
  saveArticle: "\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0441\u0442\u0430\u0442\u044c\u044e",
  sendArticleLink: "\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u0441\u0441\u044b\u043b\u043a\u0443",
  copyArticleLink: "\u041a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0441\u0441\u044b\u043b\u043a\u0443",
  editArticle: "\u0420\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c",
  newKnowledgeArticle: "\u041d\u043e\u0432\u0430\u044f \u0441\u0442\u0430\u0442\u044c\u044f",
  articleNotShareable: "\u0421\u0442\u0430\u0442\u044c\u044f \u043d\u0435 \u043e\u043f\u0443\u0431\u043b\u0438\u043a\u043e\u0432\u0430\u043d\u0430 \u0438\u043b\u0438 \u0441\u0441\u044b\u043b\u043a\u0430 \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u0430",
  typeMessage: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435...",
  emojis: "\u0421\u043c\u0430\u0439\u043b\u0438\u043a\u0438",
  attachFile: "\u041f\u0440\u0438\u043a\u0440\u0435\u043f\u0438\u0442\u044c \u0444\u0430\u0439\u043b",
  recordAudio: "\u0417\u0430\u043f\u0438\u0441\u0430\u0442\u044c \u0433\u043e\u043b\u043e\u0441\u043e\u0432\u043e\u0435",
  voiceRecordingAppOnly:
    "\u0413\u043e\u043b\u043e\u0441\u043e\u0432\u044b\u0435 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b \u0442\u043e\u043b\u044c\u043a\u043e \u0432 \u043c\u043e\u0431\u0438\u043b\u044c\u043d\u043e\u043c \u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0438 Light CRM",
  recordingAudio: "\u0417\u0430\u043f\u0438\u0441\u044c...",
  sendVoice: "\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u0433\u043e\u043b\u043e\u0441",
  cancelRecording: "\u041e\u0442\u043c\u0435\u043d\u0430",
  microphoneUnavailable: "\u041c\u0438\u043a\u0440\u043e\u0444\u043e\u043d \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d. \u0420\u0430\u0437\u0440\u0435\u0448\u0438\u0442\u0435 \u0434\u043e\u0441\u0442\u0443\u043f \u0432 \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0430\u0445 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0430 \u0438\u043b\u0438 \u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u044f.",
  microphonePermissionDenied:
    "\u0414\u043e\u0441\u0442\u0443\u043f \u043a \u043c\u0438\u043a\u0440\u043e\u0444\u043e\u043d\u0443 \u0437\u0430\u043f\u0440\u0435\u0449\u0451\u043d. \u041e\u0442\u043a\u0440\u043e\u0439\u0442\u0435 \u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u2192 \u041f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u044f \u2192 Light CRM \u2192 \u0420\u0430\u0437\u0440\u0435\u0448\u0435\u043d\u0438\u044f \u0438 \u0432\u043a\u043b\u044e\u0447\u0438\u0442\u0435 \u043c\u0438\u043a\u0440\u043e\u0444\u043e\u043d.",
  cameraPermissionDenied:
    "\u0414\u043e\u0441\u0442\u0443\u043f \u043a \u043a\u0430\u043c\u0435\u0440\u0435 \u0438 \u0433\u0430\u043b\u0435\u0440\u0435\u0435 \u0437\u0430\u043f\u0440\u0435\u0449\u0451\u043d. \u0420\u0430\u0437\u0440\u0435\u0448\u0438\u0442\u0435 \u0432 \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0430\u0445 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0430 \u0434\u043b\u044f Light CRM.",
  dropMediaHint: "\u041f\u0435\u0440\u0435\u0442\u0430\u0449\u0438\u0442\u0435 \u043a\u0430\u0440\u0442\u0438\u043d\u043a\u0443 \u0438\u043b\u0438 \u0432\u0438\u0434\u0435\u043e \u0441\u044e\u0434\u0430",
  uploadingMedia: "\u041e\u0442\u043f\u0440\u0430\u0432\u043a\u0430...",
  unsupportedMediaFormat:
    "\u041c\u043e\u0436\u043d\u043e \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u044f\u0442\u044c \u043a\u0430\u0440\u0442\u0438\u043d\u043a\u0438, \u0432\u0438\u0434\u0435\u043e \u0438 \u0430\u0443\u0434\u0438\u043e.",
  mediaFileTooLarge: "\u0424\u0430\u0439\u043b \u0441\u043b\u0438\u0448\u043a\u043e\u043c \u0431\u043e\u043b\u044c\u0448\u043e\u0439. \u041c\u0430\u043a\u0441\u0438\u043c\u0443\u043c 20 \u041c\u0411.",
  mediaUploadFailed: "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u0444\u0430\u0439\u043b.",
  recordingStartFailed:
    "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043d\u0430\u0447\u0430\u0442\u044c \u0437\u0430\u043f\u0438\u0441\u044c. \u0420\u0430\u0437\u0440\u0435\u0448\u0438\u0442\u0435 \u0434\u043e\u0441\u0442\u0443\u043f \u043a \u043c\u0438\u043a\u0440\u043e\u0444\u043e\u043d\u0443 \u0438 \u043f\u043e\u043f\u0440\u043e\u0431\u0443\u0439\u0442\u0435 \u0441\u043d\u043e\u0432\u0430.",
  whatsappDeliveryFailed:
    "\u0424\u0430\u0439\u043b \u0441\u043e\u0445\u0440\u0430\u043d\u0451\u043d \u0432 CRM, \u043d\u043e \u043d\u0435 \u0434\u043e\u0441\u0442\u0430\u0432\u043b\u0435\u043d \u0432 WhatsApp.",
  whatsappAudioFormatUnsupported:
    "WhatsApp \u043d\u0435 \u043f\u043e\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u0442 \u044d\u0442\u043e\u0442 \u0444\u043e\u0440\u043c\u0430\u0442 \u0430\u0443\u0434\u0438\u043e. \u0417\u0430\u043f\u0438\u0441\u044b\u0432\u0430\u0439\u0442\u0435 \u0433\u043e\u043b\u043e\u0441 \u0447\u0435\u0440\u0435\u0437 \u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0435 \u043d\u0430 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0435.",
  whatsappNotConfigured:
    "WhatsApp \u043d\u0435 \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0451\u043d. \u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u0438\u043d\u0442\u0435\u0433\u0440\u0430\u0446\u0438\u044e \u0432 \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0430\u0445.",
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
  stageOutcomeOpen: "\u0412 \u0440\u0430\u0431\u043e\u0442\u0435",
  stageOutcomeWon: "\u0412\u044b\u0438\u0433\u0440\u0430\u043d\u043e",
  stageOutcomeLost: "\u041f\u0440\u043e\u0438\u0433\u0440\u0430\u043d\u043e",
  stageOutcomeHint: "\u0422\u0438\u043f \u044d\u0442\u0430\u043f\u0430: \u0432 \u0440\u0430\u0431\u043e\u0442\u0435 / \u0432\u044b\u0438\u0433\u0440\u0430\u043d\u043e / \u043f\u0440\u043e\u0438\u0433\u0440\u0430\u043d\u043e",
  requiredFieldsTitle: "\u041e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u044b\u0435 \u043f\u043e\u043b\u044f \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0438",
  requiredFieldsHint:
    "\u0418\u043c\u044f \u0438 \u0442\u0435\u043b\u0435\u0444\u043e\u043d \u0432\u0441\u0435\u0433\u0434\u0430 \u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u044b. \u041e\u0441\u0442\u0430\u043b\u044c\u043d\u043e\u0435 \u2014 \u043f\u043e \u0432\u044b\u0431\u043e\u0440\u0443.",
  requiredFieldsSaved: "\u041e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u044b\u0435 \u043f\u043e\u043b\u044f \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u044b",
  applyRePresetTitle: "Пресет: Недвижимость KZ",
  applyRePresetHint:
    "Этапы RU, 8 скриптов, обязательные город и повод обращения, черновик лендинга.",
  applyRePresetButton: "Применить пресет",
  applyRePresetDone: "Пресет «Недвижимость KZ» применён",
  applyRePresetFailed: "Не удалось применить пресет",
  contactFieldsRequired: "\u0417\u0430\u043f\u043e\u043b\u043d\u0438\u0442\u0435 \u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u044b\u0435 \u043f\u043e\u043b\u044f \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0438",
  stageChangeBlockedFields: "\u041d\u0435\u043b\u044c\u0437\u044f \u0441\u043c\u0435\u043d\u0438\u0442\u044c \u044d\u0442\u0430\u043f: \u0437\u0430\u043f\u043e\u043b\u043d\u0438\u0442\u0435 \u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u044b\u0435 \u043f\u043e\u043b\u044f",
  pipelineBoardTitle: "\u0412\u043e\u0440\u043e\u043d\u043a\u0430 \u043a\u043b\u0438\u0435\u043d\u0442\u043e\u0432",
  pipelineBoardHint: "\u041a\u0430\u0440\u0442\u043e\u0447\u043a\u0438 \u0441\u0433\u0440\u0443\u043f\u043f\u0438\u0440\u043e\u0432\u0430\u043d\u044b \u043f\u043e \u0448\u0430\u0433\u0430\u043c \u0438\u0437 \u043f\u0440\u043e\u0444\u0438\u043b\u044f \u043a\u043b\u0438\u0435\u043d\u0442\u0430.",
  noCardsInStage: "\u0412 \u044d\u0442\u043e\u043c \u0448\u0430\u0433\u0435 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442 \u043a\u0430\u0440\u0442\u043e\u0447\u0435\u043a.",
  closeCard: "\u0417\u0430\u043a\u0440\u044b\u0442\u044c",
  reopenCard: "\u041f\u0435\u0440\u0435\u043e\u0442\u043a\u0440\u044b\u0442\u044c",
  takeIntoWork: "\u0412\u0437\u044f\u0442\u044c \u0432 \u0440\u0430\u0431\u043e\u0442\u0443",
  alreadyInWork: "\u0423\u0436\u0435 \u0432 \u0440\u0430\u0431\u043e\u0442\u0435",
  assignedTo: "\u041e\u043f\u0435\u0440\u0430\u0442\u043e\u0440",
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

const MIN_VOICE_RECORDING_MS = 900;
const RECORDING_READY_TIMEOUT_MS = 12000;

async function waitUntilRecordingActive(
  nativeRecordingRef: { current: boolean },
  mediaRecorderRef: { current: MediaRecorder | null },
  recordingStartingRef: { current: boolean },
  timeoutMs: number
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (nativeRecordingRef.current) {
      return true;
    }
    const state = mediaRecorderRef.current?.state;
    if (state === "recording" || state === "paused") {
      return true;
    }
    if (!recordingStartingRef.current && !nativeRecordingRef.current && !mediaRecorderRef.current) {
      return false;
    }
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 50);
    });
  }
  return nativeRecordingRef.current || mediaRecorderRef.current?.state === "recording";
}

async function waitMinimumRecordingDuration(startedAt: number | null, minMs: number): Promise<void> {
  if (!startedAt) {
    return;
  }
  const elapsed = Date.now() - startedAt;
  if (elapsed < minMs) {
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, minMs - elapsed);
    });
  }
}

export function App(): JSX.Element {
  const initialSession = readStoredSession();
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const loginInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const [token, setToken] = useState<string>(initialSession.token);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(initialSession.user);
  const [sessionRestoring, setSessionRestoring] = useState<boolean>(Boolean(initialSession.token));
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
  const [isSendingMessage, setIsSendingMessage] = useState<boolean>(false);
  const sendingMessageRef = useRef<boolean>(false);
  const [recordingAudio, setRecordingAudio] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const nativeRecordingRef = useRef<boolean>(false);
  const recordingStartingRef = useRef<boolean>(false);
  const recordingStartedAtRef = useRef<number | null>(null);
  const stopAndSendInProgressRef = useRef<boolean>(false);
  const pendingStopAndSendRef = useRef<boolean>(false);
  const [mediaUploadError, setMediaUploadError] = useState<string>("");
  const [searchPanelOpen, setSearchPanelOpen] = useState<boolean>(false);
  const [notificationSoundOn, setNotificationSoundOn] = useState<boolean>(() => isNotificationSoundEnabled());
  const [knowledgeQuickOpen, setKnowledgeQuickOpen] = useState<boolean>(false);
  const [currentSection, setCurrentSection] = useState<
    | "dialogs"
    | "pipeline"
    | "tasks"
    | "staff"
    | "contacts"
    | "profile"
    | "analytics"
    | "knowledge"
    | "marketing"
    | "ops"
    | "integrations"
    | "platform"
  >("dialogs");
  const [staffUnreadCount, setStaffUnreadCount] = useState(0);
  const [crmTasks, setCrmTasks] = useState<CrmTask[]>([]);
  const [taskStatusFilter, setTaskStatusFilter] = useState<"open" | "done">("open");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDueLocal, setNewTaskDueLocal] = useState("");
  const [crmContacts, setCrmContacts] = useState<CrmContactListItem[]>([]);
  const [contactsSearch, setContactsSearch] = useState("");
  const [selectedContactId, setSelectedContactId] = useState("");
  const [contactDetails, setContactDetails] = useState<CrmContactDetails | null>(null);
  const [mergeSourceContactId, setMergeSourceContactId] = useState("");
  const [selectedDealId, setSelectedDealId] = useState("");
  const [dealAmountDraft, setDealAmountDraft] = useState("");
  const [dealNextStepDraft, setDealNextStepDraft] = useState("");
  const [dealStageDraft, setDealStageDraft] = useState("");
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [globalSearchResults, setGlobalSearchResults] = useState<GlobalSearchResult | null>(null);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [followUpSettings, setFollowUpSettings] = useState<FollowUpSettings>({
    enabled: true,
    onStageChange: true,
    stageDueHours: 24,
    onSilence: true,
    silenceHours: 48,
    skipClosedStages: true
  });
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
  const [articleBody, setArticleBody] = useState<string>("");
  const [articleStatus, setArticleStatus] = useState<"draft" | "published">("published");
  const [articleExpiresLocal, setArticleExpiresLocal] = useState<string>("");
  const [articlePinned, setArticlePinned] = useState<boolean>(false);
  const [articleArchived, setArticleArchived] = useState<boolean>(false);
  const [editingArticleId, setEditingArticleId] = useState<string>("");
  const [knowledgeCategoryFilter, setKnowledgeCategoryFilter] = useState<string>("");
  const [knowledgeShowArchive, setKnowledgeShowArchive] = useState<boolean>(false);
  const [knowledgeBrandName, setKnowledgeBrandName] = useState<string>("");
  const [knowledgeContactUrl, setKnowledgeContactUrl] = useState<string>("");
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
  const [contactRequiredFields, setContactRequiredFields] = useState<ContactRequiredFieldKey[]>([]);
  const [applyingRePreset, setApplyingRePreset] = useState(false);
  const [pipelineStatusFilter, setPipelineStatusFilter] = useState<"open" | "closed">("open");
  const [pipelineSubview, setPipelineSubview] = useState<"kpi" | "board">("kpi");
  const [funnelKpiPanelOpen, setFunnelKpiPanelOpen] = useState(true);
  const [leftMenuCollapsed, setLeftMenuCollapsed] = useState(() => {
    return localStorage.getItem(LEFT_MENU_COLLAPSED_KEY) === "1";
  });
  const [canCollapseLeftMenu, setCanCollapseLeftMenu] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1101px)").matches
  );
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
  const [isMobileLayout, setIsMobileLayout] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 768px)").matches : false
  );
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);
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
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    if (!code || !state) return;
    try {
      const expected = sessionStorage.getItem("instagram_oauth_state");
      if (expected && expected === state) {
        setCurrentSection("integrations");
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!token) {
      return;
    }

    const refreshOpenThread = (conversationId?: string): void => {
      const targetId = conversationId || selectedConversation;
      if (targetId) {
        void loadMessages(token, targetId, setMessages);
      }
    };

    const refreshInbox = (): void => {
      void loadConversations(token, search, filters, setConversations);
    };

    const socket = io(SOCKET_BASE_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelayMax: 10000
    });

    const onSocketReady = (): void => {
      refreshInbox();
      refreshOpenThread();
    };

    socket.on("connect", onSocketReady);
    socket.on("message:new", (payload: {
      conversationId?: string;
      messageId?: string;
      direction?: "incoming" | "outgoing";
      body?: string;
      attachmentUrl?: string | null;
      attachmentType?: "image" | "video" | "audio" | "document" | null;
      attachmentName?: string | null;
      metaMediaId?: string | null;
      createdAt?: string;
    }) => {
      if (payload?.direction !== "outgoing") {
        playIncomingMessageSound();
      }
      void loadConversations(token, search, filters, setConversations);
      if (!payload?.conversationId || payload.conversationId !== selectedConversation || !payload.messageId) {
        return;
      }
      setMessages((prev) => {
        if (prev.some((message) => message.id === payload.messageId)) {
          return prev;
        }
        return [
          ...prev,
          {
            id: payload.messageId as string,
            direction: payload.direction || "incoming",
            body: payload.body || "",
            attachment_url: payload.attachmentUrl || null,
            attachment_type: payload.attachmentType || null,
            attachment_name: payload.attachmentName || null,
            meta_media_id: payload.metaMediaId || null,
            created_at: payload.createdAt || new Date().toISOString()
          }
        ];
      });
    });

    socket.on("task:new", (payload: {
      kind?: string;
      title?: string;
      conversationId?: string;
    }) => {
      if (payload?.kind === "landing_lead") {
        setToastKind("success");
        setToastMessage(payload.title || "Новый лид с лендинга");
        setToastVisible(true);
        if (toastTimerRef.current) {
          window.clearTimeout(toastTimerRef.current);
        }
        toastTimerRef.current = window.setTimeout(() => {
          setToastVisible(false);
        }, 3500);
        void loadConversations(token, search, filters, setConversations);
      }
    });

    socket.on("staff:message", (payload: {
      workspaceId?: string;
      threadId?: string;
      message?: {
        id: string;
        author_user_id?: string | null;
        body?: string;
        is_system?: boolean;
      };
    }) => {
      if (!payload?.threadId || !payload.message) {
        return;
      }
      window.dispatchEvent(new CustomEvent("staff:message", { detail: payload }));
      if (payload.message.author_user_id && payload.message.author_user_id === sessionUser?.id) {
        return;
      }
      if (currentSection !== "staff") {
        setStaffUnreadCount((prev) => prev + 1);
        playIncomingMessageSound();
        setToastKind("success");
        setToastMessage("Новое сообщение в Команде");
        setToastVisible(true);
        if (toastTimerRef.current) {
          window.clearTimeout(toastTimerRef.current);
        }
        toastTimerRef.current = window.setTimeout(() => {
          setToastVisible(false);
        }, 2800);
      }
    });

    socket.on("call:update", (payload: {
      conversation_id?: string | null;
      status?: string;
    }) => {
      void loadConversations(token, search, filters, setConversations);
      if (!payload?.conversation_id) {
        return;
      }
      if (payload.conversation_id === selectedConversation) {
        void loadMessages(token, payload.conversation_id, setMessages);
      }
      if (payload.status === "ringing" || payload.status === "started" || payload.status === "answered") {
        setSelectedConversation(payload.conversation_id);
        setMobileThreadOpen(true);
      }
    });

    socket.on("message:updated", (payload: {
      conversationId?: string;
      messageId?: string;
      metaMediaId?: string | null;
      whatsappDeliveryFailed?: boolean;
      deliveryError?: string | null;
    }) => {
      if (!payload?.conversationId || payload.conversationId !== selectedConversation || !payload.messageId) {
        return;
      }
      patchOutgoingMessage(setMessages, {
        messageId: payload.messageId,
        metaMediaId: payload.metaMediaId
      });
      if (payload.whatsappDeliveryFailed) {
        if (payload.deliveryError === "unsupported_audio_format") {
          setMediaUploadError(UI.whatsappAudioFormatUnsupported);
        } else if (payload.deliveryError === "whatsapp_not_configured") {
          setMediaUploadError(UI.whatsappNotConfigured);
        } else {
          setMediaUploadError(UI.whatsappDeliveryFailed);
        }
      }
      void loadConversations(token, search, filters, setConversations);
    });

    return () => {
      socket.off("connect", onSocketReady);
      socket.off("message:new");
      socket.off("message:updated");
      socket.off("task:new");
      socket.off("staff:message");
      socket.off("call:update");
      socket.disconnect();
    };
  }, [token, search, filters, selectedConversation, currentSection, sessionUser?.id]);

  useEffect(() => {
    if (!token) {
      return;
    }
    const unlock = (): void => unlockNotificationSound();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [token]);

  useEffect(() => {
    if (!token || currentSection !== "dialogs") {
      return;
    }

    const refreshInbox = (): void => {
      void loadConversations(token, search, filters, setConversations);
    };

    const intervalId = window.setInterval(refreshInbox, 5000);
    return () => window.clearInterval(intervalId);
  }, [token, search, filters, currentSection]);

  useEffect(() => {
    if (!token || !selectedConversation || currentSection !== "dialogs") {
      return;
    }

    const refreshThread = (): void => {
      void loadMessages(token, selectedConversation, setMessages);
    };

    refreshThread();
    const intervalId = window.setInterval(refreshThread, 5000);
    return () => window.clearInterval(intervalId);
  }, [token, selectedConversation, currentSection]);

  useEffect(() => {
    if (!token || currentSection !== "dialogs") {
      return;
    }

    const refreshVisible = (): void => {
      if (document.visibilityState !== "visible") {
        return;
      }
      void loadConversations(token, search, filters, setConversations);
      if (selectedConversation) {
        void loadMessages(token, selectedConversation, setMessages);
      }
    };

    document.addEventListener("visibilitychange", refreshVisible);
    window.addEventListener("focus", refreshVisible);
    return () => {
      document.removeEventListener("visibilitychange", refreshVisible);
      window.removeEventListener("focus", refreshVisible);
    };
  }, [token, search, filters, selectedConversation, currentSection]);

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
      setStaffUnreadCount(0);
      return;
    }
    void (async () => {
      const count = await loadStaffUnreadCount(token);
      setStaffUnreadCount(count);
    })();
  }, [token]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 768px)");
    const onChange = (): void => {
      const mobile = media.matches;
      setIsMobileLayout(mobile);
      if (!mobile) {
        setMobileThreadOpen(false);
      }
    };
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

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
    const media = window.matchMedia("(min-width: 1101px)");
    const onChange = (): void => setCanCollapseLeftMenu(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    localStorage.setItem(LEFT_MENU_COLLAPSED_KEY, leftMenuCollapsed ? "1" : "0");
  }, [leftMenuCollapsed]);

  useEffect(() => {
    const savedToken = localStorage.getItem(SESSION_TOKEN_KEY);
    if (!savedToken) {
      setSessionRestoring(false);
      return;
    }

    void (async () => {
      const validation = await validateStoredSession(savedToken);
      if (validation.status === "invalid") {
        clearStoredSession();
        setToken("");
        setSessionUser(null);
        setSessionRestoring(false);
        return;
      }

      setToken(savedToken);

      if (validation.status === "valid") {
        setSessionUser(validation.user);
        persistSession(savedToken, validation.user);
        if (isSuperAdminUser(validation.user)) {
          setCurrentSection("platform");
          setSessionRestoring(false);
          return;
        }
      }

      try {
        await hydrateWorkspace(savedToken);
      } catch {
        if (validation.status === "unreachable") {
          showToast("Не удалось загрузить данные. Проверьте интернет.", "error");
        }
      } finally {
        setSessionRestoring(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!conversations.length) {
      return;
    }

    const existingConversation = conversations.find((conversation) => conversation.id === selectedConversation);
    if (existingConversation) {
      setSelectedConversationData(existingConversation);
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

  const knowledgeCategories = Array.from(
    new Set(knowledgeArticles.map((article) => (article.category || "").trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, "ru"));

  const filteredKnowledgeArticles = knowledgeArticles.filter((article) => {
    if (Boolean(article.is_archived) !== knowledgeShowArchive) {
      return false;
    }
    if (knowledgeCategoryFilter && (article.category || "") !== knowledgeCategoryFilter) {
      return false;
    }
    const needle = knowledgeSearch.trim().toLowerCase();
    if (!needle) {
      return true;
    }
    return [article.title, article.category, article.summary, article.body, article.url, article.share_url]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle));
  });

  const chatKnowledgeArticles = knowledgeArticles.filter((article) => {
    if (article.is_archived || article.status === "draft" || article.is_expired) {
      return false;
    }
    if (article.is_shareable === false) {
      return false;
    }
    const needle = knowledgeSearch.trim().toLowerCase();
    if (!needle) {
      return true;
    }
    return [article.title, article.category, article.summary, article.body]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle));
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
    const requiredResponse = await fetch(`${API}/deals/contact-required-fields`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (requiredResponse.ok) {
      const requiredData = (await requiredResponse.json()) as { fields?: string[] };
      setContactRequiredFields(
        (requiredData.fields || []).filter((key): key is ContactRequiredFieldKey =>
          CONTACT_REQUIRED_FIELD_OPTIONS.includes(key as ContactRequiredFieldKey)
        )
      );
    }
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

    const maxAttempts = 4;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        if (attempt > 1) {
          setLoginError(`Сервер просыпается… попытка ${attempt}/${maxAttempts}`);
        }
        const response = await fetch(`${API}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ login: loginValue, password: passwordValue })
        });

        const raw = await response.text();
        let data: { token?: string; user?: SessionUser; error?: string } = {};
        try {
          data = raw ? (JSON.parse(raw) as { token?: string; user?: SessionUser; error?: string }) : {};
        } catch {
          if (attempt < maxAttempts && (response.status === 502 || response.status === 503 || response.status === 504)) {
            await new Promise((resolve) => window.setTimeout(resolve, 2500 * attempt));
            continue;
          }
          setLoginError("Сервер API временно недоступен. Подождите 30–60 сек и нажмите «Войти» ещё раз.");
          return;
        }

        if (!response.ok || !data.token) {
          if (attempt < maxAttempts && (response.status === 502 || response.status === 503 || response.status === 504)) {
            await new Promise((resolve) => window.setTimeout(resolve, 2500 * attempt));
            continue;
          }
          setLoginError(data.error || UI.loginFailed);
          return;
        }

        setSessionUser(data.user ?? null);
        setToken(data.token);
        persistSession(data.token, data.user ?? null);
        setLoginError("");
        if (isSuperAdminUser(data.user ?? null)) {
          setCurrentSection("platform");
          return;
        }
        await hydrateWorkspace(data.token);
        return;
      } catch {
        if (attempt < maxAttempts) {
          await new Promise((resolve) => window.setTimeout(resolve, 2500 * attempt));
          continue;
        }
        setLoginError("Сервер API временно недоступен. Подождите 30–60 сек и нажмите «Войти» ещё раз.");
      }
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
    const nextFilters: InboxFilters = {
      ...DEFAULT_INBOX_FILTERS,
      ...preset.filters,
      source: preset.filters.source || ""
    };
    setFilters(nextFilters);
    await loadConversations(token, search, nextFilters, setConversations);
  }

  function removeFilterPreset(presetId: string): void {
    setSavedFilterPresets((prev) => prev.filter((preset) => preset.id !== presetId));
  }

  function logout(): void {
    clearStoredSession();
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
    if (isMobileLayout) {
      setMobileThreadOpen(true);
    }
    await loadMessages(token, id, setMessages);
    await loadContactCard(token, id, setContactCard);
  }

  async function onOpenCustomerCardFromList(id: string): Promise<void> {
    await onSelectConversation(id);
    setCustomerCardOpen(true);
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

  async function takeConversationIntoWork(conversationId: string): Promise<void> {
    if (!token || !sessionUser?.id) {
      showToast("Не удалось определить оператора", "error");
      return;
    }
    try {
      await apiAssignConversationManager(token, conversationId, sessionUser.id);
      if (selectedConversationData?.status === "closed") {
        await apiSetConversationStatus(token, conversationId, "open");
      }
      await refreshConversationList({ token, search, filters, setConversations });
      showToast("Диалог взят в работу", "success");
      setCustomerCardOpen(false);
    } catch {
      showToast("Не удалось взять диалог в работу", "error");
    }
  }

  async function closeConversationFromCard(conversationId: string): Promise<void> {
    if (!token) {
      return;
    }
    try {
      await apiSetConversationStatus(token, conversationId, "closed");
      await refreshConversationList({ token, search, filters, setConversations });
      showToast("Диалог закрыт", "success");
      setCustomerCardOpen(false);
    } catch {
      showToast("Не удалось закрыть диалог", "error");
    }
  }

  async function reopenConversationFromCard(conversationId: string): Promise<void> {
    if (!token) {
      return;
    }
    try {
      await apiSetConversationStatus(token, conversationId, "open");
      await refreshConversationList({ token, search, filters, setConversations });
      showToast("Диалог переоткрыт", "success");
    } catch {
      showToast("Не удалось переоткрыть диалог", "error");
    }
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
    if (currentSection === "tasks") {
      await refreshCrmTasks();
    }
  }

  async function shareSelectedConversationToTeam(): Promise<void> {
    if (!token || !selectedConversation) {
      return;
    }
    const result = await shareConversationToStaff(token, {
      conversationId: selectedConversation,
      createTask: true
    });
    if (!result) {
      showToast("Не удалось передать в Команду", "error");
      return;
    }
    showToast(UI.shareToTeamDone, "success");
    if (currentSection === "tasks") {
      await refreshCrmTasks();
    }
  }

  async function refreshCrmTasks(): Promise<void> {
    if (!token) {
      return;
    }
    setCrmTasks(await loadCrmTasks(token, taskStatusFilter));
  }

  async function refreshFollowUpSettings(): Promise<void> {
    if (!token) {
      return;
    }
    const settings = await loadFollowUpSettings(token);
    if (settings) {
      setFollowUpSettings(settings);
    }
  }

  async function saveFollowUpSettings(): Promise<void> {
    if (!token) {
      return;
    }
    const saved = await saveFollowUpSettingsApi(token, followUpSettings);
    if (!saved) {
      showToast("Не удалось сохранить follow-up", "error");
      return;
    }
    setFollowUpSettings(saved);
    showToast("Настройки follow-up сохранены", "success");
  }

  async function refreshCrmContacts(q = contactsSearch): Promise<void> {
    if (!token) {
      return;
    }
    setCrmContacts(await loadCrmContacts(token, q));
  }

  async function openContactDetails(contactId: string): Promise<void> {
    if (!token) {
      return;
    }
    setSelectedContactId(contactId);
    setContactDetails(await loadCrmContactDetails(token, contactId));
    setCurrentSection("contacts");
  }

  async function submitNewCrmTask(): Promise<void> {
    if (!token || !newTaskTitle.trim()) {
      return;
    }
    const dueAt = newTaskDueLocal.trim() ? new Date(newTaskDueLocal).toISOString() : null;
    const created = await createCrmTask(token, { title: newTaskTitle.trim(), dueAt });
    if (!created) {
      showToast("Не удалось создать задачу", "error");
      return;
    }
    setNewTaskTitle("");
    setNewTaskDueLocal("");
    await refreshCrmTasks();
    showToast("Задача создана", "success");
  }

  async function toggleCrmTaskDone(task: CrmTask): Promise<void> {
    if (!token) {
      return;
    }
    const nextStatus = task.status === "open" ? "done" : "open";
    await updateCrmTask(token, task.id, { status: nextStatus });
    await refreshCrmTasks();
  }

  async function runGlobalSearch(value: string): Promise<void> {
    setGlobalSearchQuery(value);
    if (!token || value.trim().length < 2) {
      setGlobalSearchResults(null);
      setGlobalSearchOpen(false);
      return;
    }
    const results = await globalSearch(token, value.trim());
    setGlobalSearchResults(results);
    setGlobalSearchOpen(true);
  }

  function beginEditDeal(deal: Deal): void {
    setSelectedDealId(deal.id);
    setDealAmountDraft(String(deal.amount || "0"));
    setDealStageDraft(deal.stage || "");
    setDealNextStepDraft(deal.next_step_at ? toDatetimeLocalValue(deal.next_step_at) : "");
  }

  async function saveSelectedDeal(): Promise<void> {
    if (!token || !selectedDealId) {
      return;
    }
    const amount = Number(dealAmountDraft);
    const ok = await updateDealDetails(token, selectedDealId, {
      stage: dealStageDraft,
      amount: Number.isNaN(amount) ? 0 : amount,
      next_step_at: dealNextStepDraft.trim() ? new Date(dealNextStepDraft).toISOString() : null
    });
    if (!ok) {
      showToast("Не удалось сохранить сделку", "error");
      return;
    }
    await loadDeals(token, setDeals);
    showToast("Сделка сохранена", "success");
  }

  async function mergeSelectedContact(): Promise<void> {
    if (!token || !selectedContactId || !mergeSourceContactId) {
      return;
    }
    const ok = await mergeCrmContacts(token, selectedContactId, mergeSourceContactId);
    if (!ok) {
      showToast("Не удалось склеить клиентов", "error");
      return;
    }
    setMergeSourceContactId("");
    await refreshCrmContacts();
    await openContactDetails(selectedContactId);
    showToast("Клиенты склеены", "success");
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
    if (
      !messageBody.trim() ||
      !selectedConversation ||
      !token ||
      uploadingMedia ||
      recordingAudio ||
      sendingMessageRef.current
    ) {
      return;
    }

    sendingMessageRef.current = true;
    setIsSendingMessage(true);
    setMediaUploadError("");
    const bodyToSend = messageBody.trim();
    try {
      const response = await fetch(`${API}/conversations/${selectedConversation}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ body: bodyToSend })
      });
      if (!response.ok) {
        setMediaUploadError(UI.messageSendFailed);
        return;
      }

      const created = (await response.json()) as CreatedMessageResponse;
      setMessageBody("");
      setEmojiPickerOpen(false);
      appendOutgoingMessage(setMessages, created);
      refreshConversationListBackground({ token, search, filters, setConversations });
    } catch {
      setMediaUploadError(UI.messageSendFailed);
    } finally {
      sendingMessageRef.current = false;
      setIsSendingMessage(false);
    }
  }

  async function sendMediaFile(file: File): Promise<void> {
    if (!selectedConversation || !token || sendingMessageRef.current) {
      return;
    }
    setMediaUploadError("");
    const normalizedFile = isAudioFile(file) ? normalizeVoiceFile(file) : file;
    const isAudio = isAudioFile(normalizedFile);
    const isImage = normalizedFile.type.startsWith("image/");
    const isVideo = normalizedFile.type.startsWith("video/");
    if (!isAudio && !isImage && !isVideo) {
      setMediaUploadError(UI.unsupportedMediaFormat);
      return;
    }
    if (normalizedFile.size > 20 * 1024 * 1024) {
      setMediaUploadError(UI.mediaFileTooLarge);
      return;
    }
    if (isAudio && (normalizedFile.type.includes("webm") || normalizedFile.name.toLowerCase().endsWith(".webm"))) {
      setMediaUploadError(UI.whatsappAudioFormatUnsupported);
      return;
    }

    if (isNativeApp() && (isImage || isVideo)) {
      const cameraPermission = await ensureCameraPermission();
      if (cameraPermission === "denied") {
        setMediaUploadError(UI.cameraPermissionDenied);
        return;
      }
    }

    sendingMessageRef.current = true;
    setIsSendingMessage(true);
    setUploadingMedia(true);

    const payload = new FormData();
    payload.append("body", messageBody.trim());
    if (isNativeApp()) {
      const arrayBuffer = await normalizedFile.arrayBuffer();
      payload.append(
        "file",
        new Blob([arrayBuffer], { type: normalizedFile.type || "application/octet-stream" }),
        normalizedFile.name
      );
    } else {
      payload.append("file", normalizedFile, normalizedFile.name);
    }

    try {
      const response = await fetch(`${API}/conversations/${selectedConversation}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: payload
      });
      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as { error?: string } | null;
        if (errorPayload?.error === "file_too_large") {
          setMediaUploadError(UI.mediaFileTooLarge);
        } else if (errorPayload?.error === "invalid_file") {
          setMediaUploadError(UI.unsupportedMediaFormat);
        } else {
          setMediaUploadError(UI.mediaUploadFailed);
        }
        return;
      }

      const result = (await response.json()) as CreatedMessageResponse;
      setMessageBody("");
      setEmojiPickerOpen(false);
      appendOutgoingMessage(setMessages, result);
      refreshConversationListBackground({ token, search, filters, setConversations });
      if (result.whatsappDeliveryFailed) {
        if (result.deliveryError === "unsupported_audio_format") {
          setMediaUploadError(UI.whatsappAudioFormatUnsupported);
        } else if (result.deliveryError === "whatsapp_not_configured") {
          setMediaUploadError(UI.whatsappNotConfigured);
        } else {
          setMediaUploadError(UI.whatsappDeliveryFailed);
        }
      }
    } catch {
      setMediaUploadError(UI.mediaUploadFailed);
    } finally {
      setUploadingMedia(false);
      sendingMessageRef.current = false;
      setIsSendingMessage(false);
    }
  }

  function stopRecordingStream(): void {
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
    mediaRecorderRef.current = null;
    nativeRecordingRef.current = false;
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setRecordingAudio(false);
    setRecordingSeconds(0);
    audioChunksRef.current = [];
    recordingStartedAtRef.current = null;
    pendingStopAndSendRef.current = false;
  }

  async function startAudioRecording(): Promise<void> {
    if (!selectedConversation || uploadingMedia || recordingAudio || recordingStartingRef.current) {
      return;
    }

    recordingStartingRef.current = true;
    setMediaUploadError("");
    if (!canRecordVoiceForWhatsApp()) {
      setMediaUploadError(UI.whatsappAudioFormatUnsupported);
      recordingStartingRef.current = false;
      return;
    }
    try {
      const permission = await ensureMicrophonePermission();
      if (permission === "denied") {
        setMediaUploadError(UI.microphonePermissionDenied);
        return;
      }
      if (permission === "unavailable" && !isNativeApp()) {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
          setMediaUploadError(UI.microphoneUnavailable);
          return;
        }
      }

      if (isNativeApp()) {
        try {
          await startNativeVoiceRecording();
          nativeRecordingRef.current = true;
          recordingStartedAtRef.current = Date.now();
          setRecordingAudio(true);
          setRecordingSeconds(0);
          recordingTimerRef.current = window.setInterval(() => {
            setRecordingSeconds((prev) => prev + 1);
          }, 1000);
          if (pendingStopAndSendRef.current) {
            pendingStopAndSendRef.current = false;
            void stopAndSendAudioRecording();
          }
        } catch {
          stopRecordingStream();
          setMediaUploadError(UI.microphoneUnavailable);
        }
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        setMediaUploadError(UI.microphoneUnavailable);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = pickVoiceRecorderMimeType();
        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        audioChunksRef.current = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };
        recorder.start();
        mediaRecorderRef.current = recorder;
        recordingStreamRef.current = stream;
        recordingStartedAtRef.current = Date.now();
        setRecordingAudio(true);
        setRecordingSeconds(0);
        recordingTimerRef.current = window.setInterval(() => {
          setRecordingSeconds((prev) => prev + 1);
        }, 1000);
      } catch {
        stopRecordingStream();
        setMediaUploadError(UI.microphoneUnavailable);
      }
    } finally {
      recordingStartingRef.current = false;
    }
  }

  function cancelAudioRecording(): void {
    if (nativeRecordingRef.current) {
      void (async () => {
        try {
          await stopNativeVoiceRecording();
        } catch {
          // ignore discarded native recording
        } finally {
          stopRecordingStream();
        }
      })();
      return;
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = () => stopRecordingStream();
      recorder.stop();
      return;
    }
    stopRecordingStream();
  }

  async function stopAndSendAudioRecording(): Promise<void> {
    if (stopAndSendInProgressRef.current) {
      return;
    }
    stopAndSendInProgressRef.current = true;
    try {
      const ready = await waitUntilRecordingActive(
        nativeRecordingRef,
        mediaRecorderRef,
        recordingStartingRef,
        RECORDING_READY_TIMEOUT_MS
      );
      if (!ready) {
        if (recordingStartingRef.current) {
          pendingStopAndSendRef.current = true;
          return;
        }
        setMediaUploadError(UI.recordingStartFailed);
        stopRecordingStream();
        return;
      }

      await waitMinimumRecordingDuration(recordingStartedAtRef.current, MIN_VOICE_RECORDING_MS);

      if (nativeRecordingRef.current) {
        try {
          const file = await stopNativeVoiceRecording();
          stopRecordingStream();
          if (file.size < 1) {
            setMediaUploadError(UI.mediaUploadFailed);
            return;
          }
          await sendMediaFile(file);
        } catch {
          stopRecordingStream();
          setMediaUploadError(UI.mediaUploadFailed);
        }
        return;
      }

      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        setMediaUploadError(UI.mediaUploadFailed);
        stopRecordingStream();
        return;
      }

      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        recorder.stop();
      });

      const mimeType = recorder.mimeType || "audio/webm";
      const blob = new Blob(audioChunksRef.current, { type: mimeType });
      const extension = extensionForRecordedAudio(mimeType);
      const file = normalizeVoiceFile(new File([blob], `voice-${Date.now()}.${extension}`, { type: mimeType }));
      stopRecordingStream();

      if (file.size < 1) {
        setMediaUploadError(UI.mediaUploadFailed);
        return;
      }

      await sendMediaFile(file);
    } finally {
      stopAndSendInProgressRef.current = false;
    }
  }

  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
      if (nativeRecordingRef.current) {
        void stopNativeVoiceRecording().catch(() => undefined);
      }
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (recordingTimerRef.current) {
        window.clearInterval(recordingTimerRef.current);
      }
    };
  }, [selectedConversation]);

  function getMediaUrl(attachmentUrl: string): string {
    if (attachmentUrl.startsWith("http://") || attachmentUrl.startsWith("https://")) {
      return attachmentUrl;
    }
    return `${SOCKET_BASE_URL}${attachmentUrl}`;
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

  function toDatetimeLocalValue(iso?: string | null): string {
    if (!iso) {
      return "";
    }
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function fromDatetimeLocalValue(local: string): string | null {
    const trimmed = local.trim();
    if (!trimmed) {
      return null;
    }
    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date.toISOString();
  }

  const knowledgeTemplates = [
    {
      label: "Как оплатить",
      title: "Как оплатить",
      category: "Оплата",
      summary: "Способы оплаты и что делать после перевода",
      body: "## Способы оплаты\n- Карта\n- Kaspi\n- Перевод на расчётный счёт\n\n## После оплаты\n1. Пришлите чек в этот чат\n2. Мы подтвердим оплату и продолжим заказ"
    },
    {
      label: "Доставка",
      title: "Доставка и сроки",
      category: "Доставка",
      summary: "Города, сроки и стоимость доставки",
      body: "## Куда доставляем\n- ...\n\n## Сроки\n- ...\n\n## Стоимость\n- ..."
    },
    {
      label: "Возврат",
      title: "Возврат и обмен",
      category: "Сервис",
      summary: "Условия возврата товара",
      body: "## Когда можно вернуть\n- ...\n\n## Как оформить\n1. Напишите нам\n2. Пришлите фото/чек\n3. Согласуем способ возврата"
    }
  ] as const;

  function resetKnowledgeForm(): void {
    setArticleTitle("");
    setArticleUrl("");
    setArticleCategory("");
    setArticleSummary("");
    setArticleBody("");
    setArticleStatus("published");
    setArticleExpiresLocal("");
    setArticlePinned(false);
    setArticleArchived(false);
    setEditingArticleId("");
  }

  function beginEditKnowledgeArticle(article: KnowledgeArticle): void {
    setEditingArticleId(article.id);
    setArticleTitle(article.title);
    setArticleUrl(article.url || "");
    setArticleCategory(article.category || "");
    setArticleSummary(article.summary || "");
    setArticleBody(article.body || "");
    setArticleStatus(article.status === "draft" ? "draft" : "published");
    setArticleExpiresLocal(toDatetimeLocalValue(article.expires_at));
    setArticlePinned(Boolean(article.is_pinned));
    setArticleArchived(Boolean(article.is_archived));
    setCurrentSection("knowledge");
  }

  function applyKnowledgeTemplate(template: (typeof knowledgeTemplates)[number]): void {
    setArticleTitle(template.title);
    setArticleCategory(template.category);
    setArticleSummary(template.summary);
    setArticleBody(template.body);
    setArticleStatus("draft");
  }

  function knowledgeShareLink(article: KnowledgeArticle): string {
    return (article.share_url || article.url || "").trim();
  }

  function formatKnowledgeShareMessage(article: KnowledgeArticle): string {
    const link = knowledgeShareLink(article);
    const title = article.title.trim();
    if (!link) {
      return title;
    }
    return `Инструкция: «${title}»\n\nОткройте по ссылке:\n${link}`;
  }

  function formatKnowledgeArticleText(article: KnowledgeArticle): string {
    const parts = [article.title.trim()];
    const body = (article.body || article.summary || "").trim();
    if (body) {
      parts.push("", body);
    }
    return parts.join("\n");
  }

  async function ensureKnowledgeSettingsLoaded(): Promise<void> {
    if (!token) {
      return;
    }
    const settings = await loadKnowledgeSettings(token);
    setKnowledgeBrandName(settings.brand_name || "");
    setKnowledgeContactUrl(settings.contact_url || "");
  }

  async function createKnowledgeArticle(): Promise<void> {
    if (!articleTitle.trim() || (!articleBody.trim() && !articleUrl.trim() && !articleSummary.trim())) {
      return;
    }

    const payload = {
      title: articleTitle,
      url: articleUrl,
      category: articleCategory,
      summary: articleSummary,
      body: articleBody,
      status: articleStatus,
      expires_at: fromDatetimeLocalValue(articleExpiresLocal),
      is_pinned: articlePinned,
      is_archived: articleArchived
    };

    const saved = editingArticleId
      ? await updateKnowledgeArticleApi(token, editingArticleId, payload)
      : await createKnowledgeArticleApi(token, payload);

    if (!saved) {
      return;
    }

    await refreshKnowledge({ token, setKnowledgeArticles });
    resetKnowledgeForm();
  }

  async function saveKnowledgeBrandSettings(): Promise<void> {
    if (!token) {
      return;
    }
    const saved = await saveKnowledgeSettingsApi(token, {
      brand_name: knowledgeBrandName,
      contact_url: knowledgeContactUrl
    } satisfies KnowledgeSettings);
    if (saved) {
      showToast("Настройки страницы сохранены", "success");
    }
  }

  async function deleteKnowledgeArticle(articleId: string): Promise<void> {
    await deleteKnowledgeArticleApi(token, articleId);
    if (editingArticleId === articleId) {
      resetKnowledgeForm();
    }
    await refreshKnowledge({ token, setKnowledgeArticles });
  }

  async function copyKnowledgeArticleLink(article: KnowledgeArticle): Promise<void> {
    if (!article.is_shareable) {
      showToast(UI.articleNotShareable, "error");
      return;
    }
    const link = knowledgeShareLink(article);
    if (!link) {
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      showToast("Ссылка скопирована", "success");
    } catch {
      setMessageBody(`${article.title}\n${link}`);
    }
  }

  async function sendKnowledgeArticleLink(article: KnowledgeArticle): Promise<void> {
    if (!article.is_shareable) {
      showToast(UI.articleNotShareable, "error");
      return;
    }
    const link = knowledgeShareLink(article);
    if (!link) {
      showToast("У статьи нет публичной ссылки", "error");
      return;
    }

    const body = formatKnowledgeShareMessage(article);
    if (!selectedConversation) {
      setMessageBody(body);
      setKnowledgeQuickOpen(false);
      setCurrentSection("dialogs");
      return;
    }

    await sendConversationTextMessage(token, selectedConversation, body);

    setScriptLibraryOpen(false);
    setKnowledgeQuickOpen(false);
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

  async function updateDealStage(dealId: string, stage: string): Promise<boolean> {
    const response = await fetch(`${API}/deals/${dealId}/stage`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ stage })
    });
    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { error?: string };
      showToast(
        errorData.error === "contact_fields_required" ? UI.stageChangeBlockedFields : UI.stageActionFailed,
        "error"
      );
      return false;
    }

    await loadDeals(token, setDeals);
    await loadConversations(token, search, filters, setConversations);
    return true;
  }

  async function upsertDealStageByConversation(conversationId: string, stage: string): Promise<boolean> {
    const response = await fetch(`${API}/deals/conversation/${conversationId}/stage`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ stage })
    });
    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { error?: string };
      showToast(
        errorData.error === "contact_fields_required" ? UI.stageChangeBlockedFields : UI.stageActionFailed,
        "error"
      );
      return false;
    }

    await loadDeals(token, setDeals);
    await loadConversations(token, search, filters, setConversations);
    return true;
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

  async function updateStageOutcome(stageId: string, outcome: StageOutcome): Promise<void> {
    if (!token) {
      return;
    }
    setDealStageError("");
    const response = await fetch(`${API}/deals/stages/${stageId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ outcome })
    });
    if (!response.ok) {
      setDealStageError(UI.stageActionFailed);
      return;
    }
    const data = (await response.json()) as PipelineStage[];
    if (Array.isArray(data)) {
      setDealStages(data);
    } else {
      await loadDealStages(token, setDealStages);
    }
  }

  async function loadContactRequiredFields(): Promise<void> {
    if (!token) {
      return;
    }
    const response = await fetch(`${API}/deals/contact-required-fields`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      return;
    }
    const data = (await response.json()) as { fields?: string[] };
    const next = (data.fields || []).filter((key): key is ContactRequiredFieldKey =>
      CONTACT_REQUIRED_FIELD_OPTIONS.includes(key as ContactRequiredFieldKey)
    );
    setContactRequiredFields(next);
  }

  async function saveContactRequiredFields(next: ContactRequiredFieldKey[]): Promise<void> {
    if (!token) {
      return;
    }
    setContactRequiredFields(next);
    const response = await fetch(`${API}/deals/contact-required-fields`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ fields: next })
    });
    if (!response.ok) {
      showToast(UI.stageActionFailed, "error");
      await loadContactRequiredFields();
      return;
    }
    const data = (await response.json()) as { fields?: string[] };
    const saved = (data.fields || []).filter((key): key is ContactRequiredFieldKey =>
      CONTACT_REQUIRED_FIELD_OPTIONS.includes(key as ContactRequiredFieldKey)
    );
    setContactRequiredFields(saved);
    showToast(UI.requiredFieldsSaved, "success");
  }

  async function applyRealEstateKzPreset(): Promise<void> {
    if (!token || applyingRePreset) {
      return;
    }
    if (!window.confirm(`${UI.applyRePresetTitle}\n\n${UI.applyRePresetHint}`)) {
      return;
    }
    setApplyingRePreset(true);
    setDealStageError("");
    try {
      const response = await fetch(`${API}/presets/real-estate-kz/apply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ createLanding: true })
      });
      if (!response.ok) {
        setDealStageError(UI.applyRePresetFailed);
        showToast(UI.applyRePresetFailed, "error");
        return;
      }
      await Promise.all([
        loadDealStages(token, setDealStages),
        loadContactRequiredFields(),
        loadScripts(token, setScripts)
      ]);
      showToast(UI.applyRePresetDone, "success");
    } finally {
      setApplyingRePreset(false);
    }
  }

  function isContactFieldRequired(key: ContactRequiredFieldKey | "name" | "phone"): boolean {
    if (key === "name" || key === "phone") {
      return true;
    }
    return contactRequiredFields.includes(key);
  }

  function fieldLabel(key: ContactRequiredFieldKey | "name" | "phone"): string {
    const labels: Record<ContactRequiredFieldKey | "name" | "phone", string> = {
      name: UI.name,
      phone: UI.phone,
      city: UI.city,
      inquiry_reason: UI.inquiryReason,
      client_type: UI.clientType,
      category: UI.category
    };
    return isContactFieldRequired(key) ? `${labels[key]} *` : labels[key];
  }

  async function saveContactCard(): Promise<void> {
    if (!selectedConversation || !contactCard) {
      return;
    }

    const response = await fetch(`${API}/conversations/${selectedConversation}/contact`, {
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
    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { error?: string };
      showToast(
        errorData.error === "contact_fields_required" ? UI.contactFieldsRequired : "Не удалось сохранить карточку",
        "error"
      );
      return;
    }

    const currentDeal = deals.find((deal) => deal.conversation_id === selectedConversation);
    if (currentDeal && customerDealStage && currentDeal.stage !== customerDealStage) {
      const ok = await updateDealStage(currentDeal.id, customerDealStage);
      if (!ok) {
        return;
      }
    } else if (!currentDeal && customerDealStage) {
      const ok = await upsertDealStageByConversation(selectedConversation, customerDealStage);
      if (!ok) {
        return;
      }
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

  if (sessionRestoring) {
    return (
      <main className="centered">
        <div className="integrationsCard" style={{ maxWidth: 360, textAlign: "center" }}>
          <div className="integrationsTitle">Light CRM</div>
          <p className="integrationsHint">{UI.sessionRestoring}</p>
          <p className="integrationsHint" style={{ marginTop: 8 }}>
            Backend на бесплатном Render иногда засыпает — первый заход после паузы дольше обычного.
          </p>
        </div>
      </main>
    );
  }

  if (!token) {
    const demoTelegramUrl = buildDemoTelegramUrl();
    return (
      <main className="landingPage landingPageModern">
        <section className="landingHero">
          <div className="landingBadge">{UI.landingBadge}</div>
          <h1 className="landingTitle">{UI.landingTitle}</h1>
          <p className="landingSubtitle">{UI.landingSubtitle}</p>

          <div className="landingCtaRow">
            <a
              className="landingButton landingButtonModern landingCtaPrimary"
              href={buildDemoWhatsAppUrl()}
              target="_blank"
              rel="noreferrer"
            >
              {UI.bookDemo}
            </a>
            {demoTelegramUrl ? (
              <a
                className="landingButton landingCtaSecondary"
                href={demoTelegramUrl}
                target="_blank"
                rel="noreferrer"
              >
                {UI.bookDemoTelegram}
              </a>
            ) : (
              <a
                className="landingButton landingCtaSecondary"
                href={buildDemoWhatsAppUrl(
                  "Здравствуйте! Напишите, пожалуйста, в WhatsApp — хочу демо Light CRM."
                )}
                target="_blank"
                rel="noreferrer"
              >
                {UI.bookDemoWhatsApp}
              </a>
            )}
          </div>
          <p className="landingCtaHint">{UI.bookDemoHint}</p>

          <div className="landingHighlights">
            <div className="landingFeatureCard">
              <div className="landingFeatureIcon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M4 6h16v12H4V6z" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M4 7l8 6 8-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </div>
              <div className="landingFeatureText">
                <strong>{UI.unifiedInbox}</strong>
                <span>{UI.unifiedInboxHint}</span>
              </div>
            </div>
            <div className="landingFeatureCard">
              <div className="landingFeatureIcon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M4 6h6l2 3h8v9H4V6z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="landingFeatureText">
                <strong>{UI.smartCohorts}</strong>
                <span>{UI.smartCohortsHint}</span>
              </div>
            </div>
            <div className="landingFeatureCard">
              <div className="landingFeatureIcon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M6 8h12v8H6V8z" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M9 12h6M9 15h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </div>
              <div className="landingFeatureText">
                <strong>{UI.fastReplies}</strong>
                <span>{UI.fastRepliesHint}</span>
              </div>
            </div>
          </div>
        </section>

        <aside className="loginCard loginCardModern">
          <div className="loginCardBrandRow">
            <img className="loginBrandMark" src="/logo-mark.png" alt="" width={48} height={48} />
            <div className="loginBrandText">
              <div className="loginBrandTitle">{UI.brandTitle}</div>
              <div className="loginBrandSubtitle">{UI.demoAccess}</div>
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
                  className="loginInput loginInputModern"
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
                  className="loginInput loginInputModern"
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
              <button className="landingButton landingButtonModern" type="button" onClick={() => void login()}>
                {UI.signIn}
              </button>
            </div>

            <div className="demoCredentials demoCredentialsModern">
              <p>
                <strong>Оператор:</strong> логин operator, пароль demo123
              </p>
              <p>
                <strong>Админ:</strong> логин admin или admin@demo.local, пароль demo123
              </p>
              <p>
                <strong>Супер-админ:</strong> superadmin / superadmin123
              </p>
            </div>
            <IosHomeScreenHint />
          </div>
        </aside>
        <LandingWebChat />
      </main>
    );
  }

  const mobileChatOpen = isMobileLayout && mobileThreadOpen && currentSection === "dialogs";
  const showBottomNav = isMobileLayout && !mobileChatOpen && !isSuperAdminUser(sessionUser);
  const leftMenuCollapsedEffective = leftMenuCollapsed && canCollapseLeftMenu;

  const mobileSectionSubtitle =
    currentSection === "dialogs"
      ? UI.sectionDialogsCenter
      : currentSection === "pipeline"
        ? pipelineSubview === "kpi"
          ? UI.salesOverview
          : UI.pipelineBoardHint
        : currentSection === "tasks"
          ? UI.sectionTasks
          : currentSection === "staff"
            ? UI.sectionStaff
            : currentSection === "contacts"
              ? UI.sectionContacts
              : currentSection === "marketing"
                ? UI.menuMarketing
                : currentSection === "profile"
                  ? UI.sectionProfile
                  : UI.landingBadge;

  const bottomNavActive: MobileNavSection =
    currentSection === "pipeline"
      ? "pipeline"
      : currentSection === "tasks"
        ? "tasks"
        : currentSection === "profile"
          ? "profile"
          : "dialogs";

  function toggleFunnelKpiPanel(): void {
    if (currentSection !== "dialogs") {
      setCurrentSection("dialogs");
      setFunnelKpiPanelOpen(true);
      return;
    }
    setFunnelKpiPanelOpen((open) => !open);
  }

  function openPipelineSection(subview: "kpi" | "board" = "kpi"): void {
    setPipelineSubview(subview);
    setMobileThreadOpen(false);
    setCurrentSection("pipeline");
  }

  function handleBottomNavChange(section: MobileNavSection): void {
    setMobileThreadOpen(false);
    if (section === "pipeline") {
      openPipelineSection("kpi");
      return;
    }
    setCurrentSection(section);
    if (section === "tasks") {
      void refreshCrmTasks();
    }
  }

  const openConversationsWithFollowUp = conversations.filter((conversation) => conversation.has_sla_follow_up);

  return (
    <div
      className={`appShell${mobileChatOpen ? " mobileChatOpen" : ""}${showBottomNav ? " hasBottomNav" : ""}${
        leftMenuCollapsedEffective ? " leftMenuCollapsed" : ""
      }`}
    >
      <header className="topbar">
        <div className="brand">
          <img className="brandMark" src="/logo-mark.png" alt="" width={32} height={32} />
          <div className="brandText">
            <div className="brandTitle">{UI.brandTitle}</div>
            <div className="brandSubtitle">{isMobileLayout ? mobileSectionSubtitle : UI.landingBadge}</div>
          </div>
        </div>

        <div className="topbarSearch">
          <input
            className="topbarSearchInput"
            placeholder={UI.globalSearchPlaceholder}
            aria-label={UI.globalSearchPlaceholder}
            value={globalSearchQuery}
            onChange={(event) => void runGlobalSearch(event.target.value)}
            onFocus={() => {
              if (globalSearchResults) {
                setGlobalSearchOpen(true);
              }
            }}
            onBlur={() => {
              window.setTimeout(() => setGlobalSearchOpen(false), 180);
            }}
          />
          {globalSearchOpen && globalSearchResults ? (
            <div className="topbarSearchDropdown card">
              {globalSearchResults.conversations.length ? (
                <div className="topbarSearchGroup">
                  <div className="sidebarHint">{UI.menuDialogs}</div>
                  {globalSearchResults.conversations.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="textButton"
                      onMouseDown={() => {
                        setCurrentSection("dialogs");
                        setGlobalSearchOpen(false);
                        void onSelectConversation(item.id);
                      }}
                    >
                      {item.contact_name} · {item.channel}
                    </button>
                  ))}
                </div>
              ) : null}
              {globalSearchResults.contacts.length ? (
                <div className="topbarSearchGroup">
                  <div className="sidebarHint">{UI.menuContacts}</div>
                  {globalSearchResults.contacts.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="textButton"
                      onMouseDown={() => {
                        setGlobalSearchOpen(false);
                        void openContactDetails(item.id);
                      }}
                    >
                      {item.name} · {item.phone}
                    </button>
                  ))}
                </div>
              ) : null}
              {globalSearchResults.deals.length ? (
                <div className="topbarSearchGroup">
                  <div className="sidebarHint">{UI.menuPipeline}</div>
                  {globalSearchResults.deals.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="textButton"
                      onMouseDown={() => {
                        setCurrentSection("pipeline");
                        setSelectedDealId(item.id);
                        setDealAmountDraft(String(item.amount || "0"));
                        setDealStageDraft(item.stage || "");
                        setGlobalSearchOpen(false);
                        void onSelectConversation(item.conversation_id);
                      }}
                    >
                      {item.contact_name} · {item.stage} · {item.amount}
                    </button>
                  ))}
                </div>
              ) : null}
              {globalSearchResults.tasks.length ? (
                <div className="topbarSearchGroup">
                  <div className="sidebarHint">{UI.menuTasks}</div>
                  {globalSearchResults.tasks.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="textButton"
                      onMouseDown={() => {
                        setCurrentSection("tasks");
                        setGlobalSearchOpen(false);
                        void refreshCrmTasks();
                      }}
                    >
                      {item.title}
                      {item.contact_name ? ` · ${item.contact_name}` : ""}
                    </button>
                  ))}
                </div>
              ) : null}
              {!globalSearchResults.conversations.length &&
              !globalSearchResults.contacts.length &&
              !globalSearchResults.deals.length &&
              !globalSearchResults.tasks.length ? (
                <div className="emptyScriptState">{UI.noMatchingScripts}</div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="topbarRight">
          <div className="topbarIconGroup" aria-label="notifications and settings">
            <NotificationBellButton
              enabled={notificationSoundOn}
              onToggle={() => {
                const next = !notificationSoundOn;
                setNotificationSoundEnabled(next);
                setNotificationSoundOn(next);
                unlockNotificationSound();
              }}
            />
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
          <div className="leftMenuHeader">
            {leftMenuCollapsedEffective ? (
              <button
                type="button"
                className="leftMenuBurgerBtn"
                onClick={() => setLeftMenuCollapsed(false)}
                title={UI.expandMenu}
                aria-label={UI.expandMenu}
                aria-expanded={false}
              >
                <span className="leftMenuBurgerIcon" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </button>
            ) : (
              <button
                type="button"
                className="leftMenuTitle leftMenuTitleButton"
                onClick={() => setLeftMenuCollapsed(true)}
                title={UI.collapseMenu}
                aria-label={UI.collapseMenu}
                aria-expanded
              >
                {UI.workspaceMenu}
              </button>
            )}
          </div>
          {isSuperAdminUser(sessionUser) ? (
            <button
              type="button"
              className={`leftMenuButton ${currentSection === "platform" ? "active" : ""}`}
              onClick={() => setCurrentSection("platform")}
              title={UI.menuPlatform}
            >
              <span className="leftMenuButtonIcon" aria-hidden="true">
                {"\u25A3"}
              </span>
              <span className="leftMenuButtonLabel">{UI.menuPlatform}</span>
            </button>
          ) : (
            <>
          <button
            type="button"
            className={`leftMenuButton ${currentSection === "dialogs" ? "active" : ""}`}
            onClick={() => setCurrentSection("dialogs")}
            title={UI.menuDialogs}
          >
            <span className="leftMenuButtonIcon" aria-hidden="true">
              {"\u25AD"}
            </span>
            <span className="leftMenuButtonLabel">{UI.menuDialogs}</span>
          </button>
          <button
            type="button"
            className={`leftMenuButton ${currentSection === "dialogs" && funnelKpiPanelOpen ? "active" : ""}`}
            onClick={toggleFunnelKpiPanel}
            aria-pressed={funnelKpiPanelOpen}
            title={UI.menuFunnelKpi}
          >
            <span className="leftMenuButtonIcon" aria-hidden="true">
              {"\u25C8"}
            </span>
            <span className="leftMenuButtonLabel">{UI.menuFunnelKpi}</span>
          </button>
          <button
            type="button"
            className={`leftMenuButton ${currentSection === "pipeline" ? "active" : ""}`}
            onClick={() => openPipelineSection("board")}
            title={UI.menuPipeline}
          >
            <span className="leftMenuButtonIcon" aria-hidden="true">
              {"\u29D2"}
            </span>
            <span className="leftMenuButtonLabel">{UI.menuPipeline}</span>
          </button>
          <button
            type="button"
            className={`leftMenuButton ${currentSection === "tasks" ? "active" : ""}`}
            onClick={() => {
              setCurrentSection("tasks");
              void refreshCrmTasks();
              void refreshFollowUpSettings();
            }}
            title={UI.menuTasks}
          >
            <span className="leftMenuButtonIcon" aria-hidden="true">
              {"\u2611"}
            </span>
            <span className="leftMenuButtonLabel">{UI.menuTasks}</span>
          </button>
          <button
            type="button"
            className={`leftMenuButton ${currentSection === "staff" ? "active" : ""}`}
            onClick={() => {
              setCurrentSection("staff");
              setStaffUnreadCount(0);
            }}
            title={UI.menuStaff}
          >
            <span className="leftMenuButtonIcon" aria-hidden="true">
              {"\u2630"}
            </span>
            <span className="leftMenuButtonLabel">
              {UI.menuStaff}
              {staffUnreadCount > 0 ? ` (${staffUnreadCount})` : ""}
            </span>
          </button>
          <button
            type="button"
            className={`leftMenuButton ${currentSection === "contacts" ? "active" : ""}`}
            onClick={() => {
              setCurrentSection("contacts");
              void refreshCrmContacts();
            }}
            title={UI.menuContacts}
          >
            <span className="leftMenuButtonIcon" aria-hidden="true">
              {"\u25CE"}
            </span>
            <span className="leftMenuButtonLabel">{UI.menuContacts}</span>
          </button>
          <button
            type="button"
            className={`leftMenuButton ${currentSection === "analytics" ? "active" : ""}`}
            onClick={() => setCurrentSection("analytics")}
            title={UI.menuAnalytics}
          >
            <span className="leftMenuButtonIcon" aria-hidden="true">
              {"\u25F4"}
            </span>
            <span className="leftMenuButtonLabel">{UI.menuAnalytics}</span>
          </button>
          <button
            type="button"
            className={`leftMenuButton ${currentSection === "knowledge" ? "active" : ""}`}
            onClick={() => {
              setCurrentSection("knowledge");
              void ensureKnowledgeSettingsLoaded();
            }}
            title={UI.menuKnowledgeBase}
          >
            <span className="leftMenuButtonIcon" aria-hidden="true">
              {"\u25A6"}
            </span>
            <span className="leftMenuButtonLabel">{UI.menuKnowledgeBase}</span>
          </button>
          <button
            type="button"
            className={`leftMenuButton ${currentSection === "marketing" ? "active" : ""}`}
            onClick={() => setCurrentSection("marketing")}
            title={UI.menuMarketing}
          >
            <span className="leftMenuButtonIcon" aria-hidden="true">
              {"\u2709"}
            </span>
            <span className="leftMenuButtonLabel">{UI.menuMarketing}</span>
          </button>
          {sessionUser?.role === "admin" ? (
            <button
              type="button"
              className={`leftMenuButton ${currentSection === "ops" ? "active" : ""}`}
              onClick={() => setCurrentSection("ops")}
              title={UI.menuOps}
            >
              <span className="leftMenuButtonIcon" aria-hidden="true">
                {"\u26A1"}
              </span>
              <span className="leftMenuButtonLabel">{UI.menuOps}</span>
            </button>
          ) : null}
          {sessionUser?.role === "admin" ? (
            <button
              type="button"
              className={`leftMenuButton ${currentSection === "integrations" ? "active" : ""}`}
              onClick={() => setCurrentSection("integrations")}
              title={UI.menuIntegrations}
            >
              <span className="leftMenuButtonIcon" aria-hidden="true">
                {"\u2699"}
              </span>
              <span className="leftMenuButtonLabel">{UI.menuIntegrations}</span>
            </button>
          ) : null}
            </>
          )}
        </aside>

        {currentSection === "platform" ? (
          token ? <PlatformPanel authToken={token} /> : null
        ) : currentSection === "dialogs" ? (
        <div
          className={`appGrid ${isMobileLayout && mobileThreadOpen ? "mobileThreadOpen" : ""}${
            !funnelKpiPanelOpen ? " appGridNoRightRail" : ""
          }`}
        >
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
              customerCard: UI.customerCard
            }}
            conversations={conversations}
            selectedConversation={selectedConversation}
            searchPanelOpen={searchPanelOpen}
            search={search}
            filters={filters}
            savedFilterPresets={savedFilterPresets}
            onToggleSearchPanel={() => setSearchPanelOpen((prev) => !prev)}
            notificationSoundOn={notificationSoundOn}
            onToggleNotificationSound={() => {
              const next = !notificationSoundOn;
              setNotificationSoundEnabled(next);
              setNotificationSoundOn(next);
              unlockNotificationSound();
            }}
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
            onOpenCustomerCard={(id) => void onOpenCustomerCardFromList(id)}
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
              noKnowledgeArticles: UI.noShareableKnowledge,
              sendArticleLink: UI.sendArticleLink,
              insertArticleText: UI.insertArticleText,
              general: UI.general,
              emojis: UI.emojis,
              typeMessage: UI.typeMessage,
              attachFile: UI.attachFile,
              recordAudio: UI.recordAudio,
              voiceRecordingAppOnly: UI.voiceRecordingAppOnly,
              recordingAudio: UI.recordingAudio,
              sendVoice: UI.sendVoice,
              cancelRecording: UI.cancelRecording,
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
            filteredKnowledgeArticles={chatKnowledgeArticles}
            selectedScriptId={selectedScriptId}
            messageBody={messageBody}
            uploadingMedia={uploadingMedia || isSendingMessage}
            recordingAudio={recordingAudio}
            recordingDurationLabel={formatRecordingDuration(recordingSeconds)}
            mediaUploadError={mediaUploadError}
            emojiPickerOpen={emojiPickerOpen}
            emojiOptions={EMOJI_OPTIONS}
            emojiButtonIcon={EMOJI_BUTTON_ICON}
            getMediaUrl={getMediaUrl}
            token={token}
            voiceRecordingAvailable={canRecordVoiceForWhatsApp()}
            voiceRecordMode={isNativeApp() ? "tap" : "hold"}
            recordingSendReady={recordingSeconds >= 1}
            isNativeApp={isNativeApp()}
            onOpenCustomerCard={() => setCustomerCardOpen(true)}
            onShareToTeam={() => void shareSelectedConversationToTeam()}
            shareToTeamLabel={UI.shareToTeamShort}
            onCallPhone={
              selectedConversationData?.phone
                ? () => requestTelephonyDial(selectedConversationData.phone)
                : undefined
            }
            onBack={isMobileLayout && mobileThreadOpen ? () => setMobileThreadOpen(false) : undefined}
            backLabel={UI.backToChats}
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
            onInsertKnowledgeArticleText={(article) => {
              setMessageBody(formatKnowledgeArticleText(article));
              setKnowledgeQuickOpen(false);
            }}
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
            onPrepareAttach={async () => {
              if (!isNativeApp()) {
                return true;
              }
              const cameraPermission = await ensureCameraPermission();
              if (cameraPermission === "denied") {
                setMediaUploadError(UI.cameraPermissionDenied);
                return false;
              }
              setMediaUploadError("");
              return true;
            }}
            onStartAudioRecording={() => void startAudioRecording()}
            onStopAndSendAudioRecording={() => void stopAndSendAudioRecording()}
            onCancelAudioRecording={() => cancelAudioRecording()}
            onSendMessage={() => void sendMessage()}
            onAppendEmoji={(emoji) => {
              setMessageBody((prev) => `${prev}${emoji}`);
              setEmojiPickerOpen(false);
            }}
          />

          {funnelKpiPanelOpen ? (
          <aside className="rightRail card">
            <FunnelKpiPanel
              metrics={metrics}
              deals={deals}
              availableStageNames={availableStageNames}
              labels={{
                pipelineAndKpi: UI.pipelineAndKpi,
                salesOverview: UI.salesOverview,
                min: UI.min,
                firstResponse: UI.firstResponse,
                chats7d: UI.chats7d,
                outgoing7d: UI.outgoing7d,
                deals: UI.deals,
                client: UI.client,
                amount: UI.amount,
                stage: UI.stage
              }}
              formatStageLabel={(stage) => formatStageLabel(stage, UI)}
              onDealStageChange={(dealId, stage) => void updateDealStage(dealId, stage)}
            />
          </aside>
          ) : null}
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
                <div className="pipelineFilterButtons" style={{ marginBottom: 10 }}>
                  <button
                    type="button"
                    className={`leftMenuButton ${!knowledgeShowArchive ? "active" : ""}`}
                    onClick={() => setKnowledgeShowArchive(false)}
                  >
                    {UI.knowledgeActiveTab}
                  </button>
                  <button
                    type="button"
                    className={`leftMenuButton ${knowledgeShowArchive ? "active" : ""}`}
                    onClick={() => setKnowledgeShowArchive(true)}
                  >
                    {UI.knowledgeArchiveTab}
                  </button>
                </div>
                <input
                  className="searchInput"
                  placeholder={UI.searchKnowledgeBase}
                  value={knowledgeSearch}
                  onChange={(event) => setKnowledgeSearch(event.target.value)}
                />
                {knowledgeCategories.length ? (
                  <div className="pipelineFilterButtons" style={{ marginTop: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className={`leftMenuButton ${!knowledgeCategoryFilter ? "active" : ""}`}
                      onClick={() => setKnowledgeCategoryFilter("")}
                    >
                      {UI.knowledgeAllCategories}
                    </button>
                    {knowledgeCategories.map((category) => (
                      <button
                        key={category}
                        type="button"
                        className={`leftMenuButton ${knowledgeCategoryFilter === category ? "active" : ""}`}
                        onClick={() => setKnowledgeCategoryFilter(category)}
                      >
                        {category}
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="knowledgeArticlesList">
                  {filteredKnowledgeArticles.length ? (
                    filteredKnowledgeArticles.map((article) => (
                      <div key={article.id} className="scriptCard">
                        <div className="scriptCardMain">
                          <span className="scriptCardTop">
                            <span className="scriptCardTitle">
                              {article.is_pinned ? "★ " : ""}
                              {article.title}
                            </span>
                            <span className="scriptBadge">{article.category || UI.general}</span>
                          </span>
                          <span className="scriptCardBody">
                            {article.status === "draft" ? UI.articleDraft : UI.articlePublished}
                            {" · "}
                            {article.view_count || 0} {UI.articleViews}
                            {article.is_expired ? ` · ${UI.articleExpired}` : ""}
                          </span>
                          <span className="scriptCardBody">
                            {article.summary || article.body || article.share_url || article.url}
                          </span>
                          {article.share_url ? (
                            <span className="scriptCardBody" style={{ opacity: 0.75, fontSize: 12 }}>
                              {article.share_url}
                            </span>
                          ) : null}
                        </div>
                        <div className="scriptCardActions">
                          <button type="button" className="textButton" onClick={() => beginEditKnowledgeArticle(article)}>
                            {UI.editArticle}
                          </button>
                          {article.share_url ? (
                            <button
                              type="button"
                              className="textButton"
                              onClick={() => window.open(article.share_url || "", "_blank", "noopener,noreferrer")}
                            >
                              {UI.openArticleLink}
                            </button>
                          ) : null}
                          <button type="button" className="textButton" onClick={() => void copyKnowledgeArticleLink(article)}>
                            {UI.copyArticleLink}
                          </button>
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
                <div className="scriptPanelTitle">
                  {editingArticleId ? UI.editArticle : UI.newKnowledgeArticle}
                </div>
                <div className="scriptForm">
                  <div className="pipelineFilterButtons" style={{ marginBottom: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, opacity: 0.75, alignSelf: "center" }}>{UI.knowledgeTemplates}:</span>
                    {knowledgeTemplates.map((template) => (
                      <button
                        key={template.label}
                        type="button"
                        className="leftMenuButton"
                        onClick={() => applyKnowledgeTemplate(template)}
                      >
                        {template.label}
                      </button>
                    ))}
                  </div>
                  <input
                    className="filterInput"
                    placeholder={UI.articleTitle}
                    value={articleTitle}
                    onChange={(event) => setArticleTitle(event.target.value)}
                  />
                  <textarea
                    className="scriptTextarea scriptTextareaLarge"
                    placeholder={UI.articleBody}
                    value={articleBody}
                    onChange={(event) => setArticleBody(event.target.value)}
                  />
                  <input
                    className="filterInput"
                    placeholder={UI.articleSummary}
                    value={articleSummary}
                    onChange={(event) => setArticleSummary(event.target.value)}
                  />
                  <input
                    className="filterInput"
                    placeholder={UI.category}
                    value={articleCategory}
                    onChange={(event) => setArticleCategory(event.target.value)}
                  />
                  <input
                    className="filterInput"
                    placeholder={UI.articleUrl}
                    value={articleUrl}
                    onChange={(event) => setArticleUrl(event.target.value)}
                  />
                  <label className="sidebarHint" style={{ display: "block" }}>
                    {UI.articleStatus}
                    <select
                      className="filterInput"
                      value={articleStatus}
                      onChange={(event) => setArticleStatus(event.target.value === "draft" ? "draft" : "published")}
                      style={{ marginTop: 4 }}
                    >
                      <option value="published">{UI.articlePublished}</option>
                      <option value="draft">{UI.articleDraft}</option>
                    </select>
                  </label>
                  <label className="sidebarHint" style={{ display: "block" }}>
                    {UI.articleExpires}
                    <input
                      className="filterInput"
                      type="datetime-local"
                      value={articleExpiresLocal}
                      onChange={(event) => setArticleExpiresLocal(event.target.value)}
                      style={{ marginTop: 4 }}
                    />
                  </label>
                  <label className="sidebarHint" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={articlePinned}
                      onChange={(event) => setArticlePinned(event.target.checked)}
                    />
                    {UI.articlePinned}
                  </label>
                  <label className="sidebarHint" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={articleArchived}
                      onChange={(event) => setArticleArchived(event.target.checked)}
                    />
                    {UI.articleArchived}
                  </label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" className="primaryButton" onClick={() => void createKnowledgeArticle()}>
                      {UI.saveArticle}
                    </button>
                    {editingArticleId ? (
                      <button type="button" className="pipelineToggleBtn" onClick={resetKnowledgeForm}>
                        {UI.cancel || "Отмена"}
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="scriptPanelTitle" style={{ marginTop: 24 }}>
                  {UI.knowledgeBrandSettings}
                </div>
                <div className="scriptForm">
                  <input
                    className="filterInput"
                    placeholder={UI.knowledgeBrandName}
                    value={knowledgeBrandName}
                    onChange={(event) => setKnowledgeBrandName(event.target.value)}
                  />
                  <input
                    className="filterInput"
                    placeholder={UI.knowledgeContactUrl}
                    value={knowledgeContactUrl}
                    onChange={(event) => setKnowledgeContactUrl(event.target.value)}
                  />
                  <button type="button" className="primaryButton" onClick={() => void saveKnowledgeBrandSettings()}>
                    {UI.saveKnowledgeSettings}
                  </button>
                </div>
              </div>
            </div>
          </section>
        ) : currentSection === "marketing" ? (
          token ? <MarketingPanel authToken={token} onToast={showToast} /> : null
        ) : currentSection === "ops" ? (
          token ? (
            <OpsPanel
              authToken={token}
              onToast={showToast}
              onOpenConversation={(conversationId) => {
                setCurrentSection("dialogs");
                void onSelectConversation(conversationId);
              }}
            />
          ) : null
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
              <div className="analyticsCard analyticsCardChart">
                <OwnerDashboard
                  ownerKpi={metrics?.ownerKpi || metrics?.salesKpi
                    ? {
                        revenueWon: metrics?.ownerKpi?.revenueWon ?? metrics?.salesKpi?.wonAmount ?? 0,
                        pipelineAmount:
                          metrics?.ownerKpi?.pipelineAmount ?? metrics?.salesKpi?.pipelineAmount ?? 0,
                        winRate: metrics?.ownerKpi?.winRate ?? metrics?.salesKpi?.winRate ?? 0,
                        avgFirstResponseMinutes:
                          metrics?.ownerKpi?.avgFirstResponseMinutes ?? metrics?.firstResponseMinutes ?? 0,
                        leads: metrics?.ownerKpi?.leads,
                        wonDeals: metrics?.ownerKpi?.wonDeals ?? metrics?.salesKpi?.wonDeals,
                        conversion: metrics?.ownerKpi?.conversion
                      }
                    : null}
                  managersKpi={metrics?.managersKpi || []}
                  laggingManagers={metrics?.laggingManagers || []}
                  periodLabel={metricsPeriodLabel}
                />
              </div>
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
                  <div className="analyticsChannelItem">
                    <span>Instagram</span>
                    <strong>{metrics?.instagramConversations ?? 0}</strong>
                  </div>
                  <div className="analyticsChannelItem">
                    <span>Email</span>
                    <strong>{metrics?.emailConversations ?? 0}</strong>
                  </div>
                  <div className="analyticsChannelItem">
                    <span>Web</span>
                    <strong>{metrics?.webConversations ?? 0}</strong>
                  </div>
                </div>
              </div>
              <div className="analyticsCard analyticsCardWide">
                <div className="analyticsLabel">{UI.salesConversion}</div>
                <div className="analyticsChannels">
                  <div className="analyticsChannelItem">
                    <span>{UI.winRate}</span>
                    <strong>{metrics?.salesKpi?.winRate ?? 0}%</strong>
                  </div>
                  <div className="analyticsChannelItem">
                    <span>{UI.wonAmount}</span>
                    <strong>{metrics?.salesKpi?.wonAmount ?? 0}</strong>
                  </div>
                  <div className="analyticsChannelItem">
                    <span>{UI.pipelineAmountLabel}</span>
                    <strong>{metrics?.salesKpi?.pipelineAmount ?? 0}</strong>
                  </div>
                  <div className="analyticsChannelItem">
                    <span>Won / Lost</span>
                    <strong>
                      {metrics?.salesKpi?.wonDeals ?? 0} / {metrics?.salesKpi?.lostDeals ?? 0}
                    </strong>
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
                <div className="analyticsLabel">{`\u0413\u0440\u0430\u0444\u0438\u043a\u0438: ${metricsPeriodLabel}`}</div>
                <AnalyticsCharts
                  dailySeries={metrics?.dailySeries || []}
                  weeklySeries={metrics?.weeklySeries || []}
                  managersLoadSeries={metrics?.managersLoadSeries || []}
                  periodLabel={metricsPeriodLabel}
                />
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
        ) : currentSection === "tasks" ? (
          <section className="knowledgePage card">
            <div className="railHeader">
              <div>
                <div className="sidebarTitle">{UI.sectionTasks}</div>
                <div className="sidebarHint">
                  {crmTasks.length} · {taskStatusFilter === "open" ? UI.openTasksTab : UI.doneTasksTab}
                </div>
              </div>
            </div>
            <div className="pipelineFilterButtons" style={{ marginBottom: 12 }}>
              <button
                type="button"
                className={`leftMenuButton ${taskStatusFilter === "open" ? "active" : ""}`}
                onClick={() => {
                  setTaskStatusFilter("open");
                  void (async () => {
                    if (!token) return;
                    setCrmTasks(await loadCrmTasks(token, "open"));
                  })();
                }}
              >
                {UI.openTasksTab}
              </button>
              <button
                type="button"
                className={`leftMenuButton ${taskStatusFilter === "done" ? "active" : ""}`}
                onClick={() => {
                  setTaskStatusFilter("done");
                  void (async () => {
                    if (!token) return;
                    setCrmTasks(await loadCrmTasks(token, "done"));
                  })();
                }}
              >
                {UI.doneTasksTab}
              </button>
            </div>
            <div className="scriptForm" style={{ marginBottom: 16 }}>
              <input
                className="filterInput"
                placeholder={UI.newTaskPlaceholder}
                value={newTaskTitle}
                onChange={(event) => setNewTaskTitle(event.target.value)}
              />
              <input
                className="filterInput"
                type="datetime-local"
                value={newTaskDueLocal}
                onChange={(event) => setNewTaskDueLocal(event.target.value)}
              />
              <button type="button" className="primaryButton" onClick={() => void submitNewCrmTask()}>
                {UI.save}
              </button>
            </div>
            {crmTasks.length ? (
              crmTasks.map((task) => (
                <div key={task.id} className="taskCard">
                  <div className="taskCardTitle">{task.title}</div>
                  <div className="taskCardMeta">
                    {task.contact_name || "—"}
                    {task.due_at ? ` · ${new Date(task.due_at).toLocaleString()}` : ""}
                    {task.deal_stage ? ` · ${task.deal_stage}` : ""}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    <button type="button" className="dialogActionBtn primary" onClick={() => void toggleCrmTaskDone(task)}>
                      {task.status === "open" ? UI.markTaskDone : UI.reopenTask}
                    </button>
                    {task.conversation_id ? (
                      <button
                        type="button"
                        className="dialogActionBtn"
                        onClick={() => {
                          setCurrentSection("dialogs");
                          void onSelectConversation(task.conversation_id as string);
                        }}
                      >
                        {UI.backToChats}
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <div className="emptyScriptState">{UI.noTasks}</div>
            )}
            {openConversationsWithFollowUp.length ? (
              <div style={{ marginTop: 24 }}>
                <div className="scriptPanelTitle">SLA follow-up</div>
                {openConversationsWithFollowUp.map((conversation) => (
                  <div key={conversation.id} className="taskCard">
                    <div className="taskCardTitle">SLA: {conversation.contact_name}</div>
                    <button
                      type="button"
                      className="dialogActionBtn primary"
                      style={{ marginTop: 10 }}
                      onClick={() => {
                        setCurrentSection("dialogs");
                        void onSelectConversation(conversation.id);
                      }}
                    >
                      {UI.backToChats}
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="knowledgeFormCard" style={{ marginTop: 24 }}>
              <div className="scriptPanelTitle">{UI.followUpSettings}</div>
              <div className="sidebarHint" style={{ marginBottom: 12 }}>
                Система сама создаст задачу-напоминание: после смены этапа или если в чате долго тишина.
              </div>
              <div className="scriptForm">
                <label className="sidebarHint" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={followUpSettings.enabled}
                    onChange={(event) =>
                      setFollowUpSettings((prev) => ({ ...prev, enabled: event.target.checked }))
                    }
                  />
                  {UI.followUpEnabled}
                </label>
                <label className="sidebarHint" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={followUpSettings.onStageChange}
                    onChange={(event) =>
                      setFollowUpSettings((prev) => ({ ...prev, onStageChange: event.target.checked }))
                    }
                  />
                  {UI.followUpOnStage}
                </label>
                <label className="sidebarHint" style={{ display: "block" }}>
                  {UI.followUpStageHours}
                  <input
                    className="filterInput"
                    type="number"
                    min={1}
                    max={720}
                    value={followUpSettings.stageDueHours}
                    onChange={(event) =>
                      setFollowUpSettings((prev) => ({
                        ...prev,
                        stageDueHours: Number(event.target.value) || 24
                      }))
                    }
                    style={{ marginTop: 4 }}
                  />
                </label>
                <label className="sidebarHint" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={followUpSettings.onSilence}
                    onChange={(event) =>
                      setFollowUpSettings((prev) => ({ ...prev, onSilence: event.target.checked }))
                    }
                  />
                  {UI.followUpOnSilence}
                </label>
                <label className="sidebarHint" style={{ display: "block" }}>
                  {UI.followUpSilenceHours}
                  <input
                    className="filterInput"
                    type="number"
                    min={1}
                    max={720}
                    value={followUpSettings.silenceHours}
                    onChange={(event) =>
                      setFollowUpSettings((prev) => ({
                        ...prev,
                        silenceHours: Number(event.target.value) || 48
                      }))
                    }
                    style={{ marginTop: 4 }}
                  />
                </label>
                <label className="sidebarHint" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={followUpSettings.skipClosedStages}
                    onChange={(event) =>
                      setFollowUpSettings((prev) => ({
                        ...prev,
                        skipClosedStages: event.target.checked
                      }))
                    }
                  />
                  {UI.followUpSkipClosed}
                </label>
                <button type="button" className="primaryButton" onClick={() => void saveFollowUpSettings()}>
                  {UI.saveFollowUp}
                </button>
              </div>
            </div>
          </section>
        ) : currentSection === "staff" ? (
          token ? (
            <StaffChatPanel
              authToken={token}
              currentUserId={sessionUser?.id || ""}
              onToast={showToast}
              onThreadsChanged={(threads) => {
                const unread = threads.reduce((sum, thread) => sum + (thread.unread_count || 0), 0);
                setStaffUnreadCount(unread);
              }}
              onOpenConversation={(conversationId) => {
                setCurrentSection("dialogs");
                void onSelectConversation(conversationId);
              }}
            />
          ) : null
        ) : currentSection === "contacts" ? (
          <section className="knowledgePage card">
            <div className="railHeader">
              <div>
                <div className="sidebarTitle">{UI.sectionContacts}</div>
                <div className="sidebarHint">{crmContacts.length}</div>
              </div>
            </div>
            <div className="knowledgePageGrid">
              <div className="knowledgeListCard">
                <input
                  className="searchInput"
                  placeholder={UI.searchClients}
                  value={contactsSearch}
                  onChange={(event) => {
                    const value = event.target.value;
                    setContactsSearch(value);
                    void refreshCrmContacts(value);
                  }}
                />
                <div className="knowledgeArticlesList">
                  {crmContacts.map((contact) => (
                    <button
                      key={contact.id}
                      type="button"
                      className={`scriptCardMain ${selectedContactId === contact.id ? "active" : ""}`}
                      onClick={() => void openContactDetails(contact.id)}
                      style={{ width: "100%", textAlign: "left", marginBottom: 8 }}
                    >
                      <span className="scriptCardTop">
                        <span className="scriptCardTitle">{contact.name}</span>
                        <span className="scriptBadge">{contact.channels.join(", ") || "—"}</span>
                      </span>
                      <span className="scriptCardBody">
                        {contact.phone}
                        {contact.city ? ` · ${contact.city}` : ""}
                        {` · ${contact.conversations_count} диал. · ${contact.deals_count} сделок`}
                      </span>
                    </button>
                  ))}
                  {crmContacts.length ? null : <div className="emptyScriptState">{UI.noKnowledgeArticles}</div>}
                </div>
              </div>
              <div className="knowledgeFormCard">
                {contactDetails ? (
                  <>
                    <div className="scriptPanelTitle">{contactDetails.contact.name}</div>
                    <div className="sidebarHint">
                      {contactDetails.contact.phone}
                      {contactDetails.contact.city ? ` · ${contactDetails.contact.city}` : ""}
                    </div>
                    <div className="scriptPanelTitle" style={{ marginTop: 16 }}>
                      {UI.menuDialogs}
                    </div>
                    {contactDetails.conversations.map((conversation) => (
                      <button
                        key={conversation.id}
                        type="button"
                        className="textButton"
                        onClick={() => {
                          setCurrentSection("dialogs");
                          void onSelectConversation(conversation.id);
                        }}
                      >
                        {conversation.channel} · {conversation.status}
                      </button>
                    ))}
                    <div className="scriptPanelTitle" style={{ marginTop: 16 }}>
                      {UI.menuPipeline}
                    </div>
                    {contactDetails.deals.map((deal) => (
                      <div key={deal.id} className="taskCardMeta">
                        {deal.stage} · {deal.amount}
                        {deal.next_step_at ? ` · next ${new Date(deal.next_step_at).toLocaleString()}` : ""}
                      </div>
                    ))}
                    <div className="scriptPanelTitle" style={{ marginTop: 16 }}>
                      {UI.contactTimeline}
                    </div>
                    <div className="knowledgeArticlesList">
                      {contactDetails.timeline.map((item) => (
                        <div key={`${item.kind}-${item.id}`} className="taskCard" style={{ marginBottom: 8 }}>
                          <div className="taskCardTitle">{item.title}</div>
                          <div className="taskCardMeta">
                            {new Date(item.created_at).toLocaleString()}
                            {item.detail ? ` · ${item.detail}` : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="scriptPanelTitle" style={{ marginTop: 16 }}>
                      {UI.mergeContact}
                    </div>
                    <select
                      className="filterInput"
                      value={mergeSourceContactId}
                      onChange={(event) => setMergeSourceContactId(event.target.value)}
                    >
                      <option value="">—</option>
                      {crmContacts
                        .filter((contact) => contact.id !== selectedContactId)
                        .map((contact) => (
                          <option key={contact.id} value={contact.id}>
                            {contact.name} · {contact.phone}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      className="primaryButton"
                      style={{ marginTop: 8 }}
                      disabled={!mergeSourceContactId}
                      onClick={() => void mergeSelectedContact()}
                    >
                      {UI.mergeContact}
                    </button>
                  </>
                ) : (
                  <div className="emptyScriptState">{UI.selectChatHint}</div>
                )}
              </div>
            </div>
          </section>
        ) : currentSection === "profile" ? (
          <section className="simpleMobilePage card">
            <div className="profileCard">
              <div className="profileAvatarLarge" aria-hidden="true">
                {(sessionUser?.fullName || sessionUser?.email || "?").trim().slice(0, 1).toUpperCase()}
              </div>
              <div>
                <div className="mobilePageTitle">{sessionUser?.fullName || "Operator"}</div>
                <div className="mobilePageSubtitle">{sessionUser?.login || sessionUser?.email}</div>
              </div>
              <button type="button" className="profileMenuBtn" onClick={() => setCurrentSection("knowledge")}>
                <span>{UI.menuKnowledgeBase}</span>
                <span>›</span>
              </button>
              <button
                type="button"
                className="profileMenuBtn"
                onClick={() => {
                  setCurrentSection("staff");
                  setStaffUnreadCount(0);
                }}
              >
                <span>
                  {UI.menuStaff}
                  {staffUnreadCount > 0 ? ` (${staffUnreadCount})` : ""}
                </span>
                <span>›</span>
              </button>
              <button type="button" className="profileMenuBtn" onClick={() => setCurrentSection("analytics")}>
                <span>{UI.menuAnalytics}</span>
                <span>›</span>
              </button>
              {sessionUser?.role === "admin" ? (
                <button type="button" className="profileMenuBtn" onClick={() => setCurrentSection("integrations")}>
                  <span>{UI.menuIntegrations}</span>
                  <span>›</span>
                </button>
              ) : null}
              <button type="button" className="clientCardSaveBtn" onClick={logout}>
                {UI.signOut}
              </button>
            </div>
          </section>
        ) : currentSection === "pipeline" ? (
          <section className="pipelinePage card">
            <div className="mobilePageHeader">
              <div className="mobilePageHeaderText">
                <div className="mobilePageTitle">
                  {pipelineSubview === "kpi" ? UI.pipelineAndKpi : UI.sectionFunnel}
                </div>
                <div className="mobilePageSubtitle">
                  {pipelineSubview === "kpi" ? UI.salesOverview : UI.pipelineBoardHint}
                </div>
              </div>
            </div>
            <div className="pipelineSectionToggle">
              <button
                type="button"
                className={`pipelineToggleBtn ${pipelineSubview === "kpi" ? "active" : ""}`}
                onClick={() => setPipelineSubview("kpi")}
              >
                {UI.funnelKpiTab}
              </button>
              <button
                type="button"
                className={`pipelineToggleBtn ${pipelineSubview === "board" ? "active" : ""}`}
                onClick={() => setPipelineSubview("board")}
              >
                {UI.funnelBoardTab}
              </button>
            </div>
            {pipelineSubview === "kpi" ? (
              <FunnelKpiPanel
                className="pipelineKpiPanel"
                showHeader={false}
                metrics={metrics}
                deals={deals}
                availableStageNames={availableStageNames}
                labels={{
                  pipelineAndKpi: UI.pipelineAndKpi,
                  salesOverview: UI.salesOverview,
                  min: UI.min,
                  firstResponse: UI.firstResponse,
                  chats7d: UI.chats7d,
                  outgoing7d: UI.outgoing7d,
                  deals: UI.deals,
                  client: UI.client,
                  amount: UI.amount,
                  stage: UI.stage
                }}
                formatStageLabel={(stage) => formatStageLabel(stage, UI)}
                onDealStageChange={(dealId, stage) => void updateDealStage(dealId, stage)}
              />
            ) : (
              <>
            <div className="pipelineSectionToggle pipelineStatusToggle">
              <button
                type="button"
                className={`pipelineToggleBtn ${pipelineStatusFilter === "open" ? "active" : ""}`}
                onClick={() => setPipelineStatusFilter("open")}
              >
                {UI.openCards}
              </button>
              <button
                type="button"
                className={`pipelineToggleBtn ${pipelineStatusFilter === "closed" ? "active" : ""}`}
                onClick={() => setPipelineStatusFilter("closed")}
              >
                {UI.closedCards}
              </button>
            </div>
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
                        columnConversations.map((conversation) => {
                          const deal = deals.find((item) => item.conversation_id === conversation.id);
                          return (
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
                              if (deal) {
                                beginEditDeal(deal);
                              }
                              setCurrentSection("dialogs");
                              void onSelectConversation(conversation.id);
                            }}
                          >
                            <div className="pipelineBoardCardName">{conversation.contact_name}</div>
                            <div className="pipelineBoardCardMeta">{conversation.phone}</div>
                            {deal ? (
                              <div className="pipelineBoardCardMeta">
                                {UI.dealAmount}: {deal.amount}
                                {deal.next_step_at
                                  ? ` · ${new Date(deal.next_step_at).toLocaleDateString()}`
                                  : ""}
                              </div>
                            ) : null}
                            <div className="pipelineBoardCardSnippet">
                              {conversation.last_message_body || UI.noMessages}
                            </div>
                            <div className="pipelineBoardCardActions">
                              {deal ? (
                                <button
                                  type="button"
                                  className="textButton"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    beginEditDeal(deal);
                                  }}
                                >
                                  {UI.editArticle}
                                </button>
                              ) : null}
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
                          );
                        })
                      ) : (
                        <div className="emptyScriptState">{UI.noCardsInStage}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {selectedDealId ? (
              <div className="knowledgeFormCard" style={{ marginTop: 16 }}>
                <div className="scriptPanelTitle">{UI.saveDeal}</div>
                <div className="scriptForm">
                  <select
                    className="filterInput"
                    value={dealStageDraft}
                    onChange={(event) => setDealStageDraft(event.target.value)}
                  >
                    {availableStageNames.map((stageName) => (
                      <option key={stageName} value={stageName}>
                        {formatStageLabel(stageName, UI)}
                      </option>
                    ))}
                  </select>
                  <input
                    className="filterInput"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder={UI.dealAmount}
                    value={dealAmountDraft}
                    onChange={(event) => setDealAmountDraft(event.target.value)}
                  />
                  <label className="sidebarHint" style={{ display: "block" }}>
                    {UI.dealNextStep}
                    <input
                      className="filterInput"
                      type="datetime-local"
                      value={dealNextStepDraft}
                      onChange={(event) => setDealNextStepDraft(event.target.value)}
                      style={{ marginTop: 4 }}
                    />
                  </label>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button type="button" className="primaryButton" onClick={() => void saveSelectedDeal()}>
                      {UI.saveDeal}
                    </button>
                    <button type="button" className="pipelineToggleBtn" onClick={() => setSelectedDealId("")}>
                      {UI.cancel}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
              </>
            )}
          </section>
        ) : null}
      </main>

      {showBottomNav ? (
        <>
          <button
            type="button"
            className="fabButton"
            aria-label="Create"
            onClick={() => {
              if (currentSection === "pipeline") {
                setPipelineManagerOpen(true);
                void loadContactRequiredFields();
              } else {
                setSearchPanelOpen(true);
              }
            }}
          >
            +
          </button>
          <BottomNav
            active={bottomNavActive}
            onChange={handleBottomNavChange}
            labels={{
              dialogs: UI.menuDialogs,
              funnel: UI.menuPipeline,
              tasks: UI.menuTasks,
              profile: UI.menuProfile
            }}
          />
        </>
      ) : null}

      {customerCardOpen && contactCard ? (
        <div className="drawerOverlay" onClick={() => setCustomerCardOpen(false)}>
          <div className="clientCardModal" onClick={(event) => event.stopPropagation()}>
            <div className="clientCardModalHeader">
              <div className="clientCardModalBrand">
                <img className="brandMark" src="/logo-mark.png" alt="" width={36} height={36} />
                <div>
                  <div className="clientCardModalTitle">{UI.brandTitle}</div>
                  <div className="clientCardModalSubtitle">{UI.customerCardTitle}</div>
                </div>
              </div>
              <button type="button" className="clientCardCloseBtn" onClick={() => setCustomerCardOpen(false)}>
                {UI.close}
              </button>
            </div>

            <div className="clientCardModalBody">
              <h2 className="clientCardHeroTitle">{contactCard.name}</h2>
              <p className="clientCardHeroHint">{UI.customerCardHint}</p>

              <div className="clientCardField">
                <label>{fieldLabel("name")}</label>
                <div className="clientCardInput">
                  <span className="clientCardInputIcon" aria-hidden="true">👤</span>
                  <input
                    value={contactCard.name}
                    onChange={(event) => setContactCard((prev) => (prev ? { ...prev, name: event.target.value } : prev))}
                  />
                </div>
              </div>
              <div className="clientCardField">
                <label>{fieldLabel("phone")}</label>
                <div className="clientCardInput">
                  <span className="clientCardInputIcon" aria-hidden="true">📞</span>
                  <input
                    value={contactCard.phone}
                    onChange={(event) => setContactCard((prev) => (prev ? { ...prev, phone: event.target.value } : prev))}
                  />
                </div>
                {contactCard.phone ? (
                  <button
                    type="button"
                    className="secondaryButton clientCardCallBtn"
                    onClick={() => requestTelephonyDial(contactCard.phone)}
                  >
                    Позвонить
                  </button>
                ) : null}
              </div>
              <div className="clientCardField">
                <label>{fieldLabel("city")}</label>
                <div className="clientCardInput">
                  <span className="clientCardInputIcon" aria-hidden="true">📍</span>
                  <input
                    placeholder="Укажите город"
                    value={contactCard.city || ""}
                    onChange={(event) => setContactCard((prev) => (prev ? { ...prev, city: event.target.value } : prev))}
                  />
                </div>
              </div>
              <div className="clientCardField">
                <label>{fieldLabel("inquiry_reason")}</label>
                <div className="clientCardInput">
                  <span className="clientCardInputIcon" aria-hidden="true">ℹ️</span>
                  <input
                    placeholder="Напр. покупка квартиры"
                    value={contactCard.inquiry_reason || ""}
                    onChange={(event) =>
                      setContactCard((prev) => (prev ? { ...prev, inquiry_reason: event.target.value } : prev))
                    }
                  />
                </div>
              </div>
              {contactCard.marketing_source || contactCard.utm_source || contactCard.utm_campaign ? (
                <div className="clientCardField">
                  <label>Источник</label>
                  <div className="sidebarHint" style={{ marginTop: 4 }}>
                    {[
                      contactCard.marketing_source,
                      contactCard.utm_source,
                      contactCard.utm_medium,
                      contactCard.utm_campaign,
                      contactCard.utm_content
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
              ) : null}
              <div className="clientCardField">
                <label>{fieldLabel("client_type")}</label>
                <div className="clientCardInput">
                  <span className="clientCardInputIcon" aria-hidden="true">🏷</span>
                  <select
                    value={contactCard.client_type || "B2C"}
                    onChange={(event) =>
                      setContactCard((prev) => (prev ? { ...prev, client_type: event.target.value } : prev))
                    }
                  >
                    <option value="B2C">B2C</option>
                    <option value="B2B">B2B</option>
                  </select>
                </div>
              </div>
              <div className="clientCardField">
                <label>{fieldLabel("category")}</label>
                <div className="clientCardInput">
                  <span className="clientCardInputIcon" aria-hidden="true">📂</span>
                  <select
                    value={contactCard.category || "Новый"}
                    onChange={(event) =>
                      setContactCard((prev) => (prev ? { ...prev, category: event.target.value } : prev))
                    }
                  >
                    <option value="Новый">Новый</option>
                    <option value="Повторный">Повторный</option>
                    <option value="VIP">VIP</option>
                  </select>
                </div>
              </div>
              <div className="clientCardField">
                <label>{UI.funnel}</label>
                <div className="clientCardInput">
                  <span className="clientCardInputIcon" aria-hidden="true">🔽</span>
                  <select
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
                </div>
              </div>
              <button
                type="button"
                className="secondaryButton"
                onClick={() => {
                  setPipelineManagerOpen(true);
                  setDealStageError("");
                  void loadContactRequiredFields();
                }}
              >
                {UI.manageFunnel}
              </button>
              {selectedConversationData ? (
                <>
                  <div className="clientCardWorkActions">
                    <button
                      type="button"
                      className="clientCardTakeBtn"
                      disabled={
                        Boolean(sessionUser?.id) &&
                        selectedConversationData.assigned_manager_id === sessionUser?.id &&
                        selectedConversationData.status === "open"
                      }
                      onClick={() => void takeConversationIntoWork(selectedConversationData.id)}
                    >
                      {selectedConversationData.assigned_manager_id === sessionUser?.id &&
                      selectedConversationData.status === "open"
                        ? UI.alreadyInWork
                        : UI.takeIntoWork}
                    </button>
                    <button
                      type="button"
                      className={`clientCardCloseDialogBtn${
                        selectedConversationData.status === "closed" ? " reopen" : ""
                      }`}
                      onClick={() =>
                        void (selectedConversationData.status === "closed"
                          ? reopenConversationFromCard(selectedConversationData.id)
                          : closeConversationFromCard(selectedConversationData.id))
                      }
                    >
                      {selectedConversationData.status === "closed" ? UI.reopenCard : UI.closeCard}
                    </button>
                    <button
                      type="button"
                      className="clientCardTakeBtn"
                      onClick={() => void shareSelectedConversationToTeam()}
                    >
                      {UI.shareToTeam}
                    </button>
                  </div>
                  {selectedConversationData.assigned_manager_name ? (
                    <div
                      className="clientCardAssigneeHint"
                      style={
                        selectedConversationData.assigned_manager_color
                          ? ({
                              ["--operator-color" as string]: selectedConversationData.assigned_manager_color
                            } as CSSProperties)
                          : undefined
                      }
                    >
                      {UI.assignedTo}: <strong>{selectedConversationData.assigned_manager_name}</strong>
                    </div>
                  ) : null}
                </>
              ) : null}
              <div className="clientCardActions">
                <button type="button" className="clientCardSaveBtn" onClick={() => void saveContactCard()}>
                  💾 {UI.save}
                </button>
                <button
                  type="button"
                  className="clientCardSendBtn"
                  onClick={() => {
                    void saveContactCard();
                    setCustomerCardOpen(false);
                  }}
                >
                  ✈ {UI.sendToMessenger}
                </button>
              </div>
            </div>
          </div>
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
            <div className="sidebarHint">{UI.stageOutcomeHint}</div>
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
                        <select
                          className="pipelineOutcomeSelect"
                          value={stage.outcome || "open"}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => {
                            event.stopPropagation();
                            void updateStageOutcome(stage.id, event.target.value as StageOutcome);
                          }}
                        >
                          <option value="open">{UI.stageOutcomeOpen}</option>
                          <option value="won">{UI.stageOutcomeWon}</option>
                          <option value="lost">{UI.stageOutcomeLost}</option>
                        </select>
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
                      <div className="pipelineStageActions">
                        <select
                          className="pipelineOutcomeSelect"
                          value={stage.outcome || "open"}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => {
                            event.stopPropagation();
                            void updateStageOutcome(stage.id, event.target.value as StageOutcome);
                          }}
                        >
                          <option value="open">{UI.stageOutcomeOpen}</option>
                          <option value="won">{UI.stageOutcomeWon}</option>
                          <option value="lost">{UI.stageOutcomeLost}</option>
                        </select>
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
                  )}
                </div>
              ))}
            </div>
            {sessionUser?.role === "admin" ? (
              <div className="requiredFieldsBlock" style={{ marginBottom: 14 }}>
                <div className="sidebarTitle">{UI.applyRePresetTitle}</div>
                <div className="sidebarHint">{UI.applyRePresetHint}</div>
                <button
                  type="button"
                  className="primaryButton"
                  style={{ marginTop: 10 }}
                  disabled={applyingRePreset}
                  onClick={() => void applyRealEstateKzPreset()}
                >
                  {applyingRePreset ? "…" : UI.applyRePresetButton}
                </button>
              </div>
            ) : null}
            <div className="requiredFieldsBlock">
              <div className="sidebarTitle">{UI.requiredFieldsTitle}</div>
              <div className="sidebarHint">{UI.requiredFieldsHint}</div>
              <div className="requiredFieldsList">
                {CONTACT_REQUIRED_FIELD_OPTIONS.map((key) => (
                  <label key={key} className="requiredFieldToggle">
                    <input
                      type="checkbox"
                      checked={contactRequiredFields.includes(key)}
                      onChange={(event) => {
                        const next = event.target.checked
                          ? [...contactRequiredFields, key]
                          : contactRequiredFields.filter((item) => item !== key);
                        void saveContactRequiredFields(next);
                      }}
                    />
                    <span>{fieldLabel(key).replace(/\s\*$/, "")}</span>
                  </label>
                ))}
              </div>
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
      {token ? (
        <TelephonySoftphone
          authToken={token}
          onToast={showToast}
          onCallLinked={(result: CallLogResult) => {
            if (!result.conversation_id) {
              return;
            }
            setSelectedConversation(result.conversation_id);
            setCurrentSection("dialogs");
            setMobileThreadOpen(true);
            void loadConversations(token, search, filters, setConversations);
            void loadMessages(token, result.conversation_id, setMessages);
            void loadContactCard(token, result.conversation_id, setContactCard);
          }}
        />
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
