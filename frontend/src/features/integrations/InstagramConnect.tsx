import { useCallback, useEffect, useState } from "react";
import {
  connectInstagram,
  connectInstagramOAuth,
  disconnectInstagram,
  loadInstagramConnectSetup,
  loadInstagramStatus,
  type InstagramConnectSetup,
  type InstagramStatus
} from "./api";

type Props = {
  authToken: string;
};

const FB_SDK_SRC = "https://connect.facebook.net/en_US/sdk.js";

function ensureFacebookSdk(appId: string, apiVersion: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = (): void => {
      if (!window.FB) {
        reject(new Error("Facebook SDK не загрузился"));
        return;
      }
      window.FB.init({
        appId,
        cookie: true,
        xfbml: false,
        version: apiVersion
      });
      resolve();
    };

    if (window.FB) {
      finish();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${FB_SDK_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => finish());
      existing.addEventListener("error", () => reject(new Error("Не удалось загрузить Facebook SDK")));
      return;
    }

    const script = document.createElement("script");
    script.src = FB_SDK_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => finish();
    script.onerror = () => reject(new Error("Не удалось загрузить Facebook SDK"));
    document.body.appendChild(script);
  });
}

export function InstagramConnect({ authToken }: Props) {
  const [status, setStatus] = useState<InstagramStatus | null>(null);
  const [setup, setSetup] = useState<InstagramConnectSetup | null>(null);
  const [pageId, setPageId] = useState("");
  const [pageAccessToken, setPageAccessToken] = useState("");
  const [igUserId, setIgUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showManual, setShowManual] = useState(false);

  const refreshStatus = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError("");
    try {
      const [nextStatus, nextSetup] = await Promise.all([
        loadInstagramStatus(authToken),
        loadInstagramConnectSetup()
      ]);
      setStatus(nextStatus);
      setSetup(nextSetup);
      if (nextStatus.pageId) {
        setPageId(nextStatus.pageId);
      }
      if (nextStatus.igUserId) {
        setIgUserId(nextStatus.igUserId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить статус Instagram");
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  async function onConnectOAuth(): Promise<void> {
    if (!setup?.appId) {
      setError("Не задан Meta App ID");
      return;
    }

    setOauthLoading(true);
    setError("");
    setSuccess("");
    try {
      await ensureFacebookSdk(setup.appId, setup.apiVersion || "v21.0");
      const accessToken = await new Promise<string>((resolve, reject) => {
        window.FB.login(
          (response) => {
            const token = response.authResponse?.accessToken;
            if (token) {
              resolve(token);
              return;
            }
            reject(new Error("Вход через Facebook отменён или не дал токен"));
          },
          {
            scope: (setup.scopes || []).join(","),
            return_scopes: true
          }
        );
      });

      const result = await connectInstagramOAuth(authToken, {
        userAccessToken: accessToken
      });
      if (!result.ok) {
        throw new Error(result.error || "Не удалось подключить Instagram");
      }

      setSuccess(
        result.igUsername
          ? `Instagram @${result.igUsername} подключён`
          : `Instagram подключён (${result.pageName || result.pageId})`
      );
      await refreshStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ошибка OAuth Instagram";
      if (/invalid scopes/i.test(message)) {
        setError(
          "Meta отклонила scopes. В App Dashboard добавьте Instagram API + права: instagram_business_basic, instagram_business_manage_messages, pages_show_list, pages_messaging. Затем повторите вход."
        );
      } else {
        setError(message);
      }
    } finally {
      setOauthLoading(false);
    }
  }

  async function onConnectManual(): Promise<void> {
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
            Нужен Instagram Business, привязанный к Facebook Page. В Meta App Dashboard
            добавьте продукт Instagram и права:{" "}
            <code>instagram_business_basic</code>,{" "}
            <code>instagram_business_manage_messages</code>,{" "}
            <code>pages_show_list</code>, <code>pages_messaging</code>. Webhook:{" "}
            <code>/api/integrations/instagram/webhook</code>.
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

      <div className="instagramConnectActions">
        <button
          type="button"
          className="primaryButton"
          disabled={oauthLoading || loading}
          onClick={() => void onConnectOAuth()}
        >
          {oauthLoading ? "Подключение..." : "Подключить через Facebook"}
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
        <button type="button" className="textButton" onClick={() => setShowManual((prev) => !prev)}>
          {showManual ? "Скрыть ручной ввод" : "Ручной ввод токена"}
        </button>
      </div>

      {showManual ? (
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
          <button
            type="button"
            className="primaryButton"
            disabled={saving || !pageId.trim() || !pageAccessToken.trim()}
            onClick={() => void onConnectManual()}
          >
            {saving ? "Сохранение..." : "Сохранить вручную"}
          </button>
        </div>
      ) : null}

      {error ? <div className="integrationsError">{error}</div> : null}
      {success ? <div className="integrationsSuccess">{success}</div> : null}

      <div className="integrationsHint">
        Нужны: Instagram Business/Creator + Facebook Page. Verify token:
        {" "}
        <code>{status?.verifyToken || setup?.verifyToken || "lightcrm-meta-verify-2026"}</code>.
      </div>
    </div>
  );
}
