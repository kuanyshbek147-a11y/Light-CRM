import { useMemo, useState } from "react";
import { useTapWithoutScroll } from "./lib/useTapWithoutScroll";
import type {
  Conversation,
  InboxFilters,
  QuickActionManager,
  SavedInboxFilterPreset
} from "./model/types";

type ChannelFilter = "all" | "whatsapp" | "telegram";

function formatDialogTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function formatSnippet(conversation: Conversation, fallback: string): string {
  const body = conversation.last_message_body || fallback;
  if (body.includes("[Голосовое") || body.toLowerCase().includes("voice")) {
    return "🎤 [Голосовое сообщение]";
  }
  if (body.startsWith("http") && body.includes("image")) {
    return "🖼 [Отправлено изображение]";
  }
  return body;
}

type InboxSidebarUi = {
  inboxTitle: string;
  chatsSuffix: string;
  openSearchFilters: string;
  searchByNameOrPhone: string;
  city: string;
  reason: string;
  clientType: string;
  category: string;
  noMessages: string;
  closeCard: string;
  reopenCard: string;
};

type ConversationListItemProps = {
  conversation: Conversation;
  isActive: boolean;
  ui: Pick<InboxSidebarUi, "noMessages" | "closeCard" | "reopenCard">;
  quickManagers: QuickActionManager[];
  quickManagerByConversation: Record<string, string>;
  quickStageByConversation: Record<string, string>;
  quickTaskByConversation: Record<string, string>;
  quickDeferMinutesByConversation: Record<string, number>;
  availableStageNames: string[];
  getStageLabel: (stageName: string) => string;
  onSelectConversation: (conversationId: string) => void;
  onQuickManagerChange: (conversationId: string, managerId: string) => void;
  onQuickStageChange: (conversationId: string, stage: string) => void;
  onQuickTaskChange: (conversationId: string, title: string) => void;
  onQuickDeferMinutesChange: (conversationId: string, minutes: number) => void;
  onCreateQuickTask: (conversationId: string) => void;
  onToggleConversationStatus: (conversationId: string, currentStatus: "open" | "closed") => void;
  onMarkSlaFollowUpDone: (conversationId: string) => void;
  onAcknowledgeSlaEscalation: (conversationId: string) => void;
  onDeferSlaEscalation: (conversationId: string, minutes: number) => void;
};

