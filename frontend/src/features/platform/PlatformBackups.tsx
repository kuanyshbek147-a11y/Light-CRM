import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "../../shared/config/api";

type Backup = { fileName: string; bytes: number; modifiedAt: string };

/**
 * Копии всей базы (все компании) — только в панели супер-админа.
 * Файл скачивается авторизованным запросом: публичной ссылки на копию больше нет.
 */
export function PlatformBackups({ authToken }: { authToken: string }): JSX.Element {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const headers = { Authorization: `Bearer ${authToken}` };

  const load = useCallback(async () => {
    const response = await fetch(`${API_BASE_URL}/platform/backups`, { headers: { Authorization: `Bearer ${authToken}` } });
    if (response.ok) {
      setBackups((await response.json()) as Backup[]);
    }
  }, [authToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(): Promise<void> {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`${API_BASE_URL}/platform/backups`, { method: "POST", headers });
      setMessage(response.ok ? "Копия создана." : "Не удалось создать копию.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function download(fileName: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/platform/backups/${encodeURIComponent(fileName)}`, { headers });
    if (!response.ok) {
      setMessage("Файл не найден: после перезапуска сервера на Render копии с диска пропадают.");
      return;
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="card" style={{ padding: 16, display: "grid", gap: 10 }}>
      <div className="scriptPanelTitle">Резервные копии базы</div>
      <div className="sidebarHint">
        Копия содержит данные всех компаний. Храните скачанный файл в надёжном месте. На бесплатном Render
        файлы на диске удаляются при перезапуске — скачивайте копию сразу.
      </div>
      <div>
        <button type="button" className="primaryButton" disabled={busy} onClick={() => void create()}>
          {busy ? "Создаём…" : "Сделать копию сейчас"}
        </button>
      </div>
      {message ? <div className="sidebarHint">{message}</div> : null}
      {backups.map((backup) => (
        <div key={backup.fileName} className="taskCardMeta" style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span>
            {new Date(backup.modifiedAt).toLocaleString("ru-RU")} · {Math.max(1, Math.round(backup.bytes / 1024))} КБ
          </span>
          <button type="button" className="textButton" onClick={() => void download(backup.fileName)}>
            Скачать
          </button>
        </div>
      ))}
    </div>
  );
}
