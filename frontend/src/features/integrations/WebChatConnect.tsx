import { useCallback, useEffect, useMemo, useState } from "react";
import {
  connectWebChat,
  disconnectWebChat,
  loadWebChatStatus,
  type WebChatStatus
} from "./api";

type Props = {
  authToken: string;
};

export function WebChatConnect({ authToken }: Props) {
  const [status, setStatus] = useState<WebChatStatus | null>(null);
  const [title, setTitle] = useState("Онлайн-чат");
  const [greeting, setGreeting] = useState("Здравствуйте! Напишите нам — ответим в ближайшее время.");
  const [primaryColor, setPrimaryColor] = useState("#5b5ce9");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [copied, setCopied] = useState(false);

  const connected = Boolean(status?.connected);

  const refreshStatus = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError("");
    try {
      const next = await loadWebChatStatus(authToken);
      setStatus(next);
      setTitle(next.title || "Онлайн-чат");
      setGreeting(next.greeting || "Здравствуйте! Напишите нам — ответим в ближайшее время.");
      setPrimaryColor(next.primaryColor || "#5b5ce9");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить статус виджета");
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const embedSnippet = useMemo(() => {
    if (status?.embedSnippet) {
      return status.embedSnippet;
    }
    if (status?.widgetId && status.widgetScriptUrl) {
      return `<script src="${status.widgetScriptUrl}" data-widget-id="${status.widgetId}" async></script>`;
    }
    return "";
  }, [status]);

  async function onConnect(): Promise<void> {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const result = await connectWebChat(authToken, {
        title: title.trim(),
        greeting: greeting.trim(),
        primaryColor: primaryColor.trim()
      });
      if (!result.ok) {
        throw new Error(result.error || "Не удалось включить виджет");
      }
      setSuccess("Виджет чата включён. Скопируйте код и вставьте на сайт.");
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка включения виджета");
    } finally {
      setSaving(false);
    }
  }

  async function onDisconnect(): Promise<void> {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await disconnectWebChat(authToken);
      setSuccess("Виджет отключён. Код на сайте перестанет работать.");
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка отключения виджета");
    } finally {
      setSaving(false);
    }
  }

  async function copySnippet(): Promise<void> {
    if (!embedSnippet) {
      return;
    }
    try {
      await navigator.clipboard.writeText(embedSnippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Не удалось скопировать. Выделите код вручную.");
    }
  }

  return (
    <div className="instagramConnectCard">
      <div className="integrationsPanelHeader">
        <div>
          <h3 className="integrationsPanelTitle">Чат на сайте</h3>
          <p className="integrationsHint">
            Виджет справа внизу на сайте клиента. Сообщения приходят в диалоги как канал «Сайт».
          </p>
        </div>
        <span className={`integrationStatusPill ${connected ? "ok" : ""}`}>
          {loading ? "Загрузка..." : connected ? "Подключён" : "Не подключён"}
        </span>
      </div>

      {connected ? (
        <div className="instagramStatusGrid">
          <div>
            <div className="sidebarHint">Widget ID</div>
            <div className="scriptCardTitle">{status?.widgetId || "—"}</div>
          </div>
          <div>
            <div className="sidebarHint">Заголовок</div>
            <div className="scriptCardTitle">{status?.title || "—"}</div>
          </div>
          <div>
            <div className="sidebarHint">Цвет кнопки</div>
            <div className="scriptCardTitle">{status?.primaryColor || "—"}</div>
          </div>
        </div>
      ) : null}

      <div className="instagramConnectForm">
        <input
          className="filterInput"
          placeholder="Заголовок виджета"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <textarea
          className="scriptTextarea"
          placeholder="Приветствие"
          value={greeting}
          onChange={(event) => setGreeting(event.target.value)}
          rows={3}
        />
        <input
          className="filterInput"
          placeholder="#5b5ce9"
          value={primaryColor}
          onChange={(event) => setPrimaryColor(event.target.value)}
        />
      </div>

      <div className="instagramConnectActions">
        {connected ? (
          <>
            <button
              type="button"
              className="primaryButton"
              disabled={saving || loading}
              onClick={() => void onConnect()}
            >
              {saving ? "Сохранение..." : "Сохранить настройки"}
            </button>
            <button
              type="button"
              className="secondaryButton"
              disabled={saving || loading}
              onClick={() => void onDisconnect()}
            >
              Отключить виджет
            </button>
          </>
        ) : (
          <button
            type="button"
            className="primaryButton"
            disabled={saving || loading}
            onClick={() => void onConnect()}
          >
            {saving ? "Подключение..." : "Включить виджет"}
          </button>
        )}
        <button type="button" className="secondaryButton" disabled={loading} onClick={() => void refreshStatus()}>
          Обновить статус
        </button>
      </div>

      {connected && embedSnippet ? (
        <div className="webchatEmbedBlock">
          <div className="sidebarHint">Код для вставки на сайт (перед &lt;/body&gt;)</div>
          <textarea className="scriptTextarea webchatEmbedCode" readOnly value={embedSnippet} rows={3} />
          <div className="instagramConnectActions">
            <button type="button" className="primaryButton" onClick={() => void copySnippet()}>
              {copied ? "Скопировано" : "Скопировать код"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? <div className="integrationsError">{error}</div> : null}
      {success ? <div className="integrationsSuccess">{success}</div> : null}

      <div className="integrationsHint">
        После включения вставьте код на сайт клиента. Кнопка чата появится справа внизу; переписка
        откроется в разделе «Диалоги» с меткой «Сайт».
      </div>
    </div>
  );
}
