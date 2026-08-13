import { useCallback, useEffect, useRef, useState } from "react";
import {
  createStaffThreadTask,
  loadStaffMembers,
  loadStaffMessages,
  loadStaffThreads,
  markStaffThreadRead,
  openStaffDm,
  sendStaffMessage,
  type StaffMember,
  type StaffMessage,
  type StaffThread
} from "./api";

type Props = {
  authToken: string;
  currentUserId: string;
  onToast?: (message: string, kind: "success" | "error") => void;
  onOpenConversation?: (conversationId: string) => void;
  onThreadsChanged?: (threads: StaffThread[]) => void;
};

export function StaffChatPanel({
  authToken,
  currentUserId,
  onToast,
  onOpenConversation,
  onThreadsChanged
}: Props) {
  const [threads, setThreads] = useState<StaffThread[]>([]);
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState("");
  const [messages, setMessages] = useState<StaffMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskOwnerId, setTaskOwnerId] = useState("");
  const [taskConversationId, setTaskConversationId] = useState("");
  const [peerPickId, setPeerPickId] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const toast = useCallback(
    (message: string, kind: "success" | "error") => {
      onToast?.(message, kind);
    },
    [onToast]
  );

  const refreshThreads = useCallback(async () => {
    const next = await loadStaffThreads(authToken);
    setThreads(next);
    onThreadsChanged?.(next);
    return next;
  }, [authToken, onThreadsChanged]);

  const openThread = useCallback(
    async (threadId: string) => {
      setSelectedThreadId(threadId);
      const rows = await loadStaffMessages(authToken, threadId);
      setMessages(rows);
      await markStaffThreadRead(authToken, threadId);
      const next = await refreshThreads();
      const still = next.find((t) => t.id === threadId);
      if (still) {
        setSelectedThreadId(threadId);
      }
    },
    [authToken, refreshThreads]
  );

  useEffect(() => {
    void (async () => {
      const [nextThreads, nextMembers] = await Promise.all([
        refreshThreads(),
        loadStaffMembers(authToken)
      ]);
      setMembers(nextMembers);
      if (!selectedThreadId) {
        const channel = nextThreads.find((t) => t.kind === "channel") || nextThreads[0];
        if (channel) {
          await openThread(channel.id);
        }
      }
    })();
    // initial load only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, selectedThreadId]);

  // Expose refresh for socket parent via custom event
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as {
        threadId?: string;
        message?: StaffMessage;
      };
      if (!detail?.threadId) return;
      void refreshThreads();
      if (detail.threadId === selectedThreadId && detail.message) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === detail.message?.id)) return prev;
          return [...prev, detail.message as StaffMessage];
        });
        void markStaffThreadRead(authToken, detail.threadId);
      }
    };
    window.addEventListener("staff:message", handler as EventListener);
    return () => window.removeEventListener("staff:message", handler as EventListener);
  }, [authToken, refreshThreads, selectedThreadId]);

  async function handleSend(): Promise<void> {
    if (!selectedThreadId || !draft.trim()) return;
    setBusy(true);
    const sent = await sendStaffMessage(authToken, selectedThreadId, {
      body: draft.trim()
    });
    setBusy(false);
    if (!sent) {
      toast("Не удалось отправить", "error");
      return;
    }
    setDraft("");
    setMessages((prev) => [...prev, sent]);
    await refreshThreads();
  }

  async function handleOpenDm(): Promise<void> {
    if (!peerPickId) {
      toast("Выберите сотрудника", "error");
      return;
    }
    setBusy(true);
    const thread = await openStaffDm(authToken, peerPickId);
    setBusy(false);
    if (!thread) {
      toast("Не удалось открыть чат", "error");
      return;
    }
    setPeerPickId("");
    await refreshThreads();
    await openThread(thread.id);
  }

  async function handleCreateTask(): Promise<void> {
    if (!selectedThreadId) return;
    if (!taskTitle.trim() || !taskOwnerId) {
      toast("Укажите название и исполнителя", "error");
      return;
    }
    setBusy(true);
    const result = await createStaffThreadTask(authToken, selectedThreadId, {
      title: taskTitle.trim(),
      ownerUserId: taskOwnerId,
      conversationId: taskConversationId.trim() || null
    });
    setBusy(false);
    if (!result) {
      toast("Не удалось создать задачу", "error");
      return;
    }
    toast("Задача создана", "success");
    setTaskOpen(false);
    setTaskTitle("");
    setMessages((prev) =>
      prev.some((m) => m.id === result.message.id) ? prev : [...prev, result.message]
    );
    await refreshThreads();
  }

  const selected = threads.find((t) => t.id === selectedThreadId) || null;
  const peers = members.filter((m) => m.id !== currentUserId);

  return (
    <section className="knowledgePage card" style={{ minHeight: 520 }}>
      <div className="railHeader">
        <div>
          <div className="sidebarTitle">Команда</div>
          <div className="sidebarHint">Общий канал и личные чаты сотрудников</div>
        </div>
      </div>

      <div
        className="staffChatLayout"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(200px, 280px) 1fr",
          gap: 16,
          minHeight: 440
        }}
      >
        <div style={{ borderRight: "1px solid rgba(15,23,42,0.08)", paddingRight: 12 }}>
          <div className="scriptForm" style={{ marginBottom: 12 }}>
            <select
              className="filterInput"
              value={peerPickId}
              onChange={(e) => setPeerPickId(e.target.value)}
            >
              <option value="">Написать сотруднику…</option>
              {peers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.full_name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="leftMenuButton"
              disabled={busy || !peerPickId}
              onClick={() => void handleOpenDm()}
            >
              Открыть ЛС
            </button>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            {threads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                className={`leftMenuButton ${selectedThreadId === thread.id ? "active" : ""}`}
                style={{ justifyContent: "space-between", textAlign: "left" }}
                onClick={() => void openThread(thread.id)}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                  {thread.kind === "channel" ? "# " : ""}
                  {thread.title}
                </span>
                {thread.unread_count > 0 ? (
                  <span className="groupBadge">{thread.unread_count}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateRows: "auto 1fr auto", minHeight: 440 }}>
          <div style={{ marginBottom: 10 }}>
            <div className="scriptPanelTitle" style={{ margin: 0 }}>
              {selected ? selected.title : "Выберите чат"}
            </div>
            {selected?.last_message_body ? (
              <div className="sidebarHint">{selected.last_message_body}</div>
            ) : null}
          </div>

          <div
            style={{
              overflowY: "auto",
              padding: "8px 0",
              borderTop: "1px solid rgba(15,23,42,0.06)",
              borderBottom: "1px solid rgba(15,23,42,0.06)",
              marginBottom: 12,
              maxHeight: 360
            }}
          >
            {messages.map((message) => (
              <div
                key={message.id}
                style={{
                  marginBottom: 12,
                  opacity: message.is_system ? 0.85 : 1
                }}
              >
                <div className="sidebarHint" style={{ marginBottom: 2 }}>
                  {message.is_system
                    ? "Система"
                    : message.author_name || "Сотрудник"}{" "}
                  · {new Date(message.created_at).toLocaleString("ru-RU")}
                </div>
                <div style={{ whiteSpace: "pre-wrap", fontStyle: message.is_system ? "italic" : "normal" }}>
                  {message.body}
                </div>
                {message.conversation_id ? (
                  <button
                    type="button"
                    className="leftMenuButton"
                    style={{ marginTop: 6 }}
                    onClick={() => onOpenConversation?.(message.conversation_id as string)}
                  >
                    Открыть диалог клиента
                  </button>
                ) : null}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {selected ? (
            <div className="scriptForm">
              <textarea
                className="filterInput"
                rows={3}
                placeholder="Сообщение коллегам…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button
                  type="button"
                  className="primaryButton"
                  disabled={busy || !draft.trim()}
                  onClick={() => void handleSend()}
                >
                  Отправить
                </button>
                <button
                  type="button"
                  className="leftMenuButton"
                  onClick={() => {
                    setTaskOpen((v) => !v);
                    if (!taskOwnerId && peers[0]) setTaskOwnerId(peers[0].id);
                  }}
                >
                  Задача коллеге
                </button>
              </div>

              {taskOpen ? (
                <div
                  style={{
                    marginTop: 10,
                    paddingTop: 10,
                    borderTop: "1px solid rgba(15,23,42,0.08)",
                    display: "grid",
                    gap: 8
                  }}
                >
                  <input
                    className="filterInput"
                    placeholder="Название задачи"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                  />
                  <select
                    className="filterInput"
                    value={taskOwnerId}
                    onChange={(e) => setTaskOwnerId(e.target.value)}
                  >
                    <option value="">Исполнитель</option>
                    {members.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.full_name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="filterInput"
                    placeholder="ID диалога клиента (необязательно)"
                    value={taskConversationId}
                    onChange={(e) => setTaskConversationId(e.target.value)}
                  />
                  <button
                    type="button"
                    className="primaryButton"
                    disabled={busy}
                    onClick={() => void handleCreateTask()}
                  >
                    Создать задачу
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
