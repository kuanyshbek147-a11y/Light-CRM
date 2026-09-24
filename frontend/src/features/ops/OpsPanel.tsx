import { useCallback, useEffect, useState } from "react";
import { formatChannelLabel } from "../../shared/i18n/glossary";
import { formatRuDateTime } from "../../shared/lib/dateTime";
import {
  createOpsBackup,
  loadOpsQueue,
  saveOpsAlertChat,
  type QueueItem
} from "./api";

type Props = {
  authToken: string;
  onToast?: (message: string, kind: "success" | "error") => void;
  onOpenConversation?: (conversationId: string) => void;
};

export function OpsPanel({ authToken, onToast, onOpenConversation }: Props) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [alertChat, setAlertChat] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setQueue(await loadOpsQueue(authToken));
  }, [authToken]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function runBackup(): Promise<void> {
    setBusy(true);
    try {
      const result = await createOpsBackup(authToken);
      if (!result) {
        onToast?.("Бэкап не создан (нужны права admin)", "error");
        return;
      }
      onToast?.(`Бэкап: ${result.fileName} (${Math.round(result.bytes / 1024)} KB)`, "success");
    } finally {
      setBusy(false);
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
          <div className="sidebarHint">Очередь без ответственного, бэкапы БД, алерты.</div>
        </div>
      </div>

      <div className="knowledgeFormCard" style={{ marginBottom: 20 }}>
        <div className="scriptPanelTitle">Копия базы и уведомления</div>
        <div className="scriptForm">
          <button type="button" className="primaryButton" disabled={busy} onClick={() => void runBackup()}>
            Сделать копию сейчас
          </button>
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
          Сюда же приходят уведомления о новых заявках со страницы (нужен бот Telegram компании).
          Платный Postgres включают вручную в панели хостинга. Копии лежат в /backups на сервере.
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
