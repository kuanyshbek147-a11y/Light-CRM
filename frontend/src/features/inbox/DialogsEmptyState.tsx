type DialogsEmptyStateProps = {
  filterActive: boolean;
  isAdmin: boolean;
  onResetFilter: () => void;
  onOpenIntegrations: () => void;
  showActions?: boolean;
  onBack?: () => void;
  backLabel?: string;
};

export function DialogsEmptyState(props: DialogsEmptyStateProps): JSX.Element {
  const { filterActive, isAdmin, onResetFilter, onOpenIntegrations, showActions = true, onBack, backLabel } = props;
  const title = filterActive ? "Ничего не найдено" : "Пока нет диалогов";
  const hint = filterActive
    ? "Сбросьте фильтр, чтобы увидеть диалоги."
    : isAdmin
      ? "Подключите WhatsApp, Instagram или Telegram — сообщения клиентов появятся здесь."
      : "Канал подключает администратор. Когда клиент напишет, диалог появится здесь.";

  return (
    <div className="dialogsEmptyCenter" data-testid="dialogs-empty-state">
      {onBack ? (
        <button type="button" className="threadBackBtn inboxChannelEmptyBack" onClick={onBack} aria-label={backLabel || "Назад"}>
          ‹
        </button>
      ) : null}
      <div className="emptyTitle">{title}</div>
      <p className="emptyHint">{hint}</p>
      {showActions && filterActive ? (
        <div className="pipelineEmptyActions dialogsEmptyActions">
          <button type="button" className="primaryButton" data-testid="dialogs-reset-filter" onClick={onResetFilter}>
            Сбросить фильтр
          </button>
        </div>
      ) : showActions && isAdmin ? (
        <div className="pipelineEmptyActions dialogsEmptyActions">
          <button
            type="button"
            className="primaryButton"
            data-testid="dialogs-open-integrations"
            onClick={onOpenIntegrations}
          >
            Подключить канал
          </button>
        </div>
      ) : null}
    </div>
  );
}
