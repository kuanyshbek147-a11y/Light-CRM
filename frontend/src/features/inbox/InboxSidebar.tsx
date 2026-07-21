import { useMemo, useState } from "react";
import type { MouseEvent, PointerEvent } from "react";
import { useTapWithoutScroll } from "./lib/useTapWithoutScroll";
import { operatorDialogCardStyle } from "./lib/operatorColor";
import type { Conversation, InboxFilters, SavedInboxFilterPreset } from "./model/types";

type ChannelFilter = "all" | "whatsapp" | "telegram" | "instagram" | "web" | "email";

function channelLabel(channel: Conversation["channel"]): string {
  switch (channel) {
    case "whatsapp":
      return "WhatsApp";
    case "telegram":
      return "Telegram";
    case "instagram":
      return "Instagram";
    case "web":
      return "Сайт";
    case "email":
      return "Email";
    default:
      return channel;
  }
}

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
  if (body.includes("[Изображение]") || (body.startsWith("http") && body.includes("image"))) {
    return "🖼 [Изображение]";
  }
  if (body.includes("[Видео]")) {
    return "🎬 [Видео]";
  }
  if (body.includes("[Медиа]")) {
    return "📎 [Медиа]";
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
  customerCard: string;
};

type ConversationListItemProps = {
  conversation: Conversation;
  isActive: boolean;
  noMessages: string;
  customerCardLabel: string;
  onSelectConversation: (conversationId: string) => void;
  onOpenCustomerCard: (conversationId: string) => void;
};

function ConversationListItem(props: ConversationListItemProps): JSX.Element {
  const {
    conversation,
    isActive,
    noMessages,
    customerCardLabel,
    onSelectConversation,
    onOpenCustomerCard
  } = props;

  const openConversation = useTapWithoutScroll(() => onSelectConversation(conversation.id));
  const initial = (conversation.contact_name || "?").trim().slice(0, 1).toUpperCase();

  function openCustomerCard(event: MouseEvent | PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    onOpenCustomerCard(conversation.id);
  }

  return (
    <li>
      <div
        className={`chatItem dialogCard ${isActive ? "active" : ""}${
          conversation.assigned_manager_id ? " assigned" : ""
        }${conversation.status === "closed" ? " closed" : ""}`}
        style={operatorDialogCardStyle(conversation.assigned_manager_color)}
      >
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
            <button
              type="button"
              className="dialogCardAvatar chatAvatar clientCardTrigger"
              title={customerCardLabel}
              aria-label={customerCardLabel}
              onPointerDown={(event) => event.stopPropagation()}
              onPointerUp={(event) => event.stopPropagation()}
              onClick={openCustomerCard}
            >
              {initial}
            </button>
            <span className="dialogCardMain chatBody">
              <span className="dialogCardNameRow chatTopLine">
                <button
                  type="button"
                  className="dialogCardName chatName clientCardTrigger"
                  title={customerCardLabel}
                  onPointerDown={(event) => event.stopPropagation()}
                  onPointerUp={(event) => event.stopPropagation()}
                  onClick={openCustomerCard}
                >
                  {conversation.contact_name}
                  {conversation.is_group ? <span className="groupBadge">Группа</span> : null}
                </button>
                <span className="dialogCardMeta">
                  <span className={`channelBadge ${conversation.channel}`} title={channelLabel(conversation.channel)}>
                    {channelLabel(conversation.channel)}
                  </span>
                  <span className="dialogCardTime">{formatDialogTime(conversation.updated_at)}</span>
                </span>
              </span>
              <span className="dialogCardSnippet chatSnippet">
                {formatSnippet(conversation, noMessages)}
              </span>
              {conversation.assigned_manager_name ? (
                <span className="dialogCardAssignee">
                  {conversation.assigned_manager_name}
                </span>
              ) : null}
            </span>
          </div>
        </div>
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
  onToggleSearchPanel: () => void;
  onSearchChange: (value: string) => void;
  onFiltersChange: (next: InboxFilters) => void;
  onApplyFilters: () => void;
  onSaveFilterPreset: () => void;
  onResetFilters: () => void;
  onApplyFilterPreset: (preset: SavedInboxFilterPreset) => void;
  onRemoveFilterPreset: (presetId: string) => void;
  onSelectConversation: (conversationId: string) => void;
  onOpenCustomerCard: (conversationId: string) => void;
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
    onToggleSearchPanel,
    onSearchChange,
    onFiltersChange,
    onApplyFilters,
    onSaveFilterPreset,
    onResetFilters,
    onApplyFilterPreset,
    onRemoveFilterPreset,
    onSelectConversation,
    onOpenCustomerCard
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
          <div className="mobilePageTitle">{ui.inboxTitle}</div>
          <div className="mobilePageSubtitle">
            {visibleConversations.length} {ui.chatsSuffix}
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
          ["all", "Все"],
          ["whatsapp", "WhatsApp"],
          ["telegram", "Telegram"],
          ["instagram", "Instagram"],
          ["web", "Сайт"],
          ["email", "Email"]
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
            noMessages={ui.noMessages}
            customerCardLabel={ui.customerCard}
            onSelectConversation={onSelectConversation}
            onOpenCustomerCard={onOpenCustomerCard}
          />
        ))}
      </ul>
    </aside>
  );
}