function ConversationListItem(props: ConversationListItemProps): JSX.Element {
  const {
    conversation,
    isActive,
    ui,
    quickManagers,
    quickManagerByConversation,
    quickStageByConversation,
    quickTaskByConversation,
    quickDeferMinutesByConversation,
    availableStageNames,
    getStageLabel,
    onSelectConversation,
    onQuickManagerChange,
    onQuickStageChange,
    onQuickTaskChange,
    onQuickDeferMinutesChange,
    onCreateQuickTask,
    onToggleConversationStatus,
    onMarkSlaFollowUpDone,
    onAcknowledgeSlaEscalation,
    onDeferSlaEscalation
  } = props;

  const openConversation = useTapWithoutScroll(() => onSelectConversation(conversation.id));
  const initial = (conversation.contact_name || "?").trim().slice(0, 1).toUpperCase();

  return (
    <li>
      <div className={`chatItem dialogCard ${isActive ? "active" : ""}`}>
        <div
          className="dialogCardTapArea"
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelectConversation(conversation.id);
            }
          }}
          {...openConversation}
        >
          <div className="dialogCardTop">
            <span className="dialogCardAvatar chatAvatar" aria-hidden="true">
              {initial}
            </span>
            <span className="dialogCardMain chatBody">
              <span className="dialogCardNameRow chatTopLine">
                <span className="dialogCardName chatName">
                  {conversation.contact_name}
                  {conversation.is_group ? <span className="groupBadge">Группа</span> : null}
                </span>
                <span className="dialogCardTime">{formatDialogTime(conversation.updated_at)}</span>
              </span>
              <span className="dialogCardChannelRow">
                <span className={`channelBadge ${conversation.channel}`}>
                  {conversation.channel === "whatsapp" ? "WhatsApp" : "Telegram"}
                </span>
                <span className="chatPhone">{conversation.is_group ? "group" : conversation.phone}</span>
              </span>
              <span className="dialogCardBadges chatMetaRow">
                <span className={`priorityBadge ${conversation.priority || "normal"}`}>
                  {(conversation.priority || "normal").toUpperCase()}
                </span>
                {conversation.unread_count ? (
                  <span className="attentionBadge unread">UNREAD: {conversation.unread_count}</span>
                ) : null}
                {conversation.sla_overdue ? <span className="attentionBadge overdue">SLA EXPIRED</span> : null}
                {conversation.sla_escalated ? <span className="attentionBadge escalated">ESCALATION SLA</span> : null}
              </span>
              <span className="dialogCardSnippet chatSnippet">
                {formatSnippet(conversation, ui.noMessages)}
              </span>
            </span>
          </div>
        </div>
        <div className="dialogCardActions">
          <button
            type="button"
            className="dialogActionBtn"
            onClick={() => onCreateQuickTask(conversation.id)}
          >
            New Task
          </button>
          <button
            type="button"
            className="dialogActionBtn primary"
            onClick={() => onSelectConversation(conversation.id)}
          >
            Take Deal
          </button>
        </div>
      </div>
      <div className="chatQuickActions">
        <select
          className="filterInput chatQuickControl"
          value={quickManagerByConversation[conversation.id] ?? conversation.assigned_manager_id ?? ""}
          aria-label="Назначить менеджера"
          onChange={(event) => onQuickManagerChange(conversation.id, event.target.value)}
        >
          <option value="">Ответственный</option>
          {quickManagers.map((manager) => (
            <option key={manager.id} value={manager.id}>
              {manager.full_name}
            </option>
          ))}
        </select>
        <select
          className="filterInput chatQuickControl"
          value={quickStageByConversation[conversation.id] ?? conversation.stage ?? ""}
          aria-label="Сменить этап сделки"
          onChange={(event) => onQuickStageChange(conversation.id, event.target.value)}
        >
          <option value="">Этап сделки</option>
          {availableStageNames.map((stageName) => (
            <option key={stageName} value={stageName}>
              {getStageLabel(stageName)}
            </option>
          ))}
        </select>
        <input
          className="filterInput chatQuickControl"
          placeholder="Новая задача"
          aria-label="Создать задачу"
          value={quickTaskByConversation[conversation.id] || ""}
          onChange={(event) => onQuickTaskChange(conversation.id, event.target.value)}
        />
        <button type="button" className="secondaryButton chatQuickButton" onClick={() => onCreateQuickTask(conversation.id)}>
          + задача
        </button>
        <button
          type="button"
          className={`secondaryButton chatQuickButton ${conversation.status === "closed" ? "statusReopenButton" : "statusCloseButton"}`}
          onClick={() => onToggleConversationStatus(conversation.id, conversation.status)}
        >
          {conversation.status === "open" ? ui.closeCard : ui.reopenCard}
        </button>
        {conversation.has_sla_follow_up ? (
          <button
            type="button"
            className="secondaryButton chatQuickButton followupDoneButton"
            onClick={() => onMarkSlaFollowUpDone(conversation.id)}
          >
            Закрыть SLA-контроль
          </button>
        ) : null}
        {conversation.sla_escalated ? (
          <button
            type="button"
            className="secondaryButton chatQuickButton escalationAckButton"
            onClick={() => onAcknowledgeSlaEscalation(conversation.id)}
          >
            Взять в работу
          </button>
        ) : null}
        {conversation.sla_escalated ? (
          <>
            <select
              className="filterInput chatQuickControl"
              value={quickDeferMinutesByConversation[conversation.id] ?? 30}
              aria-label="Отложить SLA эскалацию"
              onChange={(event) => onQuickDeferMinutesChange(conversation.id, Number(event.target.value))}
            >
              <option value={15}>15 мин</option>
              <option value={30}>30 мин</option>
              <option value={60}>60 мин</option>
            </select>
            <button
              type="button"
              className="secondaryButton chatQuickButton"
              onClick={() => onDeferSlaEscalation(conversation.id, quickDeferMinutesByConversation[conversation.id] ?? 30)}
            >
              Отложить
            </button>
          </>
        ) : null}
      </div>
    </li>
  );
}

