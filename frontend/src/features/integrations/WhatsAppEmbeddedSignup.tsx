import { useCallback, useEffect, useRef, useState } from "react";
import {
  completeWhatsAppConnect,
  disconnectWhatsApp,
  loadWhatsAppConnectSetup,
  loadWhatsAppConnectStatus,
  registerWhatsAppCloudApi,
  type WhatsAppConnectStatus
} from "./api";

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
  const [status, setStatus] = useState<WhatsAppConnectStatus | null>(null);
  const [appId, setAppId] = useState<string | null>(null);
  const [configId, setConfigId] = useState<string | null>(null);
  const [apiVersion, setApiVersion] = useState("v21.0");
  const [fbReady, setFbReady] = useState(false);
  const signupDataRef = useRef<{ wabaId: string; phoneNumberId: string }>({ wabaId: "", phoneNumberId: "" });
  const signupErrorRef = useRef<string | null>(null);
  const connectTimeoutRef = useRef<number | null>(null);
  const connectFinishedRef = useRef(false);

  const resetConnectState = useCallback((message?: string) => {
    connectFinishedRef.current = true;
    if (connectTimeoutRef.current !== null) {
      window.clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
    setConnecting(false);
    setConnectStep(null);
    if (message) {
      setError(message);
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    const next = await loadWhatsAppConnectStatus(authToken);
    setStatus(next);
    if (next.connected) {
      onConnected?.();
    }
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
      } catch (bootstrapError) {
        if (!cancelled) {
          setError(bootstrapError instanceof Error ? bootstrapError.message : "Ошибка загрузки");
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
        signupErrorRef.current = payload.data?.error_message || "Meta Embedded Signup завершился с ошибкой.";
        return;
      }

      if (payload.event === "CANCEL") {
        signupErrorRef.current = "Подключение отменено в мастере Meta.";
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
      await refreshStatus();
    } catch (disconnectError) {
      setError(disconnectError instanceof Error ? disconnectError.message : "Ошибка сброса");
    } finally {
      setRegistering(false);
    }
  }

  async function handleRegister() {
    setError(null);
    setRegistering(true);
    try {
      await registerWhatsAppCloudApi(authToken);
      await refreshStatus();
    } catch (registerError) {
      setError(registerError instanceof Error ? registerError.message : "Ошибка регистрации");
    } finally {
      setRegistering(false);
    }
  }

  async function handleConnect() {
    setError(null);
    setConnectStep(null);

    if (!fbReady || !window.FB) {
      setError("Facebook SDK ещё загружается. Подождите несколько секунд.");
      return;
    }
    if (!configId) {
      setError("Не задан WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID. Создайте конфигурацию в Meta Developer Console.");
      return;
    }

    setConnecting(true);
    signupDataRef.current = { wabaId: "", phoneNumberId: "" };
    signupErrorRef.current = null;
    connectFinishedRef.current = false;

    connectTimeoutRef.current = window.setTimeout(() => {
      if (!connectFinishedRef.current) {
        resetConnectState(
          "Мастер Meta не ответил. Закройте окно Meta. Если видите «не может подключать клиентов» — это ограничение Meta, не CRM."
        );
      }
    }, 120000);

    window.FB.login(
      (response) => {
        void (async () => {
          try {
            const code = response.authResponse?.code || "";
            if (!code) {
              if (signupErrorRef.current) {
                throw new Error(signupErrorRef.current);
              }
              throw new Error("Авторизация Meta отменена или не завершена.");
            }

            setConnectStep("Ожидание данных от Meta...");
            const signupData = await waitForSignupData(30000);

            setConnectStep("Сохранение подключения...");
            await completeWhatsAppConnect(authToken, {
              code,
              wabaId: signupData.wabaId || undefined,
              phoneNumberId: signupData.phoneNumberId || undefined,
              webhookPublicBaseUrl: PUBLIC_WEBHOOK_BASE || undefined
            });
            await refreshStatus();
          } catch (connectError) {
            setError(connectError instanceof Error ? connectError.message : "Ошибка подключения");
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
  }

  if (setupLoading) {
    return <div className="integrationsHint">Загрузка настроек WhatsApp...</div>;
  }

  return (
    <div className="integrationsCard">
      <div className="integrationsCardHeader">
        <div>
          <div className="integrationsTitle">WhatsApp Cloud API</div>
          <div className="integrationsHint">
            Полная миграция: номер работает только через CRM. WhatsApp Business на телефоне отключается.
          </div>
        </div>
        <span className={`integrationsBadge ${status?.connected ? "connected" : "pending"}`}>
          {status?.connected ? "Подключено" : "Не подключено"}
        </span>
      </div>

      {status?.connected ? (
        <div className="integrationsStatusGrid">
          <div>
            <div className="integrationsLabel">Номер</div>
            <div className="integrationsValue">{status.phone?.display_phone_number || "—"}</div>
          </div>
          <div>
            <div className="integrationsLabel">WABA ID</div>
            <div className="integrationsValue">{status.wabaId}</div>
          </div>
          <div>
            <div className="integrationsLabel">Phone Number ID</div>
            <div className="integrationsValue">{status.phoneNumberId}</div>
          </div>
          <div>
            <div className="integrationsLabel">Cloud API</div>
            <div className="integrationsValue">
              {status.messagingReady
                ? "Готов к отправке"
                : `${status.phone?.platform_type || "?"} / ${status.phone?.status || "?"}`}
            </div>
          </div>
        </div>
      ) : (
        <ul className="integrationsSteps">
          <li>Экспортируйте важные чаты из WhatsApp Business (история не переносится)</li>
          <li>На телефоне: Настройки → Аккаунт → Удалить мой аккаунт (+7 700 313 1055)</li>
          <li>Подождите 5–10 минут, пока Meta освободит номер</li>
          <li>Нажмите «Подключить WhatsApp» и пройдите мастер Meta (SMS-код на номер)</li>
          <li>После подключения нажмите «Зарегистрировать в Cloud API», если статус не CONNECTED</li>
        </ul>
      )}

      {status?.connected && status.needsReconnect ? (
        <div className="integrationsWarning">
          Сохранённые данные устарели после удаления аккаунта на телефоне. Нажмите «Сбросить подключение», затем
          «Подключить WhatsApp» и пройдите мастер Meta заново (SMS-код на номер).
        </div>
      ) : null}

      {status?.connected && status.needsRegistration && !status.needsReconnect ? (
        <div className="integrationsWarning">
          Токены сохранены, но Cloud API ещё не активен ({status.platformType || "?"} / {status.phoneStatus || "?"}).
          Убедитесь, что аккаунт WhatsApp Business на телефоне удалён, затем нажмите «Зарегистрировать в Cloud API».
        </div>
      ) : null}

      {connectStep ? <div className="integrationsHint">{connectStep}</div> : null}
      {error ? <div className="integrationsError">{error}</div> : null}

      {!configId || !appId ? (
        <div className="integrationsError">
          На backend не заданы Meta-переменные (appId/configId). Для Render добавьте `WHATSAPP_APP_ID` и
          `WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID`, затем перезапустите сервис.
        </div>
      ) : null}

      {!PUBLIC_WEBHOOK_BASE ? (
        <div className="integrationsWarning">
          Для webhook укажите `VITE_PUBLIC_WEBHOOK_BASE_URL` (HTTPS-туннель или прод-домен).
        </div>
      ) : null}

      <div className="integrationsWarning">
        Перед подключением удалите аккаунт WhatsApp Business на телефоне. После миграции переписка в приложении
        недоступна — только через CRM.
      </div>

      <div className="integrationsActions">
        <button
          type="button"
          className="primaryButton"
          disabled={connecting || registering || !configId}
          onClick={() => void handleConnect()}
        >
          {connecting ? "Подключение..." : status?.connected ? "Переподключить WhatsApp" : "Подключить WhatsApp"}
        </button>
        {status?.connected && status.needsRegistration && !status.needsReconnect ? (
          <button
            type="button"
            className="secondaryButton"
            disabled={connecting || registering}
            onClick={() => void handleRegister()}
          >
            {registering ? "Регистрация..." : "Зарегистрировать в Cloud API"}
          </button>
        ) : null}
        {status?.connected && status.needsReconnect ? (
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
              resetConnectState("Подключение отменено. Закройте окно Meta, если оно ещё открыто.")
            }
          >
            Отмена
          </button>
        ) : null}
        <button type="button" className="secondaryButton" disabled={connecting || registering} onClick={() => void refreshStatus()}>
          Обновить статус
        </button>
      </div>
    </div>
  );
}
