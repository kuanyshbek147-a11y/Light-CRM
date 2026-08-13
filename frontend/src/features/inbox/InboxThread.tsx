import { useRef } from "react";
import type { DragEvent, RefObject } from "react";
import type { Conversation, KnowledgeArticle, Message, MessageScript } from "./model/types";
import { MessageAudio } from "./ui/MessageAudio";

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
  insertArticleText: string;
  general: string;
  emojis: string;
  typeMessage: string;
  attachFile: string;
  recordAudio: string;
  voiceRecordingAppOnly: string;
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
  token: string | null;
  voiceRecordingAvailable: boolean;
  voiceRecordMode: "tap" | "hold";
  recordingSendReady: boolean;
  isNativeApp: boolean;
  onOpenCustomerCard: () => void;
  onShareToTeam?: () => void;
  shareToTeamLabel?: string;
  onCallPhone?: () => void;
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
  onInsertKnowledgeArticleText: (article: KnowledgeArticle) => void;
  onToggleEmojiPicker: () => void;
  onMessageBodyChange: (value: string) => void;
  onPickFile: (file: File) => void;
  onPrepareAttach?: () => Promise<boolean>;
  onStartAudioRecording: () => void;
  onStopAndSendAudioRecording: () => void;
  onCancelAudioRecording: () => void;
  onSendMessage: () => void;
  onAppendEmoji: (emoji: string) => void;
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
    token,
    voiceRecordingAvailable,
    voiceRecordMode,
    recordingSendReady,
    isNativeApp,
    onOpenCustomerCard,
    onShareToTeam,
    shareToTeamLabel,
    onCallPhone,
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
    onInsertKnowledgeArticleText,
    onToggleEmojiPicker,
    onMessageBodyChange,
    onPickFile,
    onPrepareAttach,
    onStartAudioRecording,
    onStopAndSendAudioRecording,
    onCancelAudioRecording,
    onSendMessage,
    onAppendEmoji,
    onBack,
    backLabel
  } = props;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const micHoldRef = useRef(false);
  const micHoldStartedAtRef = useRef(0);
  const lastMicTapAtRef = useRef(0);

  const contactInitial = (selectedConversationData?.contact_name || "?").trim().slice(0, 1).toUpperCase();

  function formatMessageTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }

  const hasComposerText = messageBody.trim().length > 0;

  function handleMicTap(event: React.SyntheticEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const now = Date.now();
    if (now - lastMicTapAtRef.current < 350) {
      return;
    }
    lastMicTapAtRef.current = now;
    if (uploadingMedia || recordingAudio) {
      return;
    }
    onStartAudioRecording();
  }

  function handleMicPointerDown(event: React.PointerEvent<HTMLButtonElement>): void {
    if (voiceRecordMode === "tap") {
      return;
    }
    event.preventDefault();
    micHoldRef.current = true;
    micHoldStartedAtRef.current = Date.now();
    event.currentTarget.setPointerCapture(event.pointerId);
    onStartAudioRecording();
  }

  function handleMicPointerUp(event: React.PointerEvent<HTMLButtonElement>): void {
    if (voiceRecordMode === "tap") {
      return;
    }
    if (!micHoldRef.current) {
      return;
    }
    micHoldRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const heldMs = Date.now() - micHoldStartedAtRef.current;
    if (heldMs >= 400) {
      onStopAndSendAudioRecording();
    }
  }

  function handleMicPointerCancel(event: React.PointerEvent<HTMLButtonElement>): void {
    if (voiceRecordMode === "tap") {
      return;
    }
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
          disabled={uploadingMedia || (!isNativeApp && !voiceRecordingAvailable)}
          title={isNativeApp || voiceRecordingAvailable ? ui.recordAudio : ui.voiceRecordingAppOnly}
          aria-label={ui.recordAudio}
          type="button"
          onPointerUp={
            voiceRecordMode === "tap"
              ? handleMicTap
              : voiceRecordMode === "hold"
                ? handleMicPointerUp
                : undefined
          }
          onPointerDown={voiceRecordMode === "hold" ? handleMicPointerDown : undefined}
          onPointerCancel={voiceRecordMode === "hold" ? handleMicPointerCancel : undefined}
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
            <button
              type="button"
              className="threadAvatar clientCardTrigger"
              onClick={onOpenCustomerCard}
              title={ui.customerCard}
              aria-label={ui.customerCard}
            >
              {contactInitial}
            </button>
            <div className="threadContactInfo">
              <button type="button" className="threadContactName clientCardTrigger" onClick={onOpenCustomerCard}>
                {selectedConversationData.contact_name}
                {selectedConversationData.is_group ? <span className="groupBadge">Группа</span> : null}
              </button>
              <div className="threadContactPhone">
                <span className={`channelBadge ${selectedConversationData.channel}`}>
                  {selectedConversationData.channel === "whatsapp"
                    ? "WhatsApp"
                    : selectedConversationData.channel === "telegram"
                      ? "Telegram"
                      : selectedConversationData.channel === "instagram"
                        ? "Instagram"
                        : selectedConversationData.channel === "web"
                          ? "Сайт"
                          : selectedConversationData.channel === "email"
                            ? "Email"
                            : selectedConversationData.channel}
                </span>
                <span>
                  {selectedConversationData.is_group
                    ? "группа"
                    : selectedConversationData.phone || selectedConversationData.channel}
                </span>
              </div>
            </div>
            <div className="threadHeaderActions">
              {onCallPhone ? (
                <button
                  type="button"
                  className="threadIconBtn"
                  title="Позвонить"
                  aria-label="Позвонить"
                  onClick={onCallPhone}
                >
                  ☎
                </button>
              ) : null}
              {onShareToTeam ? (
                <button
                  type="button"
                  className="threadIconBtn"
                  title={shareToTeamLabel || "Передать в Команду"}
                  aria-label={shareToTeamLabel || "Передать в Команду"}
                  onClick={onShareToTeam}
                >
                  ⇄
                </button>
              ) : null}
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
              <button type="button" className="threadName clientCardTrigger" onClick={onOpenCustomerCard}>
                {selectedConversationData.contact_name}
                {selectedConversationData.is_group ? <span className="groupBadge">Группа</span> : null}
              </button>
              <div className="threadMeta">
                <span className={`channelBadge ${selectedConversationData.channel}`}>
                  {selectedConversationData.channel === "whatsapp"
                    ? "WhatsApp"
                    : selectedConversationData.channel === "telegram"
                      ? "Telegram"
                      : selectedConversationData.channel === "instagram"
                        ? "Instagram"
                        : selectedConversationData.channel === "web"
                          ? "Сайт"
                          : selectedConversationData.channel === "email"
                            ? "Email"
                            : selectedConversationData.channel}
                </span>
                <span>
                  {selectedConversationData.is_group
                    ? "группа"
                    : selectedConversationData.phone || ""}
                </span>
              </div>
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
                {message.attachment_type === "audio" && (message.attachment_url || message.meta_media_id) ? (
                  <MessageAudio
                    metaMediaId={message.meta_media_id}
                    attachmentUrl={message.attachment_url}
                    attachmentName={message.attachment_name}
                    getMediaUrl={getMediaUrl}
                    token={token}
                  />
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
            {onShareToTeam ? (
              <button type="button" className="quickChip outline" onClick={onShareToTeam}>
                {shareToTeamLabel || "В Команду"}
              </button>
            ) : null}
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
                        onClick={() => {
                          const link = (article.share_url || article.url || "").trim();
                          const title = article.title.trim();
                          onSelectKnowledgeArticle(
                            link
                              ? `Инструкция: «${title}»\n\nОткройте по ссылке:\n${link}`
                              : title
                          );
                        }}
                      >
                        <span className="scriptCardTop">
                          <span className="scriptCardTitle">
                            {article.is_pinned ? "★ " : ""}
                            {article.title}
                          </span>
                          <span className="scriptBadge">{article.category || ui.general}</span>
                        </span>
                        <span className="scriptCardBody">
                          {article.summary || article.body || article.share_url || article.url}
                        </span>
                      </button>
                      <div className="scriptCardActions">
                        <button type="button" className="textButton" onClick={() => onInsertKnowledgeArticleText(article)}>
                          {ui.insertArticleText}
                        </button>
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
                  disabled={uploadingMedia || !recordingSendReady}
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
