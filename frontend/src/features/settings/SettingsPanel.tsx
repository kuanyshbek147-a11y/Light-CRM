import { useEffect, useState } from "react";

const LANGUAGE_KEY = "lightcrm_ui_language";

type SettingsPanelProps = {
  canManageChannels: boolean;
  notificationSoundOn: boolean;
  onToggleNotificationSound: () => void;
  onOpenIntegrations: () => void;
  onOpenTeamChat: () => void;
};

export function SettingsPanel(props: SettingsPanelProps): JSX.Element {
  const {
    canManageChannels,
    notificationSoundOn,
    onToggleNotificationSound,
    onOpenIntegrations,
    onOpenTeamChat
  } = props;
  const [language, setLanguage] = useState("ru");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LANGUAGE_KEY);
      if (stored === "ru") {
        setLanguage("ru");
        return;
      }
      localStorage.setItem(LANGUAGE_KEY, "ru");
      setLanguage("ru");
    } catch {
      setLanguage("ru");
    }
  }, []);

  return (
    <section className="simpleMobilePage card settingsPage" data-testid="settings-panel">
      <div className="mobilePageHeader">
        <div className="mobilePageHeaderText">
          <div className="mobilePageTitle">Настройки</div>
          <div className="mobilePageSubtitle">Каналы, язык, команда и уведомления</div>
        </div>
      </div>

      <div className="profileCard">
        <div className="scriptPanelTitle">Каналы</div>
        <p className="sidebarHint">
          WhatsApp, Telegram, Instagram, почта, виджет сайта и телефония подключаются в разделе «Интеграции».
        </p>
        {canManageChannels ? (
          <button
            type="button"
            className="primaryButton"
            data-testid="settings-open-integrations"
            onClick={onOpenIntegrations}
          >
            Открыть интеграции
          </button>
        ) : (
          <>
            <button type="button" className="secondaryButton" disabled>
              Открыть интеграции
            </button>
            <p className="sidebarHint">Подключение каналов доступно администратору рабочего пространства.</p>
          </>
        )}
      </div>

      <div className="profileCard">
        <div className="scriptPanelTitle">Язык</div>
        <label className="sidebarHint settingsField">
          Интерфейс
          <select
            className="filterInput"
            data-testid="settings-language"
            value={language}
            onChange={(event) => {
              const next = event.target.value === "ru" ? "ru" : "ru";
              setLanguage(next);
              try {
                localStorage.setItem(LANGUAGE_KEY, next);
              } catch {
                // ignore
              }
            }}
          >
            <option value="ru">Русский</option>
            <option value="en" disabled>
              English — скоро
            </option>
          </select>
        </label>
        <p className="sidebarHint">По умолчанию интерфейс на русском. Другие языки появятся позже.</p>
      </div>

      <div className="profileCard">
        <div className="scriptPanelTitle">Команда</div>
        <p className="sidebarHint">Участники, роли и права — скоро.</p>
        <button type="button" className="secondaryButton" data-testid="settings-open-team" onClick={onOpenTeamChat}>
          Открыть чат команды
        </button>
      </div>

      <div className="profileCard">
        <div className="scriptPanelTitle">Уведомления</div>
        <label className="sidebarHint settingsCheck">
          <input
            type="checkbox"
            data-testid="settings-sound"
            checked={notificationSoundOn}
            onChange={onToggleNotificationSound}
          />
          Звук нового сообщения
        </label>
        <p className="sidebarHint">Push-уведомления на телефон — скоро.</p>
      </div>
    </section>
  );
}
