import { useState } from "react";
import { API_BASE_URL } from "../../shared/config/api";

type SettingsPanelProps = {
  token: string;
  canManageChannels: boolean;
  onOpenIntegrations: () => void;
};

const MIN_PASSWORD_LENGTH = 10;

function ChangePasswordForm({ token }: { token: string }): JSX.Element {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setMessage({ ok: false, text: `Новый пароль — минимум ${MIN_PASSWORD_LENGTH} символов.` });
      return;
    }
    if (newPassword !== repeatPassword) {
      setMessage({ ok: false, text: "Пароли не совпадают." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setMessage({ ok: false, text: data.error || "Не удалось сменить пароль." });
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setRepeatPassword("");
      setMessage({ ok: true, text: "Пароль изменён." });
    } catch {
      setMessage({ ok: false, text: "Нет связи с сервером. Попробуйте ещё раз." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="profileCard settingsPasswordForm" data-testid="settings-password" onSubmit={(e) => void submit(e)}>
      <label className="loginField">
        <span className="loginFieldLabel">Текущий пароль</span>
        <input
          className="loginInput"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
      </label>
      <label className="loginField">
        <span className="loginFieldLabel">Новый пароль</span>
        <input
          className="loginInput"
          type="password"
          autoComplete="new-password"
          placeholder={`Минимум ${MIN_PASSWORD_LENGTH} символов`}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </label>
      <label className="loginField">
        <span className="loginFieldLabel">Повторите новый пароль</span>
        <input
          className="loginInput"
          type="password"
          autoComplete="new-password"
          value={repeatPassword}
          onChange={(e) => setRepeatPassword(e.target.value)}
        />
      </label>
      {message ? (
        <p className={message.ok ? "settingsPasswordOk" : "loginError"} role={message.ok ? "status" : "alert"}>
          {message.text}
        </p>
      ) : null}
      <button type="submit" className="primaryButton" disabled={saving || !currentPassword || !newPassword}>
        {saving ? "Сохраняем…" : "Сменить пароль"}
      </button>
    </form>
  );
}

export function SettingsPanel(props: SettingsPanelProps): JSX.Element {
  const { token, canManageChannels, onOpenIntegrations } = props;

  return (
    <section className="simpleMobilePage card settingsPage" data-testid="settings-panel">
      <div className="mobilePageHeader">
        <div className="mobilePageHeaderText">
          <div className="mobilePageTitle">Настройки</div>
          <p className="settingsRoleNote" data-testid="settings-role-note">
            {canManageChannels
              ? "Вы администратор: можете подключать каналы."
              : "Вы оператор: каналы подключает администратор."}
          </p>
        </div>
      </div>
      <h2 className="settingsSectionTitle">Каналы</h2>
      <div className="profileCard">
        {canManageChannels ? (
          <button
            type="button"
            className="profileMenuBtn settingsLinkAction"
            data-testid="settings-channels"
            onClick={onOpenIntegrations}
          >
            <span>Каналы</span>
            <span>Открыть</span>
          </button>
        ) : (
          <div className="profileMenuBtn settingsLinkStatic" data-testid="settings-channels">
            <span>Каналы</span>
            <span>Просите администратора</span>
          </div>
        )}
      </div>
      <h2 className="settingsSectionTitle">Кабинет</h2>
      <div className="profileCard">
        <div className="profileMenuBtn settingsLinkStatic" data-testid="settings-language">
          <span>Язык</span>
          <span>Русский</span>
        </div>
        <div className="profileMenuBtn settingsLinkStatic" data-testid="settings-team">
          <span>Команда</span>
          <span>Скоро</span>
        </div>
      </div>
      <h2 className="settingsSectionTitle">Пароль</h2>
      <ChangePasswordForm token={token} />
    </section>
  );
}
