type SettingsPanelProps = {
  canManageChannels: boolean;
  onOpenIntegrations: () => void;
};

export function SettingsPanel(props: SettingsPanelProps): JSX.Element {
  const { canManageChannels, onOpenIntegrations } = props;

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
    </section>
  );
}
