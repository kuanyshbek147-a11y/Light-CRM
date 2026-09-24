import { useCallback, useEffect, useRef, useState } from "react";
import {
  completeWhatsAppConnect,
  disconnectWhatsApp,
  loadWhatsAppConnectSetup,
  loadWhatsAppConnectStatus,
  registerWhatsAppCloudApi,
  type WhatsAppConnectStatus
} from "./api";
import {
  CONNECT_BUTTON_RESET_MS,
  plainWhatsAppOAuthError,
  resolveLinkBadge
} from "./connectionState";

type EmbeddedSignupMessage = {
  type?: string;
  event?: string;
  data?: {
    phone_number_id?: string;
    waba_id?: string;
    current_step?: string;
    error_message?: string;
  };
};

type Props = {
  authToken: string;
  onConnected?: () => void;
};

const PUBLIC_WEBHOOK_BASE =
  import.meta.env.VITE_PUBLIC_WEBHOOK_BASE_URL?.replace(/\/+$/, "") || "";

function parseEmbeddedSignupMessage(data: unknown): EmbeddedSignupMessage | null {
  if (typeof data === "string") {
    try {
      return JSON.parse(data) as EmbeddedSignupMessage;
    } catch {
      return null;
    }
  }

  if (data && typeof data === "object") {
    return data as EmbeddedSignupMessage;
  }

  return null;
}

function isFacebookOrigin(origin: string): boolean {
  try {
    return new URL(origin).hostname.endsWith("facebook.com");
  } catch {
    return origin.endsWith("facebook.com");
  }
}