type InboxSidebarProps = {
  ui: InboxSidebarUi;
  conversations: Conversation[];
  selectedConversation: string;
  searchPanelOpen: boolean;
  search: string;
  filters: InboxFilters;
  savedFilterPresets: SavedInboxFilterPreset[];
  quickManagers: QuickActionManager[];
  quickManagerByConversation: Record<string, string>;
  quickStageByConversation: Record<string, string>;
  quickTaskByConversation: Record<string, string>;
  quickDeferMinutesByConversation: Record<string, number>;
  availableStageNames: string[];
  getStageLabel: (stageName: string) => string;
  onToggleSearchPanel: () => void;
  onSearchChange: (value: string) => void;
  onFiltersChange: (next: InboxFilters) => void;
  onApplyFilters: () => void;
  onSaveFilterPreset: () => void;
  onResetFilters: () => void;
  onApplyFilterPreset: (preset: SavedInboxFilterPreset) => void;
  onRemoveFilterPreset: (presetId: string) => void;
  onSelectConversation: (conversationId: string) => void;
  onQuickManagerChange: (conversationId: string, managerId: string) => void;
  onQuickStageChange: (conversationId: string, stage: string) => void;
  onQuickTaskChange: (conversationId: string, title: string) => void;
  onQuickDeferMinutesChange: (conversationId: string, minutes: number) => void;
  onCreateQuickTask: (conversationId: string) => void;
  onToggleConversationStatus: (conversationId: string, currentStatus: "open" | "closed") => void;
  onMarkSlaFollowUpDone: (conversationId: string) => void;
  onAcknowledgeSlaEscalation: (conversationId: string) => void;
  onDeferSlaEscalation: (conversationId: string, minutes: number) => void;
};

