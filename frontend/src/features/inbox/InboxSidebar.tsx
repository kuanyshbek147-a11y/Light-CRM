import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, PointerEvent } from "react";
import { NotificationBellButton } from "../../shared/ui/NotificationBellButton";
import { ListSkeleton } from "../../shared/ui/ListSkeleton";
import { conversationsForChannel, type InboxChannelFilter } from "./lib/channelFilter";
import { useTapWithoutScroll } from "./lib/useTapWithoutScroll";
import { operatorDialogCardStyle } from "./lib/operatorColor";
import { DialogsEmptyState } from "./DialogsEmptyState";
import { inboxFiltersActive, resolveInboxEmptyKind } from "./inboxEmpty";
import { formatChannelLabel, ruPlural } from "../../shared/i18n/glossary";
import type { Conversation, InboxFilters, SavedInboxFilterPreset } from "./model/types";

function channelLabel(channel: Conversation["channel"]): string {
  return formatChannelLabel(channel);
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

const CHANNEL_FILTERS = [
  ["all", "Все"],
  ["whatsapp", "WhatsApp"],
  ["telegram", "Telegram"],
  ["instagram", "Instagram"],
  ["web", "Сайт"],
  ["email", "Почта"]
] as const;

function ChannelScrollChevron(props: { direction: "left" | "right" }): JSX.Element {
  const path = props.direction === "left" ? "M12.5 4.5 7 10l5.5 5.5" : "M7.5 4.5 13 10l-5.5 5.5";
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChannelFilters(props: {
  value: InboxChannelFilter;
  onChange: (value: InboxChannelFilter) => void;
}): JSX.Element {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) {
      return;
    }

    const update = (): void => {
      const lastChip = el.querySelector<HTMLElement>(".channelChip:last-of-type");
      const lastEnd = lastChip
        ? lastChip.getBoundingClientRect().right - el.getBoundingClientRect().left + el.scrollLeft
        : 0;
      const left = el.scrollLeft > 2;
      const right = lastEnd - el.clientWidth - el.scrollLeft > 2;
      setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
    };

    let cancelled = false;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener("resize", update);
    if (document.fonts) {
      void document.fonts.ready.then(() => {
        if (!cancelled) {
          update();
        }
      });
    }

    return () => {
      cancelled = true;
      el.removeEventListener("scroll", update);
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  function scrollChannels(direction: -1 | 1): void {
    const el = scrollerRef.current;
    if (!el) {
      return;
    }
    const chips = Array.from(el.querySelectorAll<HTMLButtonElement>(".channelChip"));
    const origin = el.getBoundingClientRect().left;
    const starts = chips.map((chip) => chip.getBoundingClientRect().left - origin + el.scrollLeft);
    const widths = chips.map((chip) => chip.getBoundingClientRect().width);
    const viewLeft = el.scrollLeft;
    const viewRight = viewLeft + el.clientWidth;
    const edge = 4;

    if (direction > 0) {
      const index = starts.findIndex((start, chipIndex) => start + widths[chipIndex] > viewRight - edge);
      const left = index >= 0 ? starts[index] : el.scrollWidth - el.clientWidth;
      el.scrollTo({ left });
      return;
    }

    let index = -1;
    for (let chipIndex = starts.length - 1; chipIndex >= 0; chipIndex -= 1) {
      if (starts[chipIndex] < viewLeft + edge) {
        index = chipIndex;
        break;
      }
    }
    if (index < 0) {
      el.scrollTo({ left: 0 });
      return;
    }
    el.scrollTo({
      left: Math.max(0, starts[index] + widths[index] - el.clientWidth)
    });
  }

  return (
    <div
      className={`channelFiltersBar${edges.left ? " canScrollLeft" : ""}${edges.right ? " canScrollRight" : ""}`}
    >
      <button
        type="button"
        className="channelScrollBtn channelScrollBtnPrev"
        aria-label="Предыдущие каналы"
        aria-hidden={!edges.left}
        tabIndex={edges.left ? 0 : -1}
        disabled={!edges.left}
        onClick={() => scrollChannels(-1)}
      >
        <ChannelScrollChevron direction="left" />
      </button>
      <div ref={scrollerRef} className="channelFilters" role="tablist" aria-label="Каналы">
        {CHANNEL_FILTERS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={props.value === value}
            className={`channelChip ${props.value === value ? "active" : ""}`}
            data-testid={`channel-filter-${value}`}
            onClick={() => props.onChange(value)}
          >
            {label}
          </button>
        ))}
        <span className="channelFiltersSpacer" aria-hidden="true" />
      </div>
      <button
        type="button"
        className="channelScrollBtn channelScrollBtnNext"
        aria-label="Следующие каналы"
        aria-hidden={!edges.right}
        tabIndex={edges.right ? 0 : -1}
        disabled={!edges.right}
        onClick={() => scrollChannels(1)}
      >
        <ChannelScrollChevron direction="right" />
      </button>
    </div>
  );
}