export function WhatsAppEmbeddedSignup({ authToken, onConnected }: Props) {
  const [setupLoading, setSetupLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [connectStep, setConnectStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attemptFailed, setAttemptFailed] = useState(false);
  const [dismissedFailure, setDismissedFailure] = useState(false);
  const [status, setStatus] = useState<WhatsAppConnectStatus | null>(null);
  const [appId, setAppId] = useState<string | null>(null);
  const [configId, setConfigId] = useState<string | null>(null);
  const [apiVersion, setApiVersion] = useState("v21.0");
  const [setupReady, setSetupReady] = useState(true);
  const [setupMissing, setSetupMissing] = useState<string[]>([]);
  const [fbReady, setFbReady] = useState(false);
  const signupDataRef = useRef<{ wabaId: string; phoneNumberId: string }>({ wabaId: "", phoneNumberId: "" });
  const signupErrorRef = useRef<string | null>(null);
  const connectTimeoutRef = useRef<number | null>(null);
  const connectFinishedRef = useRef(false);
  const popupTookFocusRef = useRef(false);

  const clearConnectTimers = useCallback(() => {
    if (connectTimeoutRef.current !== null) {
      window.clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
  }, []);

  const resetConnectState = useCallback((message?: string) => {
    connectFinishedRef.current = true;
    clearConnectTimers();
    setConnecting(false);
    setConnectStep(null);
    if (message) {
      setError(plainWhatsAppOAuthError(message));
      setAttemptFailed(true);
      setDismissedFailure(false);
    }
  }, [clearConnectTimers]);

  const refreshStatus = useCallback(async (options?: { syncBadge?: boolean }) => {
    const next = await loadWhatsAppConnectStatus(authToken);
    setStatus(next);
    if (options?.syncBadge) {
      setAttemptFailed(false);
      setDismissedFailure(false);
      setError(null);
    }
    if (next.connected && !options?.syncBadge) {
      onConnected?.();
    }
    if (next.connected && options?.syncBadge) {
      onConnected?.();
    }
    return next;
  }, [authToken, onConnected]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const [setup] = await Promise.all([loadWhatsAppConnectSetup(), refreshStatus()]);
        if (cancelled) {
          return;
        }
        setAppId(setup.appId);
        setConfigId(setup.configId);
        setApiVersion(setup.apiVersion || "v21.0");
        setSetupReady(setup.ready !== false);
        setSetupMissing(setup.missing || []);
      } catch (bootstrapError) {
        if (!cancelled) {
          setError(bootstrapError instanceof Error ? bootstrapError.message : "Не удалось загрузить статус WhatsApp");
        }
      } finally {
        if (!cancelled) {
          setSetupLoading(false);
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [authToken, refreshStatus]);

  useEffect(() => {
    if (!appId || fbReady) {
      return;
    }

    window.fbAsyncInit = () => {
      window.FB?.init({
        appId,
        cookie: true,
        xfbml: true,
        version: apiVersion
      });
      setFbReady(true);
    };

    if (document.getElementById("facebook-jssdk")) {
      if (window.FB) {
        window.fbAsyncInit?.();
      }
      return;
    }

    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.src = "https://connect.facebook.net/ru_RU/sdk.js";
    document.body.appendChild(script);
  }, [appId, apiVersion, fbReady]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (!isFacebookOrigin(event.origin)) {
        return;
      }

      const payload = parseEmbeddedSignupMessage(event.data);
      if (!payload || payload.type !== "WA_EMBEDDED_SIGNUP") {
        return;
      }

      if (payload.event === "ERROR") {
        signupErrorRef.current = payload.data?.error_message || "Подключение WhatsApp не завершено.";
        return;
      }

      if (payload.event === "CANCEL") {
        signupErrorRef.current = "Подключение WhatsApp отменено или не завершено.";
        return;
      }

      const current = signupDataRef.current;
      const wabaId = payload.data?.waba_id || current.wabaId;
      const phoneNumberId = payload.data?.phone_number_id || current.phoneNumberId;
      signupDataRef.current = { wabaId, phoneNumberId };
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => () => clearConnectTimers(), [clearConnectTimers]);

  async function waitForSignupData(timeoutMs: number): Promise<{ wabaId: string; phoneNumberId: string }> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (signupErrorRef.current) {
        throw new Error(signupErrorRef.current);
      }

      const current = signupDataRef.current;
      if (current.wabaId && current.phoneNumberId) {
        return current;
      }

      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    return signupDataRef.current;
  }

  async function handleDisconnect() {
    setError(null);
    setRegistering(true);
    try {
      await disconnectWhatsApp(authToken);
      setAttemptFailed(false);
      setDismissedFailure(false);
      await refreshStatus({ syncBadge: true });
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : "Не удалось сбросить подключение");
    } finally {
      setRegistering(false);
    }
  }

  async function handleRegister() {
    setError(null);
    setRegistering(true);
    try {
      await registerWhatsAppCloudApi(authToken);
      await refreshStatus({ syncBadge: true });
    } catch (registerError) {
      setError(registerError instanceof Error ? registerError.message : "Не удалось завершить регистрацию номера");
    } finally {
      setRegistering(false);
    }
  }

  async function handleRefreshStatus() {
    setError(null);
    try {
      await refreshStatus({ syncBadge: true });
    } catch {
      setAttemptFailed(true);
      setDismissedFailure(false);
      setError("Не удалось обновить статус. Проверьте соединение и попробуйте снова.");
    }
  }

  function dismissFailure() {
    setError(null);
    setConnectStep(null);
    setAttemptFailed(false);
    setDismissedFailure(true);
    setConnecting(false);
  }

  async function handleConnect() {
    setError(null);
    setConnectStep(null);
    setDismissedFailure(false);

    if (!fbReady || !window.FB) {
      setError("Страница ещё готовится. Подождите пару секунд и нажмите снова.");
      return;
    }
    if (!configId || !setupReady) {
      setError("Подключение WhatsApp сейчас недоступно. Откройте «Подробности».");
      return;
    }

    setConnecting(true);
    setAttemptFailed(false);
    signupDataRef.current = { wabaId: "", phoneNumberId: "" };
    signupErrorRef.current = null;
    connectFinishedRef.current = false;
    popupTookFocusRef.current = false;

    const markPopup = () => {
      popupTookFocusRef.current = true;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        markPopup();
      }
    };
    const stopWatchingPopup = () => {
      window.removeEventListener("blur", markPopup);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    window.addEventListener("blur", markPopup);
    document.addEventListener("visibilitychange", onVisibility);

    const stuckTimer = window.setTimeout(() => {
      if (!connectFinishedRef.current && !popupTookFocusRef.current) {
        stopWatchingPopup();
        resetConnectState("Не удалось открыть окно Meta. Нажмите «Повторить подключение».");
      }
    }, CONNECT_BUTTON_RESET_MS);

    connectTimeoutRef.current = window.setTimeout(() => {
      if (!connectFinishedRef.current) {
        stopWatchingPopup();
        resetConnectState("Не удалось дождаться ответа. Нажмите «Повторить подключение».");
      }
    }, 120000);

    try {
      window.FB.login(
      (response) => {
        stopWatchingPopup();
        window.clearTimeout(stuckTimer);
        void (async () => {
          try {
            const code = response.authResponse?.code || "";
            if (!code) {
              if (signupErrorRef.current) {
                throw new Error(signupErrorRef.current);
              }
              throw new Error("Подключение WhatsApp отменено или не завершено.");
            }

            setConnectStep("Сохраняем подключение…");
            const signupData = await waitForSignupData(30000);

            await completeWhatsAppConnect(authToken, {
              code,
              wabaId: signupData.wabaId || undefined,
              phoneNumberId: signupData.phoneNumberId || undefined,
              webhookPublicBaseUrl: PUBLIC_WEBHOOK_BASE || undefined
            });
            setAttemptFailed(false);
            setDismissedFailure(false);
            setError(null);
            await refreshStatus({ syncBadge: true });
          } catch (connectError) {
            const raw = connectError instanceof Error ? connectError.message : "Не удалось подключить WhatsApp";
            setError(plainWhatsAppOAuthError(raw));
            setAttemptFailed(true);
            setDismissedFailure(false);
          } finally {
            resetConnectState();
          }
        })();
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          sessionInfoVersion: "3"
        }
      }
    );
    } catch {
      stopWatchingPopup();
      window.clearTimeout(stuckTimer);
      resetConnectState("Не удалось открыть окно Meta. Нажмите «Повторить подключение».");
    }
  }

  if (setupLoading) {
    return <div className="integrationsHint">Загрузка настроек WhatsApp...</div>;
  }

  const badge = resolveLinkBadge({
    serverConnected: Boolean(status?.connected),
    attemptFailed,
    dismissedFailure,
    connectedLabel: "Подключено"
  });
  const showConnected = badge.kind === "connected" && Boolean(status?.connected);
  const retryLabel = attemptFailed || dismissedFailure;
  const primaryLabel = connecting
    ? "Подключение..."
    : retryLabel
      ? "Повторить подключение"
      : status?.connected
        ? "Переподключить WhatsApp"
        : "Подключить WhatsApp";
  const webhookUrl = PUBLIC_WEBHOOK_BASE
    ? `${PUBLIC_WEBHOOK_BASE}/api/integrations/whatsapp/webhook`
    : "";

  return (
    <div className="integrationsCard" id="integration-whatsapp">
      <div className="integrationsCardHeader">
        <div>
          <div className="integrationsTitle">WhatsApp</div>
          <div className="integrationsHint">
            Подключите номер, чтобы переписка с клиентами шла через CRM.
          </div>
        </div>
        <span className={`integrationsBadge ${badge.kind === "connected" ? "connected" : badge.kind === "error" ? "error" : "pending"}`}>
          {badge.label}
        </span>
      </div>

      {showConnected ? (
        <p className="integrationsHint">
          Номер {status?.phone?.display_phone_number || "подключён"}. Сообщения приходят в диалоги.
        </p>
      ) : (
        <ol className="integrationsSteps">
          <li>Удалите аккаунт WhatsApp Business на телефоне — история чатов не переносится.</li>
          <li>Подождите несколько минут и нажмите «Подключить WhatsApp».</li>
          <li>Введите код из SMS и дождитесь статуса «Подключено».</li>
        </ol>
      )}

      {showConnected && status?.needsReconnect ? (
        <div className="integrationsWarning">
          Номер больше не привязан. Сбросьте подключение и пройдите вход заново.
        </div>
      ) : null}

      {showConnected && status?.needsRegistration && !status.needsReconnect ? (
        <div className="integrationsWarning">
          Номер сохранён, но отправка ещё не включена. Нажмите «Зарегистрировать номер».
        </div>
      ) : null}

      {!setupReady || !configId || !appId ? (
        <div className="integrationsWarning">
          Подключение пока недоступно. Откройте «Подробности», чтобы увидеть, чего не хватает.
        </div>
      ) : null}

      {connectStep ? <div className="integrationsHint">{connectStep}</div> : null}
      {error ? <div className="integrationsError" role="alert">{error}</div> : null}

      <div className="integrationsActions">
        <button
          type="button"
          className="primaryButton"
          aria-busy={connecting}
          disabled={connecting || registering || !configId || !setupReady}
          onClick={() => void handleConnect()}
        >
          {connecting ? <span className="integrationsSpinner" aria-hidden="true" /> : null}
          {primaryLabel}
        </button>
        {showConnected && status?.needsRegistration && !status.needsReconnect ? (
          <button
            type="button"
            className="secondaryButton"
            disabled={connecting || registering}
            onClick={() => void handleRegister()}
          >
            {registering ? "Регистрация..." : "Зарегистрировать номер"}
          </button>
        ) : null}
        {showConnected && status?.needsReconnect ? (
          <button
            type="button"
            className="secondaryButton"
            disabled={connecting || registering}
            onClick={() => void handleDisconnect()}
          >
            {registering ? "Сброс..." : "Сбросить подключение"}
          </button>
        ) : null}
        {connecting ? (
          <button
            type="button"
            className="secondaryButton"
            onClick={() =>
              resetConnectState("Подключение WhatsApp отменено или не завершено.")
            }
          >
            Отмена
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
          disabled={connecting || registering}
          onClick={() => void handleRefreshStatus()}
        >
          Обновить статус
        </button>
      </div>

      <details className="integrationsDetails">
        <summary>Подробности</summary>
        <div className="integrationsDetailsBody">
          <div>
            <div className="integrationsLabel">WABA ID</div>
            <div className="integrationsValue">{status?.wabaId || "—"}</div>
          </div>
          <div>
            <div className="integrationsLabel">Phone Number ID</div>
            <div className="integrationsValue">{status?.phoneNumberId || "—"}</div>
          </div>
          <div>
            <div className="integrationsLabel">Webhook</div>
            <div className="integrationsValue">{webhookUrl || "Адрес сервера не задан"}</div>
          </div>
          <div>
            <div className="integrationsLabel">Cloud API</div>
            <div className="integrationsValue">
              {status?.messagingReady
                ? "Готов к отправке"
                : `${status?.platformType || "—"} / ${status?.phoneStatus || "—"}`}
            </div>
          </div>
          {!setupReady ? (
            <div className="integrationsError">
              На сервере не заданы: {setupMissing.join(", ") || "WHATSAPP_APP_SECRET"}.
            </div>
          ) : null}
          {!configId || !appId ? (
            <div className="integrationsError">
              Не заданы WHATSAPP_APP_ID или WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID.
            </div>
          ) : null}
          {!PUBLIC_WEBHOOK_BASE ? (
            <div className="integrationsWarning">
              Для приёма сообщений нужен VITE_PUBLIC_WEBHOOK_BASE_URL.
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}
