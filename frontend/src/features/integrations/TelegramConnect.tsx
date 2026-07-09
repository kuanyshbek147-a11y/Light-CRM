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
  const [showTokenForm, setShowTokenForm] = useState(false);

  const connected = Boolean(status?.connected);

  const refreshStatus = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError("");
    try {
      const next = await loadTelegramStatus(authToken);
      setStatus(next);
      if (!next.connected) {
        setShowTokenForm(true);
      }
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
    if (!botToken.trim()) {
      setError("Вставьте токен бота от @BotFather");
      setShowTokenForm(true);
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const result = await connectTelegram(authToken, { botToken: botToken.trim() });
      if (!result.ok) {
        throw new Error(result.error || "Не удалось подключить Telegram");
      }
      setBotToken("");
      setShowTokenForm(false);
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
      setShowTokenForm(true);
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
            Подключите или отключите бота прямо здесь. Сообщения появятся в диалогах как канал Telegram.
          </p>
        </div>
        <span className={`integrationStatusPill ${connected ? "ok" : ""}`}>
          {loading ? "Загрузка..." : connected ? "Подключён" : "Не подключён"}
        </span>
      </div>

      {connected ? (
        <div className="instagramStatusGrid">
          <div>
            <div className="sidebarHint">Бот</div>
            <div className="scriptCardTitle">
              {status?.botUsername ? `@${status.botUsername}` : "—"}
            </div>
          </div>
          <div>
            <div className="sidebarHint">Источник</div>
            <div className="scriptCardTitle">{status?.source || "—"}</div>
          </div>
          <div>
            <div className="sidebarHint">Webhook</div>
            <div className="scriptCardTitle">{status?.webhookUrl || status?.webhookPath || "—"}</div>
          </div>
        </div>
      ) : null}

      <div className="instagramConnectActions">
        {connected ? (
          <button
            type="button"
            className="secondaryButton"
            disabled={saving || loading}
            onClick={() => void onDisconnect()}
          >
            {saving ? "Отключение..." : "Отключить Telegram"}
          </button>
        ) : (
          <button
            type="button"
            className="primaryButton"
            disabled={saving || loading || (!showTokenForm && !botToken.trim())}
            onClick={() => {
              if (!showTokenForm) {
                setShowTokenForm(true);
                return;
              }
              void onConnect();
            }}
          >
            {saving ? "Подключение..." : "Подключить Telegram"}
          </button>
        )}

        {connected ? (
          <button
            type="button"
            className="primaryButton"
            disabled={saving || loading}
            onClick={() => {
              setShowTokenForm(true);
              setSuccess("");
              setError("");
            }}
          >
            Переподключить
          </button>
        ) : null}

        <button type="button" className="secondaryButton" disabled={loading} onClick={() => void refreshStatus()}>
          Обновить статус
        </button>
      </div>

      {showTokenForm ? (
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
              {saving ? "Сохранение..." : connected ? "Сохранить и подключить" : "Подключить Telegram"}
            </button>
            {connected ? (
              <button
                type="button"
                className="textButton"
                disabled={saving}
                onClick={() => {
                  setShowTokenForm(false);
                  setBotToken("");
                }}
              >
                Отмена
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? <div className="integrationsError">{error}</div> : null}
      {success ? <div className="integrationsSuccess">{success}</div> : null}
      {status?.lastError ? <div className="integrationsError">{status.lastError}</div> : null}

      <div className="integrationsHint">
        {connected
          ? "Нажмите «Отключить Telegram», чтобы остановить приём сообщений. «Переподключить» — чтобы сменить токен бота."
          : "1) Создайте бота в @BotFather → 2) Вставьте токен → 3) Нажмите «Подключить Telegram»."}
      </div>
    </div>
  );
}
