type Props = {
  onRetry: () => void;
  showActions?: boolean;
  onBack?: () => void;
  backLabel?: string;
};

export function DialogsLoadError(props: Props): JSX.Element {
  const { onRetry, showActions = true, onBack, backLabel } = props;
  return (
    <div className="dialogsEmptyCenter" data-testid="dialogs-load-error" role="alert">
      {onBack ? (
        <button type="button" className="threadBackBtn inboxChannelEmptyBack" onClick={onBack} aria-label={backLabel || "Назад"}>
          ‹
        </button>
      ) : null}
      <div className="emptyTitle">Не удалось загрузить диалоги. Проверьте интернет.</div>
      {showActions ? (
      <div className="pipelineEmptyActions dialogsEmptyActions">
        <button type="button" className="primaryButton" data-testid="dialogs-load-retry" onClick={onRetry}>
          Повторить
        </button>
      </div>
      ) : null}
    </div>
  );
}
