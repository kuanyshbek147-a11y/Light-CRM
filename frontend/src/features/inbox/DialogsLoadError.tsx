type Props = {
  onRetry: () => void;
  onBack?: () => void;
  backLabel?: string;
};

export function DialogsLoadError(props: Props): JSX.Element {
  const { onRetry, onBack, backLabel } = props;
  return (
    <div className="dialogsEmptyCenter" data-testid="dialogs-load-error" role="alert">
      {onBack ? (
        <button type="button" className="threadBackBtn inboxChannelEmptyBack" onClick={onBack} aria-label={backLabel || "Назад"}>
          ‹
        </button>
      ) : null}
      <div className="emptyTitle">Не удалось загрузить диалоги. Проверьте интернет.</div>
      <div className="pipelineEmptyActions dialogsEmptyActions">
        <button type="button" className="primaryButton" data-testid="dialogs-load-retry" onClick={onRetry}>
          Повторить
        </button>
      </div>
    </div>
  );
}
