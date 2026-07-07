import { useRef, useState } from "react";
import type { DragEvent, RefObject } from "react";
import type { Conversation, KnowledgeArticle, Message, MessageScript } from "./model/types";

type InboxThreadUi = {
  replyBox: string;
  customerCard: string;
  openStatusSuffix: string;
  closedStatusSuffix: string;
  noMatchingScripts: string;
  knowledgeBase: string;
  searchKnowledgeBase: string;
  noKnowledgeArticles: string;
  sendArticleLink: string;
  general: string;
  emojis: string;
  typeMessage: string;
  attachFile: string;
  recordAudio: string;
  recordingAudio: string;
  sendVoice: string;
  cancelRecording: string;
  uploadingMedia: string;
  send: string;
  selectChatHint: string;
  quickScriptHint: string;
  replyScripts: string;
  searchScripts: string;
  noMessages: string;
};

type InboxThreadProps = {
  ui: InboxThreadUi;
  selectedConversationData: Conversation | null;
  messages: Message[];
  isDragOverMessages: boolean;
  messagesContainerRef: RefObject<HTMLDivElement>;
  emojiPickerRef: RefObject<HTMLDivElement>;
  scriptPanelOpen: boolean;
  knowledgeQuickOpen: boolean;
  scriptSearch: string;
  knowledgeSearch: string;
  filteredScripts: MessageScript[];
  filteredKnowledgeArticles: KnowledgeArticle[];
  selectedScriptId: string;
  messageBody: string;
  uploadingMedia: boolean;
  recordingAudio: boolean;
  recordingDurationLabel: string;
  mediaUploadError: string;
  emojiPickerOpen: boolean;
  emojiOptions: readonly string[];
  emojiButtonIcon: string;
  getMediaUrl: (url: string) => string;
  onSetPriority: (conversationId: string, priority: string) => void;
  onOpenCustomerCard: () => void;
  onMessagesDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onMessagesDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onMessagesDrop: (event: DragEvent<HTMLDivElement>) => void;
  onToggleScriptPanel: () => void;
  onToggleKnowledgeQuick: () => void;
  onScriptSearchChange: (value: string) => void;
  onKnowledgeSearchChange: (value: string) => void;
  onSelectScript: (scriptId: string, body: string) => void;
  onSelectKnowledgeArticle: (body: string) => void;
  onSendKnowledgeArticleLink: (article: KnowledgeArticle) => void;
  onToggleEmojiPicker: () => void;
  onMessageBodyChange: (value: string) => void;
  onPickFile: (file: File) => void;
  onPrepareAttach?: () => Promise<boolean>;
  onStartAudioRecording: () => void;
  onStopAndSendAudioRecording: () => void;
  onCancelAudioRecording: () => void;
  onSendMessage: () => void;
  onAppendEmoji: (emoji: string) => void;
  onAcknowledgeSlaEscalation: (conversationId: string) => void;
  onDeferSlaEscalation: (conversationId: string, minutes: number) => void;
  onBack?: () => void;
  backLabel?: string;
};

