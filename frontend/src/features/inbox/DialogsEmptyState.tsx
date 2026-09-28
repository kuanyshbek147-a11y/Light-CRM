type DialogsEmptyStateProps = {
  filterActive: boolean;
  isAdmin: boolean;
  onResetFilter: () => void;
  onOpenIntegrations: () => void;
  onBack?: () => void;
  backLabel?: string;
};

export function DialogsEmptyState(props: DialogsEmptyStateProps): JSX.Element {
  const { filterActive, isAdmin, onResetFilter, onOpenIntegrations, onBack, backLabel } = props;

  return (
    <div className="dialogsEmptyCenter" data-testid="dialogs-empty-state">
      {onBack ? (
        <button type="button" className="threadBackBtn inboxChannelEmptyBack" onClick={onBack} aria-label={backLabel || "Назад"}>
          ‹
        </button>
      ) : null}
      <div className="emptyTitle">Пока нет диалогов</div>
      <p className="emptyHint">
        {filterActive
          ? "По выбранному фильтру ничего не нашлось."
          : isAdmin
            ? "Подключите WhatsApp, Instagram или Telegram — сообщения клиентов будут появляться здесь сами."
            : "Когда администратор подключит мессенджеры, сообщения клиентов появятся здесь."}
      </p>
      {filterActive || isAdmin ? (
        <div className="pipelineEmptyActions dialogsEmptyActions">
          {filterActive ? (
            <button type="button" className="primaryButton" data-testid="dialogs-reset-filter" onClick={onResetFilter}>
              Сбросить фильтр
            </button>
          ) : null}
          {isAdmin ? (
            <button
              type="button"
              className={filterActive ? "secondaryButton" : "primaryButton"}
              data-testid="dialogs-open-integrations"
              onClick={onOpenIntegrations}
            >
              Подключить мессенджер
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
