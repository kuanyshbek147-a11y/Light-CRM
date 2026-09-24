import { useCallback, useEffect, useRef, useState } from "react";
import {
  connectInstagram,
  connectInstagramOAuth,
  disconnectInstagram,
  loadInstagramConnectSetup,
  loadInstagramStatus,
  type InstagramConnectSetup,
  type InstagramStatus
} from "./api";
import {
  CONNECT_BUTTON_RESET_MS,
  INSTAGRAM_OAUTH_PENDING_KEY,
  interpretInstagramOAuthReturn,
  plainInstagramOAuthError,
  resolveLinkBadge
} from "./connectionState";

type Props = {
  authToken: string;
};

const OAUTH_STATE_KEY = "instagram_oauth_state";
const OAUTH_REDIRECT_KEY = "instagram_oauth_redirect";

const OAUTH_APP_ID_FALLBACK =
  "Не задан INSTAGRAM_APP_ID (приложение Light CRM-IG). Добавьте его в окружение сервера и перезапустите backend. Ручной ввод токена остаётся доступен.";

const OAUTH_APP_SECRET_FALLBACK =
  "Не задан INSTAGRAM_APP_SECRET (приложение Light CRM-IG). Без секрета вход через Instagram Login не завершится. Добавьте его в окружение сервера и перезапустите backend. Ручной ввод токена остаётся доступен.";

/** Why the connect button cannot start OAuth. Null when Instagram Login can open. */
export function instagramOAuthBlockReason(setup: InstagramConnectSetup | null): string | null {
  if (!setup) {
    return null;
  }
  if (setup.blockReason) {
    return setup.blockReason;
  }
  if (setup.credentialsReady === true && setup.appId) {
    return null;
  }
  if (!setup.appId) {
    return OAUTH_APP_ID_FALLBACK;
  }
  if (setup.appSecretConfigured === false || setup.credentialsReady === false) {
    return OAUTH_APP_SECRET_FALLBACK;
  }
  return null;
}

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

function stripOAuthParams(): void {
  const url = new URL(window.location.href);
  for (const key of ["code", "state", "error", "error_description", "error_reason"]) {
    url.searchParams.delete(key);
  }
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
}

type InstagramExchangeResult = { ok: boolean; message: string };

const instagramOAuthGate: {
  code: string;
  flight: Promise<InstagramExchangeResult> | null;
} = { code: "", flight: null };

