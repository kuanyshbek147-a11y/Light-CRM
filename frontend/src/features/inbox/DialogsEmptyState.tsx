type DialogsEmptyStateProps = {
  filterActive: boolean;
  isAdmin: boolean;
  onResetFilter: () => void;
  onOpenIntegrations: () => void;
};

export function DialogsEmptyState(props: DialogsEmptyStateProps): JSX.Element {
  const { filterActive, isAdmin, onResetFilter, onOpenIntegrations } = props;

  return (
    <div className="dialogsEmptyCenter" data-testid="dialogs-empty-state">
      <div className="emptyTitle">Пока нет диалогов</div>
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
              К интеграциям
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
