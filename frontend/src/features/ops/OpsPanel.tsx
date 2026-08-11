import { useCallback, useEffect, useState } from "react";
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
        <div className="scriptPanelTitle">Бэкап и алерты</div>
        <div className="scriptForm">
          <button type="button" className="primaryButton" disabled={busy} onClick={() => void runBackup()}>
            Сделать бэкап сейчас
          </button>
          <input
            className="filterInput"
            placeholder="Telegram chat id для алертов"
            value={alertChat}
            onChange={(event) => setAlertChat(event.target.value)}
          />
          <button type="button" className="dialogActionBtn" disabled={busy} onClick={() => void saveAlert()}>
            Сохранить алерт-чат
          </button>
        </div>
        <div className="sidebarHint" style={{ marginTop: 8 }}>
          Платный Postgres на Render — вручную в Dashboard (Upgrade). Бэкапы сохраняются в /backups на
          сервере.
        </div>
      </div>

      <div className="scriptPanelTitle">Очередь без назначения (SLA)</div>
      {queue.length ? (
        queue.map((item) => (
          <div key={item.id} className="taskCard">
            <div className="taskCardTitle">
              {item.contact_name}
              {item.sla_overdue ? " · SLA просрочен" : ""}
            </div>
            <div className="taskCardMeta">
              {item.channel} · {item.phone || "—"} ·{" "}
              {item.first_response_due_at
                ? `due ${new Date(item.first_response_due_at).toLocaleString()}`
                : "без дедлайна"}
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
