import { useCallback, useEffect, useState } from "react";
import {
  loadAutoReplySettings,
  saveAutoReplySettings,
  type AutoReplySettings
} from "./api";

type Props = {
  authToken: string;
};

export function AutoReplyConnect({ authToken }: Props) {
  const [settings, setSettings] = useState<AutoReplySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<"rules" | "ai">("rules");
  const [firstOnly, setFirstOnly] = useState(true);
  const [defaultText, setDefaultText] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError("");
    try {
      const next = await loadAutoReplySettings(authToken);
      setSettings(next);
      setEnabled(next.enabled);
      setMode(next.mode === "ai" ? "ai" : "rules");
      setFirstOnly(next.firstOnly);
      setDefaultText(next.defaultText);
      setSystemPrompt(next.systemPrompt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить автоответчик");
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onSave(): Promise<void> {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const next = await saveAutoReplySettings(authToken, {
        enabled,
        mode,
        firstOnly,
        defaultText,
        systemPrompt
      });
      setSettings(next);
      setSuccess(next.enabled ? "Автоответчик включён" : "Автоответчик выключен");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="instagramConnectCard">
      <div className="integrationsPanelHeader">
        <div>
          <h3 className="integrationsPanelTitle">Автоответчик</h3>
          <p className="integrationsHint">
            Автоматически отвечает на входящие в WhatsApp, Instagram, Telegram и чат на сайте.
            Режим «Скрипты» подбирает ответ из базы быстрых ответов; «ИИ» — если задан{" "}
            <code>OPENAI_API_KEY</code> на сервере.
          </p>
        </div>
        <span className={`integrationStatusPill ${settings?.enabled ? "ok" : ""}`}>
          {loading ? "Загрузка..." : settings?.enabled ? "Вкл" : "Выкл"}
        </span>
      </div>

      <label className="loginField" style={{ marginTop: 12 }}>
        <span className="loginFieldLabel">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />{" "}
          Включить автоответы
        </span>
      </label>

      <label className="loginField">
        <span className="loginFieldLabel">Режим</span>
        <select
          className="loginInput loginInputModern"
          value={mode}
          onChange={(event) => setMode(event.target.value === "ai" ? "ai" : "rules")}
        >
          <option value="rules">Скрипты / правила</option>
          <option value="ai">ИИ{settings?.aiConfigured ? "" : " (ключ не задан — будет fallback)"}</option>
        </select>
      </label>

      <label className="loginField">
        <span className="loginFieldLabel">
          <input
            type="checkbox"
            checked={firstOnly}
            onChange={(event) => setFirstOnly(event.target.checked)}
          />{" "}
          Только на первое сообщение в диалоге
        </span>
      </label>

      <label className="loginField">
        <span className="loginFieldLabel">Текст по умолчанию</span>
        <textarea
          className="loginInput loginInputModern"
          rows={3}
          value={defaultText}
          onChange={(event) => setDefaultText(event.target.value)}
        />
      </label>

      {mode === "ai" ? (
        <label className="loginField">
          <span className="loginFieldLabel">Системный промпт ИИ</span>
          <textarea
            className="loginInput loginInputModern"
            rows={4}
            value={systemPrompt}
            onChange={(event) => setSystemPrompt(event.target.value)}
          />
        </label>
      ) : null}

      {error ? <p className="integrationsError">{error}</p> : null}
      {success ? <p className="integrationsSuccess">{success}</p> : null}

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          type="button"
          className="landingButton landingButtonModern"
          disabled={saving || loading}
          onClick={() => void onSave()}
        >
          {saving ? "Сохранение..." : "Сохранить"}
        </button>
        <button type="button" className="pipelineToggleBtn" disabled={loading} onClick={() => void refresh()}>
          Обновить
        </button>
      </div>
    </div>
  );
}