export function InboxSidebar(props: InboxSidebarProps): JSX.Element {
  const {
    ui,
    conversations,
    selectedConversation,
    searchPanelOpen,
    search,
    filters,
    savedFilterPresets,
    quickManagers,
    quickManagerByConversation,
    quickStageByConversation,
    quickTaskByConversation,
    quickDeferMinutesByConversation,
    availableStageNames,
    getStageLabel,
    onToggleSearchPanel,
    onSearchChange,
    onFiltersChange,
    onApplyFilters,
    onSaveFilterPreset,
    onResetFilters,
    onApplyFilterPreset,
    onRemoveFilterPreset,
    onSelectConversation,
    onQuickManagerChange,
    onQuickStageChange,
    onQuickTaskChange,
    onQuickDeferMinutesChange,
    onCreateQuickTask,
    onToggleConversationStatus,
    onMarkSlaFollowUpDone,
    onAcknowledgeSlaEscalation,
    onDeferSlaEscalation
  } = props;

  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");

  const visibleConversations = useMemo(() => {
    if (channelFilter === "all") {
      return conversations;
    }
    return conversations.filter((conversation) => conversation.channel === channelFilter);
  }, [channelFilter, conversations]);

  return (
    <aside className="sidebar card">
      <div className="mobilePageHeader">
        <div className="mobilePageHeaderText">
          <div className="mobilePageTitle">Dialogs Center</div>
          <div className="mobilePageSubtitle">
            {visibleConversations.length} active
          </div>
        </div>
        <div className="mobilePageActions">
          <button
            type="button"
            className="threadIconBtn"
            title={ui.openSearchFilters}
            aria-label={ui.openSearchFilters}
            aria-expanded={searchPanelOpen}
            onClick={onToggleSearchPanel}
          >
            🔍
          </button>
          <button type="button" className="threadIconBtn" title="Notifications" aria-label="Notifications">
            🔔
          </button>
        </div>
      </div>

      <div className="channelFilters" role="tablist" aria-label="Channel filters">
        {([
          ["all", "All Channels"],
          ["whatsapp", "WhatsApp"],
          ["telegram", "Telegram"]
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={channelFilter === value}
            className={`channelChip ${channelFilter === value ? "active" : ""}`}
            onClick={() => setChannelFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="sidebarHeader">
        <div>
          <div className="sidebarTitle">{ui.inboxTitle}</div>
          <div className="sidebarHint">{conversations.length} {ui.chatsSuffix}</div>
        </div>
        <button
          type="button"
          className="sidebarSearchButton"
          title={ui.openSearchFilters}
          aria-label={ui.openSearchFilters}
          aria-expanded={searchPanelOpen}
          onClick={onToggleSearchPanel}
        >
          {"\uD83D\uDD0D"}
        </button>
      </div>

      {searchPanelOpen ? (
        <>
          <div className="searchWrap">
            <input
              className="searchInput"
              placeholder={ui.searchByNameOrPhone}
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </div>

          <div className="filterGrid">
            <input
              className="filterInput"
              placeholder={ui.city}
              value={filters.city}
              onChange={(event) => onFiltersChange({ ...filters, city: event.target.value })}
            />
            <input
              className="filterInput"
              placeholder={ui.reason}
              value={filters.inquiryReason}
              onChange={(event) => onFiltersChange({ ...filters, inquiryReason: event.target.value })}
            />
            <input
              className="filterInput"
              placeholder={ui.clientType}
              value={filters.clientType}
              onChange={(event) => onFiltersChange({ ...filters, clientType: event.target.value })}
            />
            <input
              className="filterInput"
              placeholder={ui.category}
              value={filters.category}
              onChange={(event) => onFiltersChange({ ...filters, category: event.target.value })}
            />
            <select
              className="filterInput"
              value={filters.priority}
              onChange={(event) => onFiltersChange({ ...filters, priority: event.target.value })}
            >
              <option value="">Приоритет: любой</option>
              <option value="low">Низкий</option>
              <option value="normal">Обычный</option>
              <option value="high">Высокий</option>
              <option value="urgent">Срочный</option>
            </select>
            <select
              className="filterInput"
              value={filters.attention}
              onChange={(event) =>
                onFiltersChange({
                  ...filters,
                  attention: event.target.value as InboxFilters["attention"]
                })
              }
            >
              <option value="">Фокус: все</option>
              <option value="unread">Только непрочитанные</option>
              <option value="overdue">SLA просроченные</option>
              <option value="escalated">Только SLA-эскалации</option>
            </select>
          </div>

          <div className="filterPresetRow">
            <button type="button" className="secondaryButton" onClick={onApplyFilters}>
              Применить фильтры
            </button>
            <button type="button" className="secondaryButton" onClick={onSaveFilterPreset}>
              Сохранить набор
            </button>
            <button type="button" className="secondaryButton" onClick={onResetFilters}>
              Сбросить
            </button>
          </div>

          {savedFilterPresets.length ? (
            <div className="savedFilterChips">
              {savedFilterPresets.map((preset) => (
                <div key={preset.id} className="savedFilterChip">
                  <button type="button" className="textButton" onClick={() => onApplyFilterPreset(preset)}>
                    {preset.name}
                  </button>
                  <button type="button" className="textButton dangerButton" onClick={() => onRemoveFilterPreset(preset.id)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      <ul className="chatList">
        {visibleConversations.map((conversation) => (
          <ConversationListItem
            key={conversation.id}
            conversation={conversation}
            isActive={conversation.id === selectedConversation}
            ui={ui}
            quickManagers={quickManagers}
            quickManagerByConversation={quickManagerByConversation}
            quickStageByConversation={quickStageByConversation}
            quickTaskByConversation={quickTaskByConversation}
            quickDeferMinutesByConversation={quickDeferMinutesByConversation}
            availableStageNames={availableStageNames}
            getStageLabel={getStageLabel}
            onSelectConversation={onSelectConversation}
            onQuickManagerChange={onQuickManagerChange}
            onQuickStageChange={onQuickStageChange}
            onQuickTaskChange={onQuickTaskChange}
            onQuickDeferMinutesChange={onQuickDeferMinutesChange}
            onCreateQuickTask={onCreateQuickTask}
            onToggleConversationStatus={onToggleConversationStatus}
            onMarkSlaFollowUpDone={onMarkSlaFollowUpDone}
            onAcknowledgeSlaEscalation={onAcknowledgeSlaEscalation}
            onDeferSlaEscalation={onDeferSlaEscalation}
          />
        ))}
      </ul>
    </aside>
  );
}
