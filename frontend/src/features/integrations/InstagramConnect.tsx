import { useEffect, useState } from "react";
import {
  connectInstagram,
  disconnectInstagram,
  loadInstagramStatus,
  type InstagramStatus
} from "./api";

type Props = {
  authToken: string;
};

export function InstagramConnect({ authToken }: Props) {
  const [status, setStatus] = useState<InstagramStatus | null>(null);
  const [pageId, setPageId] = useState("");
  const [pageAccessToken, setPageAccessToken] = useState("");
  const [igUserId, setIgUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function refreshStatus(): Promise<void> {
    setLoading(true);
    setError("");
    try {
      const next = await loadInstagramStatus(authToken);
      setStatus(next);
      if (next.pageId) {
        setPageId(next.pageId);
      }
      if (next.igUserId) {
        setIgUserId(next.igUserId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить статус Instagram");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshStatus();
  }, [authToken]);

  async function onConnect(): Promise<void> {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const result = await connectInstagram(authToken, {
        pageId,
        pageAccessToken,
        igUserId: igUserId || undefined
      });
      if (!result.ok) {
        throw new Error(result.error || "Не удалось подключить Instagram");
      }
      setPageAccessToken("");
      setSuccess(
        result.igUsername
          ? `Instagram @${result.igUsername} подключён`
          : "Instagram подключён"
      );
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка подключения Instagram");
    } finally {
      setSaving(false);
    }
  }

  async function onDisconnect(): Promise<void> {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await disconnectInstagram(authToken);
      setSuccess("Instagram отключён");
      setPageId("");
      setIgUserId("");
      setPageAccessToken("");
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка отключения Instagram");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="instagramConnectCard">
      <div className="integrationsPanelHeader">
        <div>
          <h3 className="integrationsPanelTitle">Instagram Direct</h3>
          <p className="integrationsHint">
            Подключите Instagram Business через Facebook Page Access Token. Webhook:
            {" "}
            <code>/api/integrations/instagram/webhook</code>
          </p>
        </div>
        <span className={`integrationStatusPill ${status?.connected ? "ok" : ""}`}>
          {loading ? "Загрузка..." : status?.connected ? "Подключён" : "Не подключён"}
        </span>
      </div>

      {status?.connected ? (
        <div className="instagramStatusGrid">
          <div>
            <div className="sidebarHint">Page ID</div>
            <div className="scriptCardTitle">{status.pageId || "—"}</div>
          </div>
          <div>
            <div className="sidebarHint">IG User ID</div>
            <div className="scriptCardTitle">{status.igUserId || "—"}</div>
          </div>
          <div>
            <div className="sidebarHint">Источник</div>
            <div className="scriptCardTitle">{status.source || "—"}</div>
          </div>
        </div>
      ) : null}

      <div className="instagramConnectForm">
        <input
          className="filterInput"
          placeholder="Facebook Page ID"
          value={pageId}
          onChange={(event) => setPageId(event.target.value)}
        />
        <input
          className="filterInput"
          placeholder="Page Access Token"
          value={pageAccessToken}
          onChange={(event) => setPageAccessToken(event.target.value)}
          type="password"
          autoComplete="off"
        />
        <input
          className="filterInput"
          placeholder="Instagram User ID (необязательно)"
          value={igUserId}
          onChange={(event) => setIgUserId(event.target.value)}
        />
        <div className="instagramConnectActions">
          <button
            type="button"
            className="primaryButton"
            disabled={saving || !pageId.trim() || !pageAccessToken.trim()}
            onClick={() => void onConnect()}
          >
            {saving ? "Сохранение..." : "Подключить Instagram"}
          </button>
          {status?.connected ? (
            <button
              type="button"
              className="secondaryButton"
              disabled={saving}
              onClick={() => void onDisconnect()}
            >
              Отключить
            </button>
          ) : null}
          <button type="button" className="secondaryButton" disabled={loading} onClick={() => void refreshStatus()}>
            Обновить статус
          </button>
        </div>
      </div>

      {error ? <div className="integrationsError">{error}</div> : null}
      {success ? <div className="integrationsSuccess">{success}</div> : null}

      <div className="integrationsHint">
        В Meta Developer Console добавьте продукт Instagram / Messenger, подпишите webhook на
        {" "}
        <code>messages</code>, verify token — тот же, что у WhatsApp
        {status?.verifyToken ? ` (${status.verifyToken})` : ""}.
      </div>
    </div>
  );
}
