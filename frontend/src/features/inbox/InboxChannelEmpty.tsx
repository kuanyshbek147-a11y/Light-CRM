type Props = {
  isAdmin: boolean;
  onReset: () => void;
  onConnect?: () => void;
  layout?: "list" | "pane";
  showActions?: boolean;
  onBack?: () => void;
  backLabel?: string;
};

export function InboxChannelEmpty(props: Props): JSX.Element {
  const { isAdmin, onReset, onConnect, layout = "list", showActions = true, onBack, backLabel } = props;
  return (
    <div
      className={`inboxChannelEmpty${layout === "pane" ? " pane" : ""}`}
      data-testid={layout === "pane" ? "inbox-channel-empty-pane" : "inbox-channel-empty"}
      role="status"
    >
      {layout === "pane" && onBack ? (
        <button type="button" className="threadBackBtn inboxChannelEmptyBack" onClick={onBack} aria-label={backLabel || "Назад"}>
          ‹
        </button>
      ) : null}
      <div className="inboxChannelEmptyTitle">Нет диалогов в этом канале</div>
      {showActions ? (
      <div className="inboxChannelEmptyActions">
        <button
          type="button"
          className="primaryButton"
          data-testid={layout === "pane" ? "inbox-channel-empty-pane-reset" : "inbox-channel-empty-reset"}
          onClick={onReset}
        >
          Сбросить фильтр
        </button>
        {isAdmin && onConnect ? (
          <button
            type="button"
            className="secondaryButton"
            data-testid={layout === "pane" ? "inbox-channel-empty-pane-connect" : "inbox-channel-empty-connect"}
            onClick={onConnect}
          >
            Подключить канал
          </button>
        ) : null}
      </div>
      ) : null}
    </div>
  );
}
