import { useCallback, useEffect, useState } from "react";
import { formatChannelLabel } from "../../shared/i18n/glossary";
import { formatRuDateTime } from "../../shared/lib/dateTime";
import {
  loadOpsQueue,
  loadOwnerDigest,
  saveOpsAlertChat,
  saveOwnerDigest,
  sendTestOwnerDigest,
  type OwnerDigestSettings,
  type QueueItem
} from "./api";

const DIGEST_HOURS = Array.from({ length: 24 }, (_, hour) => hour);

type Props = {
  authToken: string;
  onToast?: (message: string, kind: "success" | "error") => void;
  onOpenConversation?: (conversationId: string) => void;
};

export function OpsPanel({ authToken, onToast, onOpenConversation }: Props) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [alertChat, setAlertChat] = useState("");
  const [busy, setBusy] = useState(false);
  const [digest, setDigest] = useState<OwnerDigestSettings | null>(null);
  const [digestBusy, setDigestBusy] = useState(false);

  const refresh = useCallback(async () => {
    setQueue(await loadOpsQueue(authToken));
  }, [authToken]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const refreshDigest = useCallback(async () => {
    setDigest(await loadOwnerDigest(authToken));
  }, [authToken]);

  useEffect(() => {
    void refreshDigest();
  }, [refreshDigest]);

  async function updateDigest(input: { enabled?: boolean; hour?: number }): Promise<void> {
    setDigestBusy(true);
    try {
      const next = await saveOwnerDigest(authToken, input);
      if (next) {
        setDigest(next);
      } else {
        onToast?.("Не удалось сохранить настройки сводки", "error");
      }
    } finally {
      setDigestBusy(false);
    }
  }

  async function sendTestDigest(): Promise<void> {
    setDigestBusy(true);
    try {
      const ok = await sendTestOwnerDigest(authToken);
      onToast?.(
        ok ? "Сводка за сегодня отправлена в Telegram" : "Сначала подключите Telegram для сводки",
        ok ? "success" : "error"
      );
    } finally {
      setDigestBusy(false);
    }
  }

  async function saveAlert(): Promise<void> {
    setBusy(true);
    try {
      const ok = await saveOpsAlertChat(authToken, alertChat.trim());
      onToast?.(ok ? "Алерт-чат сохранён" : "Не удалось сохранить", ok ? "success" : "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="knowledgePage card">
      <div className="railHeader">
        <div>
          <div className="sidebarTitle">Операции</div>
          <div className="sidebarHint">Уведомления в Telegram и диалоги без оператора.</div>
        </div>
      </div>

      {digest ? (
        <div className="knowledgeFormCard" style={{ marginBottom: 20 }}>
          <div className="scriptPanelTitle">Вечерняя сводка владельцу</div>
          <div className="sidebarHint" style={{ marginBottom: 12 }}>
            Каждый вечер в Telegram: сколько клиентов написали, скольким ответили, за сколько минут и кто
            до сих пор ждёт ответа.
          </div>
          {digest.chatConnected ? (
            <div className="sidebarHint" style={{ marginBottom: 12 }}>
              ✅ Telegram подключён. Чтобы сводка приходила другому человеку, пусть он откроет ссылку ниже.
            </div>
          ) : null}
          <div className="scriptForm">
            {digest.connectUrl ? (
              <a
                className={`dialogActionBtn${digest.chatConnected ? "" : " primary"}`}
                href={digest.connectUrl}
                target="_blank"
                rel="noreferrer"
                onClick={() => window.setTimeout(() => void refreshDigest(), 15000)}
              >
                {digest.chatConnected ? "Подключить другой Telegram" : "Подключить Telegram"}
              </a>
            ) : (
              <div className="sidebarHint">
                Сначала подключите Telegram-бота компании в разделе «Каналы»: сводку присылает он.
              </div>
            )}
            <label className="loginField">
              <span className="loginFieldLabel">
                <input
                  type="checkbox"
                  checked={digest.enabled}
                  disabled={digestBusy}
                  onChange={(event) => void updateDigest({ enabled: event.target.checked })}
                />{" "}
                Присылать сводку каждый день
              </span>
            </label>
            <label className="loginField">
              <span className="loginFieldLabel">Время отправки</span>
              <select
                className="filterInput"
                value={digest.hour}
                disabled={digestBusy || !digest.enabled}
                onChange={(event) => void updateDigest({ hour: Number(event.target.value) })}
              >
                {DIGEST_HOURS.map((hour) => (
                  <option key={hour} value={hour}>
                    {`${String(hour).padStart(2, "0")}:00`}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="dialogActionBtn"
              disabled={digestBusy || !digest.chatConnected}
              onClick={() => void sendTestDigest()}
            >
              Отправить сводку сейчас
            </button>
          </div>
        </div>
      ) : null}

      <div className="knowledgeFormCard" style={{ marginBottom: 20 }}>
        <div className="scriptPanelTitle">Уведомления в Telegram</div>
        <div className="scriptForm">
          <input
            className="filterInput"
            placeholder="Номер чата Telegram для уведомлений"
            value={alertChat}
            onChange={(event) => setAlertChat(event.target.value)}
          />
          <button type="button" className="dialogActionBtn" disabled={busy} onClick={() => void saveAlert()}>
            Сохранить чат для уведомлений
          </button>
        </div>
        <div className="sidebarHint" style={{ marginTop: 8 }}>
          В этот чат Telegram будут приходить уведомления о сбоях, новых заявках с сайта и вечерняя
          сводка (нужен Telegram-бот компании).
        </div>
      </div>

      <div className="scriptPanelTitle">Очередь без оператора (срок ответа)</div>
      {queue.length ? (
        queue.map((item) => (
          <div key={item.id} className="taskCard">
            <div className="taskCardTitle">
              {item.contact_name}
              {item.sla_overdue ? " · срок ответа просрочен" : ""}
            </div>
            <div className="taskCardMeta">
              {formatChannelLabel(item.channel)} · {item.phone || "—"} ·{" "}
              {item.first_response_due_at
                ? `срок ответа ${formatRuDateTime(item.first_response_due_at)}`
                : "без срока"}
            </div>
            <button
              type="button"
              className="dialogActionBtn primary"
              style={{ marginTop: 10 }}
              onClick={() => onOpenConversation?.(item.id)}
            >
              Открыть чат
            </button>
          </div>
        ))
      ) : (
        <div className="emptyScriptState">Неназначенных чатов нет</div>
      )}
    </section>
  );
}
