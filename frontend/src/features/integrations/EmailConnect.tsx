import { useCallback, useEffect, useMemo, useState } from "react";
import {
  connectEmail,
  disconnectEmail,
  loadEmailStatus,
  type EmailProviderId,
  type EmailProviderPreset,
  type EmailStatus
} from "./api";

type Props = {
  authToken: string;
};

const DEFAULT_PROVIDER: EmailProviderId = "gmail";

export function EmailConnect({ authToken }: Props) {
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [provider, setProvider] = useState<EmailProviderId>(DEFAULT_PROVIDER);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("465");
  const [smtpSecure, setSmtpSecure] = useState(true);
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState("993");
  const [imapSecure, setImapSecure] = useState(true);

  const connected = Boolean(status?.connected);
  const providers = status?.providers || [];

  const selectedPreset = useMemo((): EmailProviderPreset | null => {
    return providers.find((item) => item.id === provider) || null;
  }, [provider, providers]);

  const applyPreset = useCallback((preset: EmailProviderPreset | null) => {
    if (!preset) {
      return;
    }
    if (preset.id !== "custom") {
      setSmtpHost(preset.smtpHost);
      setSmtpPort(String(preset.smtpPort));
      setSmtpSecure(preset.smtpSecure);
      setImapHost(preset.imapHost);
      setImapPort(String(preset.imapPort));
      setImapSecure(preset.imapSecure);
    }
  }, []);

  const refreshStatus = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError("");
    try {
      const next = await loadEmailStatus(authToken);
      setStatus(next);
      if (!next.connected) {
        setShowForm(true);
      }
      const nextProvider = (next.provider || DEFAULT_PROVIDER) as EmailProviderId;
      setProvider(nextProvider);
      const preset =
        next.providers.find((item) => item.id === nextProvider) ||
        next.providers.find((item) => item.id === DEFAULT_PROVIDER) ||
        null;
      if (preset && !next.connected) {
        applyPreset(preset);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить статус почты");
    } finally {
      setLoading(false);
    }
  }, [applyPreset, authToken]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  function onProviderChange(nextProvider: EmailProviderId): void {
    setProvider(nextProvider);
    const preset = providers.find((item) => item.id === nextProvider) || null;
    applyPreset(preset);
  }

  async function onConnect(): Promise<void> {
    if (!email.trim()) {
      setError("Укажите email");
      setShowForm(true);
      return;
    }
    if (!password.trim()) {
      setError("Укажите пароль или пароль приложения");
      setShowForm(true);
      return;
    }
    if (provider === "custom" && (!smtpHost.trim() || !imapHost.trim())) {
      setError("Для своего сервера укажите SMTP и IMAP хосты");
      setShowForm(true);
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const result = await connectEmail(authToken, {
        email: email.trim(),
        password: password.trim(),
        displayName: displayName.trim() || undefined,
        provider,
        smtpHost: smtpHost.trim() || undefined,
        smtpPort: Number(smtpPort) || undefined,
        smtpSecure,
        imapHost: imapHost.trim() || undefined,
        imapPort: Number(imapPort) || undefined,
        imapSecure
      });
      if (!result.ok) {
        throw new Error(result.error || "Не удалось подключить почту");
      }
      setPassword("");
      setShowForm(false);
      setSuccess(result.email ? `Почта ${result.email} подключена` : "Почта подключена");
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка подключения почты");
    } finally {
      setSaving(false);
    }
  }

  async function onDisconnect(): Promise<void> {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await disconnectEmail(authToken);
      setSuccess("Почта отключена");
      setPassword("");
      setShowForm(true);
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка отключения почты");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="instagramConnectCard">
      <div className="integrationsPanelHeader">
        <div>
          <h3 className="integrationsPanelTitle">Email</h3>
          <p className="integrationsHint">
            Подключите корпоративную почту через SMTP/IMAP. Входящие письма появятся в диалогах как канал
            Email.
          </p>
        </div>
        <span className={`integrationStatusPill ${connected ? "ok" : ""}`}>
          {loading ? "Загрузка..." : connected ? "Подключён" : "Не подключён"}
        </span>
      </div>

      {connected ? (
        <div className="instagramStatusGrid">
          <div>
            <div className="sidebarHint">Адрес</div>
            <div className="scriptCardTitle">{status?.email || "—"}</div>
          </div>
          <div>
            <div className="sidebarHint">Провайдер</div>
            <div className="scriptCardTitle">{status?.provider || "—"}</div>
          </div>
          <div>
            <div className="sidebarHint">SMTP</div>
            <div className="scriptCardTitle">
              {status?.smtpHost ? `${status.smtpHost}:${status.smtpPort}` : "—"}
            </div>
          </div>
          <div>
            <div className="sidebarHint">IMAP</div>
            <div className="scriptCardTitle">
              {status?.imapHost ? `${status.imapHost}:${status.imapPort}` : "—"}
            </div>
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
            {saving ? "Отключение..." : "Отключить почту"}
          </button>
        ) : (
          <button
            type="button"
            className="primaryButton"
            disabled={saving || loading}
            onClick={() => {
              if (!showForm) {
                setShowForm(true);
                return;
              }
              void onConnect();
            }}
          >
            {saving ? "Подключение..." : "Подключить почту"}
          </button>
        )}

        {connected ? (
          <button
            type="button"
            className="primaryButton"
            disabled={saving || loading}
            onClick={() => {
              setShowForm(true);
              setSuccess("");
              setError("");
              if (status?.email) {
                setEmail(status.email);
              }
              if (status?.displayName) {
                setDisplayName(status.displayName);
              }
              if (status?.provider) {
                setProvider(status.provider as EmailProviderId);
              }
              if (status?.smtpHost) {
                setSmtpHost(status.smtpHost);
              }
              if (status?.smtpPort) {
                setSmtpPort(String(status.smtpPort));
              }
              if (status?.imapHost) {
                setImapHost(status.imapHost);
              }
              if (status?.imapPort) {
                setImapPort(String(status.imapPort));
              }
            }}
          >
            Переподключить
          </button>
        ) : null}

        <button type="button" className="secondaryButton" disabled={loading} onClick={() => void refreshStatus()}>
          Обновить статус
        </button>
      </div>

      {showForm ? (
        <div className="instagramConnectForm">
          <input
            className="filterInput"
            placeholder="Email (например, support@company.kz)"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            autoComplete="off"
          />
          <input
            className="filterInput"
            placeholder={
              provider === "gmail"
                ? "Пароль приложения Google (16 символов)"
                : "Пароль или пароль приложения"
            }
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete="new-password"
          />
          <input
            className="filterInput"
            placeholder="Имя отправителя (необязательно)"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            autoComplete="off"
          />
          <select
            className="filterInput"
            value={provider}
            onChange={(event) => onProviderChange(event.target.value as EmailProviderId)}
          >
            {(providers.length
              ? providers
              : [
                  { id: "gmail", label: "Gmail" },
                  { id: "yandex", label: "Yandex" },
                  { id: "mailru", label: "Mail.ru" },
                  { id: "outlook", label: "Outlook / Office 365" },
                  { id: "custom", label: "Свой сервер" }
                ]
            ).map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          {selectedPreset?.hint ? <div className="integrationsHint">{selectedPreset.hint}</div> : null}

          {provider === "custom" ? (
            <>
              <input
                className="filterInput"
                placeholder="SMTP хост"
                value={smtpHost}
                onChange={(event) => setSmtpHost(event.target.value)}
              />
              <input
                className="filterInput"
                placeholder="SMTP порт"
                value={smtpPort}
                onChange={(event) => setSmtpPort(event.target.value)}
              />
              <label className="integrationsHint">
                <input
                  type="checkbox"
                  checked={smtpSecure}
                  onChange={(event) => setSmtpSecure(event.target.checked)}
                />{" "}
                SMTP SSL/TLS
              </label>
              <input
                className="filterInput"
                placeholder="IMAP хост"
                value={imapHost}
                onChange={(event) => setImapHost(event.target.value)}
              />
              <input
                className="filterInput"
                placeholder="IMAP порт"
                value={imapPort}
                onChange={(event) => setImapPort(event.target.value)}
              />
              <label className="integrationsHint">
                <input
                  type="checkbox"
                  checked={imapSecure}
                  onChange={(event) => setImapSecure(event.target.checked)}
                />{" "}
                IMAP SSL/TLS
              </label>
            </>
          ) : null}

          <div className="instagramConnectActions">
            <button
              type="button"
              className="primaryButton"
              disabled={saving || !email.trim() || !password.trim()}
              onClick={() => void onConnect()}
            >
              {saving ? "Сохранение..." : connected ? "Сохранить и подключить" : "Подключить почту"}
            </button>
            {connected ? (
              <button
                type="button"
                className="textButton"
                disabled={saving}
                onClick={() => {
                  setShowForm(false);
                  setPassword("");
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

      <div className="integrationsHint">
        {connected
          ? "Нажмите «Отключить почту», чтобы остановить приём писем. «Переподключить» — чтобы сменить ящик или пароль."
          : "1) Выберите провайдера → 2) Укажите email и пароль приложения → 3) Нажмите «Подключить почту»."}
      </div>
    </div>
  );
}