type InboxSidebarUi = {
  inboxTitle: string;
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
                  {conversation.landing_id || conversation.marketing_source === "landing" ? (
                    <span className="groupBadge" title="Заявка со страницы">
                      С сайта
                    </span>
                  ) : null}
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
  notificationSoundOn: boolean;
  onToggleNotificationSound: () => void;
  onSearchChange: (value: string) => void;
  onFiltersChange: (next: InboxFilters) => void;
  onApplyFilters: () => void;
  onSaveFilterPreset: () => void;
  onResetFilters: () => void;
  onApplyFilterPreset: (preset: SavedInboxFilterPreset) => void;
  onRemoveFilterPreset: (presetId: string) => void;
  onSelectConversation: (conversationId: string) => void;
  onOpenCustomerCard: (conversationId: string) => void;
  onClearSearchAndFilters?: () => void;
  onOpenIntegrations?: () => void;
  channelFilter: InboxChannelFilter;
  onChannelFilterChange: (next: InboxChannelFilter) => void;
  isAdmin?: boolean;
  loading?: boolean;
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
    notificationSoundOn,
    onToggleNotificationSound,
    onSearchChange,
    onFiltersChange,
    onApplyFilters,
    onSaveFilterPreset,
    onResetFilters,
    onApplyFilterPreset,
    onRemoveFilterPreset,
    onSelectConversation,
    onOpenCustomerCard,
    onClearSearchAndFilters,
    onOpenIntegrations,
    channelFilter,
    onChannelFilterChange,
    isAdmin = false,
    loading = false
  } = props;

  const visibleConversations = useMemo(
    () => conversationsForChannel(conversations, channelFilter),
    [channelFilter, conversations]
  );

  return (
    <aside className="sidebar card">
      <div className="mobilePageHeader">
        <div className="mobilePageHeaderText">
          <div className="mobilePageTitle">{ui.inboxTitle}</div>
          <div className="mobilePageSubtitle">
            {ruPlural(visibleConversations.length, ["чат", "чата", "чатов"])}
          </div>
        </div>
        <div className="mobilePageActions">
          <button
            type="button"
            className={`inboxFilterToggle${searchPanelOpen ? " isOpen" : ""}${
              search.trim() || inboxFiltersActive(filters) ? " hasQuery" : ""
            }`}
            title={ui.openSearchFilters}
            aria-label={ui.openSearchFilters}
            aria-expanded={searchPanelOpen}
            onClick={onToggleSearchPanel}
          >
            <span aria-hidden="true">🔍</span>
            <span>Поиск</span>
          </button>
          <NotificationBellButton
            className="threadIconBtn inboxHeaderBell"
            size={19}
            enabled={notificationSoundOn}
            onToggle={onToggleNotificationSound}
          />
        </div>
      </div>

      <ChannelFilters value={channelFilter} onChange={onChannelFilterChange} />

      <div className="sidebarHeader">
        <div>
          <div className="sidebarTitle">{ui.inboxTitle}</div>
          <div className="sidebarHint">{ruPlural(visibleConversations.length, ["чат", "чата", "чатов"])}</div>
        </div>
        <button
          type="button"
          className={`inboxFilterToggle${searchPanelOpen ? " isOpen" : ""}${
            search.trim() || inboxFiltersActive(filters) ? " hasQuery" : ""
          }`}
          title={ui.openSearchFilters}
          aria-label={ui.openSearchFilters}
          aria-expanded={searchPanelOpen}
          onClick={onToggleSearchPanel}
        >
          <span aria-hidden="true">🔍</span>
          <span>Поиск</span>
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
              <option value="overdue">Просрочен срок ответа</option>
              <option value="escalated">Только переданные из-за просрочки</option>
            </select>
            <select
              className="filterInput"
              value={filters.source || ""}
              onChange={(event) =>
                onFiltersChange({
                  ...filters,
                  source: event.target.value as InboxFilters["source"]
                })
              }
            >
              <option value="">Источник: все</option>
              <option value="landing">Заявка со страницы</option>
            </select>
          </div>

          <div className="filterPresetRow">
            <button type="button" className="primaryButton" onClick={onApplyFilters}>
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
        {loading ? (
          <li className="chatListSkeletonItem">
            <ListSkeleton rows={6} />
          </li>
        ) : null}
        {!loading && !visibleConversations.length ? (
          <li className="chatListEmptyItem">
            <DialogsEmptyState
              filterActive={
                resolveInboxEmptyKind({
                  loading,
                  conversationCount: conversations.length,
                  visibleCount: visibleConversations.length,
                  channelFilter,
                  search,
                  filtersActive: inboxFiltersActive(filters)
                }) !== "activate"
              }
              isAdmin={isAdmin}
              onResetFilter={() => {
                onChannelFilterChange("all");
                if (onClearSearchAndFilters) {
                  onClearSearchAndFilters();
                  return;
                }
                onResetFilters();
              }}
              onOpenIntegrations={() => onOpenIntegrations?.()}
            />
          </li>
        ) : null}
        {!loading
          ? visibleConversations.map((conversation) => (
              <ConversationListItem
                key={conversation.id}
                conversation={conversation}
                isActive={conversation.id === selectedConversation}
                noMessages={ui.noMessages}
                customerCardLabel={ui.customerCard}
                onSelectConversation={onSelectConversation}
                onOpenCustomerCard={onOpenCustomerCard}
              />
            ))
          : null}
      </ul>
    </aside>
  );
}
