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

const OAUTH_STATE_KEY = "instagram_oauth_state";
const OAUTH_REDIRECT_KEY = "instagram_oauth_redirect";

function buildInstagramAuthUrl(setup: InstagramConnectSetup, state: string): string {
  const redirectUri = setup.redirectUri || `${window.location.origin}/`;
  const params = new URLSearchParams({
    client_id: setup.appId,
    redirect_uri: redirectUri,
    scope: (setup.scopes || []).join(","),
    response_type: "code",
    state
  });
  return `https://www.instagram.com/oauth/authorize?${params.toString()}`;
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
        loadInstagramConnectSetup(window.location.origin)
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

  // Complete Instagram Login redirect (?code=...&state=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const oauthError = params.get("error_description") || params.get("error");
    if (!code && !oauthError) {
      return;
    }

    const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY);
    const redirectUri = sessionStorage.getItem(OAUTH_REDIRECT_KEY) || `${window.location.origin}/`;

    // Clean URL immediately so refresh doesn't re-run exchange.
    const cleanUrl = `${window.location.origin}${window.location.pathname}`;
    window.history.replaceState({}, document.title, cleanUrl);

    if (oauthError) {
      setError(oauthError);
      sessionStorage.removeItem(OAUTH_STATE_KEY);
      sessionStorage.removeItem(OAUTH_REDIRECT_KEY);
      return;
    }

    if (!code) {
      return;
    }
    if (!expectedState || !state || state !== expectedState) {
      setError("OAuth state не совпал. Нажмите «Подключить Instagram» ещё раз.");
      return;
    }

    void (async () => {
      setOauthLoading(true);
      setError("");
      setSuccess("");
      try {
        const result = await connectInstagramOAuth(authToken, { code, redirectUri });
        if (!result.ok) {
          throw new Error(result.error || "Не удалось подключить Instagram");
        }
        setSuccess(
          result.igUsername
            ? `Instagram @${result.igUsername} подключён`
            : "Instagram подключён"
        );
        await refreshStatus();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка Instagram Login");
      } finally {
        sessionStorage.removeItem(OAUTH_STATE_KEY);
        sessionStorage.removeItem(OAUTH_REDIRECT_KEY);
        setOauthLoading(false);
      }
    })();
  }, [authToken, refreshStatus]);

  async function onConnectOAuth(): Promise<void> {
    if (!setup?.appId) {
      setError("Не задан INSTAGRAM_APP_ID (приложение Light CRM-IG)");
      return;
    }

    setOauthLoading(true);
    setError("");
    setSuccess("");
    try {
      const redirectUri = setup.redirectUri || `${window.location.origin}/`;
      const state = crypto.randomUUID();
      sessionStorage.setItem(OAUTH_STATE_KEY, state);
      sessionStorage.setItem(OAUTH_REDIRECT_KEY, redirectUri);
      window.location.assign(buildInstagramAuthUrl(setup, state));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка Instagram Login");
      setOauthLoading(false);
    }
  }

  async function onConnectManual(): Promise<void> {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const result = await connectInstagram(authToken, {
        pageId: pageId || igUserId,
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
            Подключение через <strong>Instagram Login</strong> (приложение Light CRM-IG). Нужны права:{" "}
            <code>instagram_business_basic</code>,{" "}
            <code>instagram_business_manage_messages</code>. Webhook:{" "}
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
            <div className="sidebarHint">IG User ID</div>
            <div className="scriptCardTitle">{status.igUserId || status.pageId || "—"}</div>
          </div>
          <div>
            <div className="sidebarHint">Источник</div>
            <div className="scriptCardTitle">{status.source || "—"}</div>
          </div>
          <div>
            <div className="sidebarHint">App ID</div>
            <div className="scriptCardTitle">{setup?.appId || "—"}</div>
          </div>
        </div>
      ) : null}

      <div className="instagramConnectActions">
        <button
          type="button"
          className="primaryButton"
          disabled={oauthLoading || loading || !setup?.appId}
          onClick={() => void onConnectOAuth()}
        >
          {oauthLoading ? "Подключение..." : "Подключить Instagram"}
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
            placeholder="Instagram User ID"
            value={igUserId}
            onChange={(event) => setIgUserId(event.target.value)}
          />
          <input
            className="filterInput"
            placeholder="Instagram Access Token"
            value={pageAccessToken}
            onChange={(event) => setPageAccessToken(event.target.value)}
            type="password"
            autoComplete="off"
          />
          <input
            className="filterInput"
            placeholder="Facebook Page ID (если токен Page)"
            value={pageId}
            onChange={(event) => setPageId(event.target.value)}
          />
          <button
            type="button"
            className="primaryButton"
            disabled={saving || !pageAccessToken.trim() || (!igUserId.trim() && !pageId.trim())}
            onClick={() => void onConnectManual()}
          >
            {saving ? "Сохранение..." : "Сохранить вручную"}
          </button>
        </div>
      ) : null}

      {error ? <div className="integrationsError">{error}</div> : null}
      {success ? <div className="integrationsSuccess">{success}</div> : null}

      <div className="integrationsHint">
        В Meta App добавьте Valid OAuth Redirect URI:{" "}
        <code>{setup?.redirectUri || `${typeof window !== "undefined" ? window.location.origin : ""}/`}</code>
        . Verify token:{" "}
        <code>{status?.verifyToken || setup?.verifyToken || "lightcrm-meta-verify-2026"}</code>.
      </div>
    </div>
  );
}
