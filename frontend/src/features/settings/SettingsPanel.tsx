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
        </div>
      </div>
      <div className="profileCard">
        {canManageChannels ? (
          <button
            type="button"
            className="profileMenuBtn"
            data-testid="settings-channels"
            onClick={onOpenIntegrations}
          >
            <span>Каналы</span>
            <span>›</span>
          </button>
        ) : (
          <div className="profileMenuBtn settingsLinkStatic" data-testid="settings-channels">
            <span>Каналы</span>
            <span>Просите администратора</span>
          </div>
        )}
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