function ensureInstagramExchange(
  authToken: string,
  code: string,
  redirectUri: string,
  stateOk: boolean
): Promise<InstagramExchangeResult> {
  if (instagramOAuthGate.code === code && instagramOAuthGate.flight) {
    return instagramOAuthGate.flight;
  }
  instagramOAuthGate.code = code;
  instagramOAuthGate.flight = (async () => {
    if (!stateOk) {
      return { ok: false, message: "Сессия входа устарела. Нажмите «Повторить подключение»." };
    }
    try {
      const result = await connectInstagramOAuth(authToken, { code, redirectUri });
      if (!result.ok) {
        throw new Error(result.error || "Не удалось подключить Instagram");
      }
      return {
        ok: true,
        message: result.igUsername
          ? `Instagram @${result.igUsername} подключён`
          : "Instagram подключён"
      };
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Не удалось подключить Instagram";
      return { ok: false, message: plainInstagramOAuthError(raw, raw) };
    }
  })();
  return instagramOAuthGate.flight;
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
  const [attemptFailed, setAttemptFailed] = useState(false);
  const [dismissedFailure, setDismissedFailure] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [alertPulse, setAlertPulse] = useState(0);
  const blockAlertRef = useRef<HTMLDivElement | null>(null);
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const exchangeStartedRef = useRef(false);
  const leftPageRef = useRef(false);

  const refreshStatus = useCallback(async (options?: { syncBadge?: boolean }): Promise<void> => {
    setLoading(true);
    if (options?.syncBadge) {
      setError("");
    }
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
      if (options?.syncBadge) {
        setAttemptFailed(false);
        setDismissedFailure(false);
        setSuccess("");
      }
    } catch (err) {
      setAttemptFailed(true);
      setDismissedFailure(false);
      setError(err instanceof Error ? err.message : "Не удалось обновить статус Instagram");
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const markCancelled = useCallback((message: string) => {
    sessionStorage.removeItem(INSTAGRAM_OAUTH_PENDING_KEY);
    setOauthLoading(false);
    setAttemptFailed(true);
    setDismissedFailure(false);
    setSuccess("");
    setError(message);
    stripOAuthParams();
  }, []);

  useEffect(() => {
    let alive = true;

    function applyExchange(flight: Promise<InstagramExchangeResult>) {
      if (exchangeStartedRef.current) {
        return;
      }
      exchangeStartedRef.current = true;
      setOauthLoading(true);
      setError("");
      setSuccess("");
      void flight.then((result) => {
        if (!alive) {
          exchangeStartedRef.current = false;
          return;
        }
        sessionStorage.removeItem(OAUTH_STATE_KEY);
        sessionStorage.removeItem(OAUTH_REDIRECT_KEY);
        sessionStorage.removeItem(INSTAGRAM_OAUTH_PENDING_KEY);
        setOauthLoading(false);
        if (result.ok) {
          setAttemptFailed(false);
          setDismissedFailure(false);
          setSuccess(result.message);
          void refreshStatus({ syncBadge: true });
          return;
        }
        markCancelled(result.message);
      });
    }

    function consumeReturn() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      if (code) {
        const state = params.get("state");
        const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY);
        const redirectUri = sessionStorage.getItem(OAUTH_REDIRECT_KEY) || `${window.location.origin}/`;
        sessionStorage.removeItem(INSTAGRAM_OAUTH_PENDING_KEY);
        stripOAuthParams();
        applyExchange(
          ensureInstagramExchange(authToken, code, redirectUri, Boolean(expectedState && state && state === expectedState))
        );
        return;
      }

      if (instagramOAuthGate.flight) {
        applyExchange(instagramOAuthGate.flight);
        return;
      }

      const outcome = interpretInstagramOAuthReturn({
        code: null,
        error: params.get("error"),
        errorDescription: params.get("error_description"),
        pending: sessionStorage.getItem(INSTAGRAM_OAUTH_PENDING_KEY) === "1"
      });
      if (outcome.kind === "cancelled") {
        markCancelled(outcome.message);
      }
    }

    consumeReturn();
    window.addEventListener("pageshow", consumeReturn);
    return () => {
      alive = false;
      window.removeEventListener("pageshow", consumeReturn);
    };
  }, [authToken, markCancelled, refreshStatus]);

  useEffect(() => {
    function onPageHide() {
      leftPageRef.current = true;
    }
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  useEffect(() => {
    if (!oauthLoading) {
      return;
    }
    const timer = window.setTimeout(() => {
      if (leftPageRef.current) {
        return;
      }
      if (document.visibilityState !== "visible") {
        return;
      }
      const params = new URLSearchParams(window.location.search);
      if (params.get("code") || instagramOAuthGate.flight) {
        return;
      }
      setOauthLoading(false);
      if (sessionStorage.getItem(INSTAGRAM_OAUTH_PENDING_KEY) === "1") {
        markCancelled("Не удалось открыть вход Instagram. Нажмите «Повторить подключение».");
      }
    }, CONNECT_BUTTON_RESET_MS);
    return () => window.clearTimeout(timer);
  }, [markCancelled, oauthLoading]);

  async function onConnectOAuth(): Promise<void> {
    if (!setup) {
      setAttemptFailed(true);
      setDismissedFailure(false);
      setError("Не удалось загрузить настройки Instagram. Нажмите «Обновить статус» и попробуйте снова.");
      setAlertPulse((value) => value + 1);
      return;
    }
    const reason = instagramOAuthBlockReason(setup);
    if (reason) {
      setAttemptFailed(true);
      setDismissedFailure(false);
      setError("Вход через Instagram сейчас недоступен. Откройте «Подробности».");
      setAlertPulse((value) => value + 1);
      if (detailsRef.current) {
        detailsRef.current.open = true;
      }
      return;
    }

    setOauthLoading(true);
    setError("");
    setSuccess("");
    setAttemptFailed(false);
    setDismissedFailure(false);
    leftPageRef.current = false;
    try {
      const redirectUri = setup.redirectUri || `${window.location.origin}/`;
      const state = crypto.randomUUID();
      sessionStorage.setItem(OAUTH_STATE_KEY, state);
      sessionStorage.setItem(OAUTH_REDIRECT_KEY, redirectUri);
      sessionStorage.setItem(INSTAGRAM_OAUTH_PENDING_KEY, "1");
      window.location.assign(buildInstagramAuthUrl(setup, state));
    } catch (err) {
      sessionStorage.removeItem(INSTAGRAM_OAUTH_PENDING_KEY);
      setOauthLoading(false);
      setAttemptFailed(true);
      setError(err instanceof Error ? plainInstagramOAuthError(err.message, err.message) : "Не удалось открыть вход Instagram.");
    }
  }

  function dismissFailure() {
    setError("");
    setSuccess("");
    setAttemptFailed(false);
    setDismissedFailure(true);
    setOauthLoading(false);
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
      setAttemptFailed(false);
      setDismissedFailure(false);
      setSuccess(
        result.igUsername
          ? `Instagram @${result.igUsername} подключён`
          : "Instagram подключён"
      );
      await refreshStatus({ syncBadge: true });
    } catch (err) {
      setAttemptFailed(true);
      setDismissedFailure(false);
      setError(err instanceof Error ? err.message : "Не удалось подключить Instagram");
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
      setAttemptFailed(false);
      setDismissedFailure(false);
      await refreshStatus({ syncBadge: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отключить Instagram");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (alertPulse === 0) {
      return;
    }
    const node = blockAlertRef.current;
    if (!node) {
      return;
    }
    node.classList.remove("isPulsing");
    void node.offsetWidth;
    node.classList.add("isPulsing");
    node.focus();
  }, [alertPulse, error]);

  const blockReason = instagramOAuthBlockReason(setup);
  const badge = resolveLinkBadge({
    serverConnected: Boolean(status?.connected),
    attemptFailed,
    dismissedFailure,
    connectedLabel: "Подключён"
  });
  const badgeText = loading && !status && !attemptFailed && !dismissedFailure ? "Загрузка..." : badge.label;
  const showConnected = badge.kind === "connected" && Boolean(status?.connected);
  const retryLabel = attemptFailed || dismissedFailure;
  const primaryLabel = oauthLoading
    ? "Подключение..."
    : retryLabel
      ? "Повторить подключение"
      : showConnected
        ? "Переподключить Instagram"
        : "Подключить Instagram";

  return (
    <div className="instagramConnectCard" id="integration-instagram">
      <div className="integrationsPanelHeader">
        <div>
          <h3 className="integrationsPanelTitle">Личные сообщения Instagram</h3>
          <p className="integrationsHint">
            Подключите профессиональный аккаунт, чтобы сообщения приходили в диалоги.
          </p>
        </div>
        <span className={`integrationStatusPill ${badge.kind === "connected" ? "ok" : badge.kind === "error" ? "error" : ""}`}>
          {badgeText}
        </span>
      </div>

      {showConnected ? (
        <p className="integrationsHint">Сообщения из Instagram Direct приходят в диалоги.</p>
      ) : (
        <ol className="integrationsSteps">
          <li>Нажмите «Подключить Instagram» и войдите в профессиональный аккаунт.</li>
          <li>Разрешите доступ к сообщениям.</li>
          <li>Вернитесь сюда — статус сменится на «Подключён».</li>
        </ol>
      )}

      <div className="instagramConnectActions">
        <button
          type="button"
          className="primaryButton"
          aria-busy={oauthLoading}
          disabled={oauthLoading || saving || (loading && !attemptFailed && !dismissedFailure)}
          onClick={() => void onConnectOAuth()}
        >
          {oauthLoading ? <span className="integrationsSpinner" aria-hidden="true" /> : null}
          {primaryLabel}
        </button>
        {showConnected ? (
          <button
            type="button"
            className="secondaryButton"
            disabled={saving || oauthLoading}
            onClick={() => void onDisconnect()}
          >
            Отключить
          </button>
        ) : null}
        {error ? (
          <button type="button" className="secondaryButton" onClick={dismissFailure}>
            Скрыть ошибку
          </button>
        ) : null}
        <button
          type="button"
          className="secondaryButton"
          disabled={loading || oauthLoading}
          onClick={() => void refreshStatus({ syncBadge: true })}
        >
          Обновить статус
        </button>
        <button type="button" className="textButton" onClick={() => setShowManual((prev) => !prev)}>
          {showManual ? "Скрыть ручной ввод" : "Ручной ввод токена"}
        </button>
      </div>

      {error ? (
        <div ref={blockAlertRef} className="integrationsError" role="alert" tabIndex={-1}>
          {error}
        </div>
      ) : null}
      {success ? <div className="integrationsSuccess">{success}</div> : null}

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

      <details className="integrationsDetails" ref={detailsRef}>
        <summary>Подробности</summary>
        <div className="integrationsDetailsBody">
          <div>
            <div className="integrationsLabel">Права доступа</div>
            <div className="integrationsValue">{(setup?.scopes || []).join(", ") || "instagram_business_basic, instagram_business_manage_messages"}</div>
          </div>
          <div>
            <div className="integrationsLabel">Webhook</div>
            <div className="integrationsValue">{status?.webhookPath || setup?.webhookPath || "/api/integrations/instagram/webhook"}</div>
          </div>
          <div>
            <div className="integrationsLabel">Verify token</div>
            <div className="integrationsValue">{status?.verifyToken || setup?.verifyToken || "—"}</div>
          </div>
          <div>
            <div className="integrationsLabel">Redirect URI</div>
            <div className="integrationsValue">{setup?.redirectUri || `${typeof window !== "undefined" ? window.location.origin : ""}/`}</div>
          </div>
          <div>
            <div className="integrationsLabel">IG User ID</div>
            <div className="integrationsValue">{status?.igUserId || status?.pageId || "—"}</div>
          </div>
          <div>
            <div className="integrationsLabel">App ID</div>
            <div className="integrationsValue">{setup?.appId || "—"}</div>
          </div>
          <div>
            <div className="integrationsLabel">Источник</div>
            <div className="integrationsValue">{status?.source || "—"}</div>
          </div>
          {blockReason ? <div className="integrationsError">{blockReason}</div> : null}
        </div>
      </details>
    </div>
  );
}
