import { useCallback, useEffect, useState } from "react";
import { plainFetchError } from "../../shared/api/http";
import { UI_LABELS_RU } from "../../shared/i18n/glossary";
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
      setError(plainFetchError(err, "Не удалось загрузить телефонию"));
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
          throw new Error("Список серверов должен быть массивом");
        }
      } catch {
        throw new Error("Текст серверов для звонка некорректен");
      }
      const saved = await saveTelephonySettings(authToken, {
        ...settings,
        iceServers
      });
      setSettings(saved);
      setSuccess("Настройки АТС сохранены");
    } catch (err) {
      setError(plainFetchError(err, "Ошибка сохранения"));
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
      setSuccess("Учётка телефона сохранена");
      await refresh();
    } catch (err) {
      setError(plainFetchError(err, "Не удалось сохранить учётку телефона"));
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
      setError(plainFetchError(err, "Не удалось удалить"));
    } finally {
      setSaving(false);
    }
  }

  if (loading && !settings) {
    return (
      <div className="integrationCard">
        <div className="integrationsTitle">{UI_LABELS_RU.telephonyTitle}</div>
        <p className="integrationsHint">Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="integrationCard">
      <div className="integrationsTitle">{UI_LABELS_RU.telephonyTitle}</div>
      <p className="integrationsHint">
        Телефон в браузере подключается к вашей АТС. Звук идёт напрямую между браузером и АТС, CRM
        хранит учётки и журнал звонков.
      </p>

      <div className="telephonyEnableRow">
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
        <button type="button" className="primaryButton" disabled={saving} onClick={() => void onSaveSettings()}>
          Сохранить АТС
        </button>
      </div>

      <details className="integrationsDetails">
        <summary>Для специалиста</summary>
        <div className="integrationsDetailsBody">
          <div className="integrationsFormGrid">
            <label className="integrationsField">
              <span>
                {UI_LABELS_RU.wssUrl}
                <span className="fieldTechHint">{UI_LABELS_RU.wssUrlHint}</span>
              </span>
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
              <span>
                {UI_LABELS_RU.sipDomain}
                <span className="fieldTechHint">{UI_LABELS_RU.sipDomainHint}</span>
              </span>
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
              <span>Префикс исходящих (необязательно)</span>
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
              <span>
                {UI_LABELS_RU.iceTurn}
                <span className="fieldTechHint">{UI_LABELS_RU.iceTurnHint}</span>
              </span>
              <textarea
                className="scriptTextarea"
                rows={5}
                value={iceText}
                onChange={(event) => setIceText(event.target.value)}
              />
            </label>
          </div>
          <div className="telephonyGuide">
            <div className="integrationsTitle">
              Что настроить на АТС
              <span className="fieldTechHint">{UI_LABELS_RU.telephonyTitleHint}</span>
            </div>
            <ul>
              <li>Номер для звонка из браузера с шифрованием голоса</li>
              <li>Защищённый адрес соединения и действующий сертификат</li>
              <li>Отдельная учётка телефона на каждого менеджера</li>
              <li>Серверы обхода сети и разрешение соединения с домена CRM</li>
              <li>Правила набора исходящих номеров</li>
            </ul>
          </div>

          <div className="integrationsTitle">Учётки телефона менеджеров</div>
          <div className="integrationsFormGrid">
        <label className="integrationsField">
          <span>Менеджер</span>
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
          <span>
            {UI_LABELS_RU.sipUsername}
          </span>
          <input
            className="filterInput"
            value={sipUsername}
            onChange={(event) => setSipUsername(event.target.value)}
            placeholder="1001"
          />
        </label>
        <label className="integrationsField">
          <span>
            {UI_LABELS_RU.sipPassword}
          </span>
          <input
            className="filterInput"
            type="password"
            value={sipPassword}
            onChange={(event) => setSipPassword(event.target.value)}
            placeholder="пароль учётки"
          />
        </label>
        <label className="integrationsField">
          <span>
            {UI_LABELS_RU.displayName}
          </span>
          <input
            className="filterInput"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="Как представить менеджера"
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
          <div className="integrationsHint">Пока нет привязанных учёток телефона.</div>
        ) : null}
          </div>
        </div>
      </details>

      {error ? <div className="drawerInlineError">{error}</div> : null}
      {success ? <div className="integrationsSuccess">{success}</div> : null}
    </div>
  );
}