export function InboxThread(props: InboxThreadProps): JSX.Element {
  const {
    ui,
    selectedConversationData,
    messages,
    isDragOverMessages,
    messagesContainerRef,
    emojiPickerRef,
    scriptPanelOpen,
    knowledgeQuickOpen,
    scriptSearch,
    knowledgeSearch,
    filteredScripts,
    filteredKnowledgeArticles,
    selectedScriptId,
    messageBody,
    uploadingMedia,
    recordingAudio,
    recordingDurationLabel,
    mediaUploadError,
    emojiPickerOpen,
    emojiOptions,
    emojiButtonIcon,
    getMediaUrl,
    onSetPriority,
    onOpenCustomerCard,
    onMessagesDragOver,
    onMessagesDragLeave,
    onMessagesDrop,
    onToggleScriptPanel,
    onToggleKnowledgeQuick,
    onScriptSearchChange,
    onKnowledgeSearchChange,
    onSelectScript,
    onSelectKnowledgeArticle,
    onSendKnowledgeArticleLink,
    onToggleEmojiPicker,
    onMessageBodyChange,
    onPickFile,
    onPrepareAttach,
    onStartAudioRecording,
    onStopAndSendAudioRecording,
    onCancelAudioRecording,
    onSendMessage,
    onAppendEmoji,
    onAcknowledgeSlaEscalation,
    onDeferSlaEscalation,
    onBack,
    backLabel
  } = props;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const micHoldRef = useRef(false);
  const micHoldStartedAtRef = useRef(0);
  const [deferMinutes, setDeferMinutes] = useState<number>(30);

  const contactInitial = (selectedConversationData?.contact_name || "?").trim().slice(0, 1).toUpperCase();

  function formatMessageTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }

  const hasComposerText = messageBody.trim().length > 0;

  function handleMicPointerDown(event: React.PointerEvent<HTMLButtonElement>): void {
    event.preventDefault();
    micHoldRef.current = true;
    micHoldStartedAtRef.current = Date.now();
    event.currentTarget.setPointerCapture(event.pointerId);
    onStartAudioRecording();
  }

  function handleMicPointerUp(event: React.PointerEvent<HTMLButtonElement>): void {
    if (!micHoldRef.current) {
      return;
    }
    micHoldRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const heldMs = Date.now() - micHoldStartedAtRef.current;
    if (heldMs >= 500) {
      onStopAndSendAudioRecording();
    }
  }

  function handleMicPointerCancel(event: React.PointerEvent<HTMLButtonElement>): void {
    if (!micHoldRef.current) {
      return;
    }
    micHoldRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onCancelAudioRecording();
  }

  const attachIcon = uploadingMedia ? (
    <span className="attachSpinner" aria-hidden="true" />
  ) : (
    <svg className="composerWaIcon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M21.44 11.05l-9.19 9.19a5.5 5.5 0 01-7.78-7.78l9.2-9.2a3.5 3.5 0 114.95 4.95l-9.2 9.19a2 2 0 11-2.83-2.83l8.49-8.48"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  const micIcon = (
    <svg className="composerWaIcon composerWaIconMic" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 15a3 3 0 003-3V7a3 3 0 10-6 0v5a3 3 0 003 3z"
        fill="currentColor"
      />
      <path
        d="M19 11a7 7 0 01-14 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M12 18v3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );

  const sendIcon = (
    <svg className="composerWaIcon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 12l14-7-4 14-4-5-6-2z"
        fill="currentColor"
      />
    </svg>
  );

  const composerControls = (
    <div className="composerWaRow">
      <div className="composerWaField" ref={emojiPickerRef}>
        <button type="button" className="composerInlineBtn" title={ui.emojis} aria-label={ui.emojis} onClick={onToggleEmojiPicker}>
          {emojiButtonIcon}
        </button>
        <textarea
          className="composerInput composerTextarea"
          value={messageBody}
          onChange={(event) => onMessageBodyChange(event.target.value)}
          placeholder={ui.typeMessage}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.ctrlKey && !event.shiftKey) {
              event.preventDefault();
              onSendMessage();
            }
          }}
          rows={1}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,audio/*"
          className="hiddenFileInput"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              onPickFile(file);
            }
          }}
        />
        <button
          type="button"
          className="composerInlineBtn composerAttachBtn"
          title={ui.attachFile}
          aria-label={ui.attachFile}
          onClick={() => {
            void (async () => {
              if (onPrepareAttach) {
                const allowed = await onPrepareAttach();
                if (!allowed) {
                  return;
                }
              }
              fileInputRef.current?.click();
            })();
          }}
          disabled={uploadingMedia}
        >
          {attachIcon}
        </button>
        {emojiPickerOpen ? (
          <div className="emojiPicker">
            {emojiOptions.map((emoji) => (
              <button key={emoji} type="button" className="emojiOption" onClick={() => onAppendEmoji(emoji)}>
                {emoji}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {hasComposerText ? (
        <button
          className="sendFab"
          onClick={onSendMessage}
          disabled={uploadingMedia}
          aria-label={ui.send}
          type="button"
        >
          {uploadingMedia ? "…" : sendIcon}
        </button>
      ) : (
        <button
          className="micFab"
          disabled={uploadingMedia}
          title={ui.recordAudio}
          aria-label={ui.recordAudio}
          type="button"
          onPointerDown={handleMicPointerDown}
          onPointerUp={handleMicPointerUp}
          onPointerCancel={handleMicPointerCancel}
          onContextMenu={(event) => event.preventDefault()}
        >
          {micIcon}
        </button>
      )}
    </div>
  );

  return (
    <section className="thread card">
      {selectedConversationData ? (
        <>
          <div className="threadHeaderModern">
            {onBack ? (
              <button type="button" className="threadBackBtn" onClick={onBack} aria-label={backLabel || "Back"}>
                ‹
              </button>
            ) : null}
            <span className="threadAvatar" aria-hidden="true">
              {contactInitial}
            </span>
            <div className="threadContactInfo">
              <div className="threadContactName">
                {selectedConversationData.contact_name}
                {selectedConversationData.is_group ? <span className="groupBadge">Группа</span> : null}
              </div>
              <div className="threadContactPhone">
                {selectedConversationData.is_group ? "WhatsApp группа" : selectedConversationData.phone}
              </div>
            </div>
            <div className="threadHeaderActions">
              <button type="button" className="threadIconBtn" title="Search" aria-label="Search">
                🔍
              </button>
              <button type="button" className="threadIconBtn" onClick={onOpenCustomerCard} title={ui.customerCard} aria-label={ui.customerCard}>
                ⋮
              </button>
            </div>
          </div>

          <div className="threadHeader">
            {onBack ? (
              <button type="button" className="mobileBackButton" onClick={onBack}>
                {backLabel || "←"}
              </button>
            ) : null}
            <div className="threadTitle">
              <div className="threadLabel">{ui.replyBox}</div>
              <div className="threadName">
                {selectedConversationData.contact_name}
                {selectedConversationData.is_group ? <span className="groupBadge">Группа</span> : null}
              </div>
              <div className="threadMeta">
                {selectedConversationData.is_group ? "WhatsApp группа" : selectedConversationData.phone}
              </div>
            </div>
            <div className="threadStatus">
              <select
                className="stageSelect"
                value={selectedConversationData.priority || "normal"}
                onChange={(event) => onSetPriority(selectedConversationData.id, event.target.value)}
                title="Приоритет диалога"
              >
                <option value="low">Низкий</option>
                <option value="normal">Обычный</option>
                <option value="high">Высокий</option>
                <option value="urgent">Срочный</option>
              </select>
              <button
                type="button"
                className="gearButton"
                onClick={onOpenCustomerCard}
                title={ui.customerCard}
              >
                <svg className="customerCardIcon" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
                  <path
                    d="M4.5 19.5C5.6 16.8 8.3 15 12 15s6.4 1.8 7.5 4.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              <span className="statusDot" aria-hidden="true" />
              <span>
                {selectedConversationData.channel}{" "}
                {selectedConversationData.status === "open" ? ui.openStatusSuffix : ui.closedStatusSuffix}
              </span>
              {selectedConversationData.sla_escalated ? (
                <span className="attentionBadge escalated">Эскалация SLA</span>
              ) : null}
              {selectedConversationData.sla_escalated ? (
                <button
                  type="button"
                  className="secondaryButton escalationAckButton"
                  onClick={() => onAcknowledgeSlaEscalation(selectedConversationData.id)}
                >
                  Взять в работу
                </button>
              ) : null}
              {selectedConversationData.sla_escalated ? (
                <>
                  <select
                    className="stageSelect"
                    value={deferMinutes}
                    onChange={(event) => setDeferMinutes(Number(event.target.value))}
                    title="Время отложить SLA"
                  >
                    <option value={15}>15 мин</option>
                    <option value={30}>30 мин</option>
                    <option value={60}>60 мин</option>
                  </select>
                  <button
                    type="button"
                    className="secondaryButton"
                    onClick={() => onDeferSlaEscalation(selectedConversationData.id, deferMinutes)}
                  >
                    Отложить
                  </button>
                </>
              ) : null}
            </div>
          </div>

          <div
            className={`messages ${isDragOverMessages ? "dragOver" : ""}`}
            role="log"
            aria-label="Conversation messages"
            ref={messagesContainerRef}
            onDragOver={onMessagesDragOver}
            onDragLeave={onMessagesDragLeave}
            onDrop={onMessagesDrop}
          >
            {messages.length ? <div className="messagesDateDivider"><span>Today</span></div> : null}
            {messages.map((message) => (
              <div key={message.id} className={`bubble ${message.direction}`}>
                {message.body && !(message.attachment_type === "audio" && message.body === "[Голосовое сообщение]") ? (
                  <div className="bubbleBody">{message.body}</div>
                ) : null}
                {message.attachment_url && message.attachment_type === "image" ? (
                  <a href={getMediaUrl(message.attachment_url)} target="_blank" rel="noreferrer">
                    <img
                      className="bubbleMedia bubbleMediaImage"
                      src={getMediaUrl(message.attachment_url)}
                      alt={message.attachment_name || "image"}
                      loading="lazy"
                    />
                  </a>
                ) : null}
                {message.attachment_url && message.attachment_type === "video" ? (
                  <video className="bubbleMedia bubbleMediaVideo" controls preload="metadata">
                    <source src={getMediaUrl(message.attachment_url)} />
                  </video>
                ) : null}
                {message.attachment_url && message.attachment_type === "audio" ? (
                  <audio className="bubbleMedia bubbleMediaAudio" controls preload="metadata">
                    <source src={getMediaUrl(message.attachment_url)} />
                  </audio>
                ) : null}
                {message.attachment_url && message.attachment_type === "document" ? (
                  <a
                    className="bubbleDocumentLink"
                    href={getMediaUrl(message.attachment_url)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {message.attachment_name || "Скачать документ"}
                  </a>
                ) : null}
                <span className="bubbleTime">
                  {formatMessageTime(message.created_at)}
                  {message.direction === "outgoing" ? <span className="bubbleReadMark"> ✓✓</span> : null}
                </span>
              </div>
            ))}
            {isDragOverMessages ? <div className="dropHint">Перетащите картинку или видео сюда</div> : null}
          </div>

          <div className="quickActionChips">
            <button
              type="button"
              className={`quickChip ${scriptPanelOpen ? "active" : ""}`}
              onClick={onToggleScriptPanel}
            >
              {ui.replyScripts}
            </button>
            <button
              type="button"
              className={`quickChip outline ${knowledgeQuickOpen ? "active" : ""}`}
              onClick={onToggleKnowledgeQuick}
            >
              {ui.knowledgeBase}
            </button>
            <button type="button" className="quickChip outline" onClick={onToggleScriptPanel}>
              Template
            </button>
          </div>

          <div className="scriptPanel">
            <div className="scriptPanelTop">
              <div className="scriptPanelToggle">
                <span className="scriptPanelToggleText">
                  <span className="scriptPanelTitle">{ui.replyScripts}</span>
                  <span className="sidebarHint">{ui.quickScriptHint}</span>
                </span>
              </div>
              <div className="scriptPanelTopActions">
                <button
                  type="button"
                  className={`scriptTopButton scriptTopButtonAccent ${scriptPanelOpen ? "active" : ""}`}
                  onClick={onToggleScriptPanel}
                  title={ui.replyScripts}
                  aria-expanded={scriptPanelOpen}
                >
                  {ui.replyScripts}
                </button>
                <button
                  type="button"
                  className={`scriptTopButton scriptTopButtonPrimary ${knowledgeQuickOpen ? "active" : ""}`}
                  onClick={onToggleKnowledgeQuick}
                  aria-expanded={knowledgeQuickOpen}
                  title={ui.knowledgeBase}
                >
                  {ui.knowledgeBase}
                </button>
              </div>
            </div>

            {scriptPanelOpen ? (
              <>
                <input
                  className="searchInput"
                  placeholder={ui.searchScripts}
                  value={scriptSearch}
                  onChange={(event) => onScriptSearchChange(event.target.value)}
                />
                <div className="scriptScroller">
                  {filteredScripts.map((script) => {
                    const preview = script.body.slice(0, 180);
                    return (
                      <div key={script.id} className="scriptCard">
                        <button
                          type="button"
                          className={`scriptCardMain ${selectedScriptId === script.id ? "active" : ""}`}
                          onClick={() => onSelectScript(script.id, preview)}
                        >
                          <span className="scriptCardTop">
                            <span className="scriptCardTitle">{script.title}</span>
                            <span className="scriptBadge">{script.category || ui.general}</span>
                          </span>
                          <span className="scriptCardBody">{preview}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
                {filteredScripts.length ? null : (
                  <div className="emptyScriptState">{ui.noMatchingScripts}</div>
                )}
              </>
            ) : null}

            {!scriptPanelOpen && knowledgeQuickOpen ? (
              <div className="scriptKnowledgePanel">
                <div className="scriptPanelTitle">{ui.knowledgeBase}</div>
                <input
                  className="searchInput scriptKnowledgeSearch"
                  placeholder={ui.searchKnowledgeBase}
                  value={knowledgeSearch}
                  onChange={(event) => onKnowledgeSearchChange(event.target.value)}
                />
                <div className="scriptScroller">
                  {filteredKnowledgeArticles.map((article) => (
                    <div key={article.id} className="scriptCard">
                      <button
                        type="button"
                        className="scriptCardMain"
                        onClick={() => onSelectKnowledgeArticle(`${article.title}\n${article.url}`)}
                      >
                        <span className="scriptCardTop">
                          <span className="scriptCardTitle">{article.title}</span>
                          <span className="scriptBadge">{article.category || ui.general}</span>
                        </span>
                        <span className="scriptCardBody">{article.summary || article.url}</span>
                      </button>
                      <div className="scriptCardActions">
                        <button type="button" className="textButton" onClick={() => onSendKnowledgeArticleLink(article)}>
                          {ui.sendArticleLink}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {filteredKnowledgeArticles.length ? null : (
                  <div className="emptyScriptState">{ui.noKnowledgeArticles}</div>
                )}
              </div>
            ) : null}
          </div>

          <div className={`composer composerWa ${recordingAudio ? "composerRecording" : ""}`}>
            {recordingAudio ? (
              <div className="recordingBar">
                <span className="recordingDot" aria-hidden="true" />
                <span className="recordingLabel">
                  {ui.recordingAudio} {recordingDurationLabel}
                </span>
                <button type="button" className="secondaryButton recordingCancelButton" onClick={onCancelAudioRecording}>
                  {ui.cancelRecording}
                </button>
                <button
                  type="button"
                  className="primaryButton recordingSendButton"
                  onClick={onStopAndSendAudioRecording}
                  disabled={uploadingMedia}
                >
                  {uploadingMedia ? ui.uploadingMedia : ui.sendVoice}
                </button>
              </div>
            ) : (
              composerControls
            )}
            {mediaUploadError ? <div className="composerError">{mediaUploadError}</div> : null}
          </div>
        </>
      ) : (
        <div className="emptyState">
          <div className="emptyTitle">{ui.replyBox}</div>
          <div className="emptyHint">{ui.selectChatHint}</div>
        </div>
      )}
    </section>
  );
}
