import { useCallback, useEffect, useState } from "react";
import {
  connectTelegram,
  disconnectTelegram,
  loadTelegramStatus,
  type TelegramStatus
} from "./api";

type Props = {
  authToken: string;
};

export function TelegramConnect({ authToken }: Props) {
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [botToken, setBotToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const refreshStatus = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError("");
    try {
      const next = await loadTelegramStatus(authToken);
      setStatus(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить статус Telegram");
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  async function onConnect(): Promise<void> {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const result = await connectTelegram(authToken, { botToken });
      if (!result.ok) {
        throw new Error(result.error || "Не удалось подключить Telegram");
      }
      setBotToken("");
      setSuccess(
        result.botUsername
          ? `Telegram @${result.botUsername} подключён`
          : "Telegram бот подключён"
      );
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка подключения Telegram");
    } finally {
      setSaving(false);
    }
  }

  async function onDisconnect(): Promise<void> {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await disconnectTelegram(authToken);
      setSuccess("Telegram отключён");
      setBotToken("");
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка отключения Telegram");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="instagramConnectCard">
      <div className="integrationsPanelHeader">
        <div>
          <h3 className="integrationsPanelTitle">Telegram Bot</h3>
          <p className="integrationsHint">
            Подключите бота из @BotFather. Сообщения будут приходить в inbox как канал Telegram.
          </p>
        </div>
        <span className={`integrationStatusPill ${status?.connected ? "ok" : ""}`}>
          {loading ? "Загрузка..." : status?.connected ? "Подключён" : "Не подключён"}
        </span>
      </div>

      {status?.connected ? (
        <div className="instagramStatusGrid">
          <div>
            <div className="sidebarHint">Бот</div>
            <div className="scriptCardTitle">
              {status.botUsername ? `@${status.botUsername}` : "—"}
            </div>
          </div>
          <div>
            <div className="sidebarHint">Источник</div>
            <div className="scriptCardTitle">{status.source || "—"}</div>
          </div>
          <div>
            <div className="sidebarHint">Webhook</div>
            <div className="scriptCardTitle">{status.webhookUrl || status.webhookPath || "—"}</div>
          </div>
        </div>
      ) : null}

      {!status?.connected || status.source === "env" ? (
        <div className="instagramConnectForm">
          <input
            className="filterInput"
            placeholder="Токен бота от @BotFather"
            value={botToken}
            onChange={(event) => setBotToken(event.target.value)}
            type="password"
            autoComplete="off"
          />
          <div className="instagramConnectActions">
            <button
              type="button"
              className="primaryButton"
              disabled={saving || !botToken.trim()}
              onClick={() => void onConnect()}
            >
              {saving ? "Подключение..." : "Подключить Telegram"}
            </button>
            <button type="button" className="secondaryButton" disabled={loading} onClick={() => void refreshStatus()}>
              Обновить статус
            </button>
          </div>
        </div>
      ) : (
        <div className="instagramConnectActions">
          <button
            type="button"
            className="secondaryButton"
            disabled={saving}
            onClick={() => void onDisconnect()}
          >
            Отключить
          </button>
          <button type="button" className="secondaryButton" disabled={loading} onClick={() => void refreshStatus()}>
            Обновить статус
          </button>
        </div>
      )}

      {error ? <div className="integrationsError">{error}</div> : null}
      {success ? <div className="integrationsSuccess">{success}</div> : null}
      {status?.lastError ? <div className="integrationsError">{status.lastError}</div> : null}

      <div className="integrationsHint">
        1) Создайте бота в @BotFather → 2) Вставьте токен сюда → 3) Напишите боту в Telegram.
        Webhook: <code>{status?.webhookPath || "/api/integrations/telegram/webhook/..."}</code>
      </div>
    </div>
  );
}
