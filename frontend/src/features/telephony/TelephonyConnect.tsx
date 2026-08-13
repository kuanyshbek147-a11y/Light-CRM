import { useCallback, useEffect, useState } from "react";
import {
  deleteTelephonyExtension,
  loadTelephonyExtensions,
  loadTelephonySettings,
  saveTelephonyExtension,
  saveTelephonySettings,
  type IceServerConfig,
  type TelephonyExtension,
  type TelephonySettings
} from "./api";

type Props = {
  authToken: string;
};

const DEFAULT_ICE_TEXT = JSON.stringify([{ urls: "stun:stun.l.google.com:19302" }], null, 2);

export function TelephonyConnect({ authToken }: Props) {
  const [settings, setSettings] = useState<TelephonySettings | null>(null);
  const [extensions, setExtensions] = useState<TelephonyExtension[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; full_name: string; role: string }>>([]);
  const [iceText, setIceText] = useState(DEFAULT_ICE_TEXT);
  const [userId, setUserId] = useState("");
  const [sipUsername, setSipUsername] = useState("");
  const [sipPassword, setSipPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError("");
    try {
      const nextSettings = await loadTelephonySettings(authToken);
      setSettings(nextSettings);
      setIceText(JSON.stringify(nextSettings.iceServers || [], null, 2));
      try {
        const data = await loadTelephonyExtensions(authToken);
        setExtensions(data.extensions);
        setUsers(data.users);
        setUserId((prev) => prev || data.users[0]?.id || "");
      } catch {
        setExtensions([]);
        setUsers([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить телефонию");
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onSaveSettings(): Promise<void> {
    if (!settings) {
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      let iceServers: IceServerConfig[] = [];
      try {
        iceServers = JSON.parse(iceText) as IceServerConfig[];
        if (!Array.isArray(iceServers)) {
          throw new Error("ICE servers must be a JSON array");
        }
      } catch {
        throw new Error("ICE/TURN JSON некорректен");
      }
      const saved = await saveTelephonySettings(authToken, {
        ...settings,
        iceServers
      });
      setSettings(saved);
      setSuccess("Настройки АТС сохранены");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  async function onSaveExtension(): Promise<void> {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await saveTelephonyExtension(authToken, {
        userId,
        sipUsername: sipUsername.trim(),
        sipPassword: sipPassword.trim() || undefined,
        displayName: displayName.trim() || undefined,
        isActive: true
      });
      setSipPassword("");
      setSuccess("SIP-учётка сохранена");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения extension");
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteExtension(id: string): Promise<void> {
    setSaving(true);
    setError("");
    try {
      await deleteTelephonyExtension(authToken, id);
      setSuccess("Учётка удалена");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !settings) {
    return (
      <div className="integrationCard">
        <div className="integrationsTitle">Телефония (Asterisk)</div>
        <p className="integrationsHint">Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="integrationCard">
      <div className="integrationsTitle">Телефония (Asterisk WebRTC)</div>
      <p className="integrationsHint">
        Softphone в браузере подключается к вашему Asterisk по WSS. Медиа идёт напрямую браузер ↔
        АТС, CRM хранит учётки и лог звонков.
      </p>

      <div className="integrationsFormGrid">
        <label className="integrationsField">
          <span>Включено</span>
          <input
            type="checkbox"
            checked={Boolean(settings?.enabled)}
            onChange={(event) =>
              setSettings((prev) => (prev ? { ...prev, enabled: event.target.checked } : prev))
            }
          />
        </label>
        <label className="integrationsField">
          <span>WSS URL</span>
          <input
            className="filterInput"
            placeholder="wss://pbx.example.com:8089/ws"
            value={settings?.wssUrl || ""}
            onChange={(event) =>
              setSettings((prev) => (prev ? { ...prev, wssUrl: event.target.value } : prev))
            }
          />
        </label>
        <label className="integrationsField">
          <span>SIP domain</span>
          <input
            className="filterInput"
            placeholder="pbx.example.com"
            value={settings?.domain || ""}
            onChange={(event) =>
              setSettings((prev) => (prev ? { ...prev, domain: event.target.value } : prev))
            }
          />
        </label>
        <label className="integrationsField">
          <span>Префикс исходящих (опционально)</span>
          <input
            className="filterInput"
            placeholder="например 9 или 7"
            value={settings?.outboundPrefix || ""}
            onChange={(event) =>
              setSettings((prev) =>
                prev ? { ...prev, outboundPrefix: event.target.value } : prev
              )
            }
          />
        </label>
        <label className="integrationsField">
          <span>ICE / TURN (JSON)</span>
          <textarea
            className="scriptTextarea"
            rows={5}
            value={iceText}
            onChange={(event) => setIceText(event.target.value)}
          />
        </label>
      </div>

      <div className="integrationsActions">
        <button type="button" className="primaryButton" disabled={saving} onClick={() => void onSaveSettings()}>
          Сохранить АТС
        </button>
      </div>

      <div className="telephonyGuide">
        <div className="sidebarTitle">Чеклист Asterisk</div>
        <ul>
          <li>PJSIP endpoint с <code>webrtc=yes</code>, DTLS-SRTP, ICE</li>
          <li>WSS listener (часто порт 8089) с валидным TLS-сертификатом</li>
          <li>Отдельный SIP extension на каждого оператора CRM</li>
          <li>STUN/TURN для NAT; разрешить WSS с домена CRM</li>
          <li>Dialplan для исходящих на E.164 / местные номера</li>
        </ul>
      </div>

      <div className="sidebarTitle">SIP-учётки операторов</div>
      <div className="integrationsFormGrid">
        <label className="integrationsField">
          <span>Оператор</span>
          <select className="filterInput" value={userId} onChange={(event) => setUserId(event.target.value)}>
            <option value="">Выберите</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.full_name} ({user.role})
              </option>
            ))}
          </select>
        </label>
        <label className="integrationsField">
          <span>SIP username</span>
          <input
            className="filterInput"
            value={sipUsername}
            onChange={(event) => setSipUsername(event.target.value)}
            placeholder="1001"
          />
        </label>
        <label className="integrationsField">
          <span>SIP password</span>
          <input
            className="filterInput"
            type="password"
            value={sipPassword}
            onChange={(event) => setSipPassword(event.target.value)}
            placeholder="пароль extension"
          />
        </label>
        <label className="integrationsField">
          <span>Display name</span>
          <input
            className="filterInput"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Имя в SIP"
          />
        </label>
      </div>
      <div className="integrationsActions">
        <button
          type="button"
          className="secondaryButton"
          disabled={saving || !userId || !sipUsername.trim()}
          onClick={() => void onSaveExtension()}
        >
          Сохранить учётку
        </button>
      </div>

      <div className="telephonyExtensionList">
        {extensions.map((item) => (
          <div key={item.id} className="telephonyExtensionRow">
            <div>
              <strong>{item.user_name || item.user_id}</strong>
              <div className="integrationsHint">
                {item.sip_username}
                {item.is_active ? "" : " · выкл"}
              </div>
            </div>
            <button
              type="button"
              className="textButton dangerButton"
              disabled={saving}
              onClick={() => void onDeleteExtension(item.id)}
            >
              Удалить
            </button>
          </div>
        ))}
        {!extensions.length ? (
          <div className="integrationsHint">Пока нет привязанных SIP-учёток.</div>
        ) : null}
      </div>

      {error ? <div className="drawerInlineError">{error}</div> : null}
      {success ? <div className="integrationsSuccess">{success}</div> : null}
    </div>
  );
}
