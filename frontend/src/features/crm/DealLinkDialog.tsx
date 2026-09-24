export type DealLinkOption = {
  id: string;
  stageLabel: string;
  amount: string;
  nextStepLabel: string | null;
};

type DealLinkDialogProps = {
  contactName: string;
  hasCurrentDeal: boolean;
  currentSummary: string | null;
  stages: Array<{ name: string; label: string }>;
  stageDraft: string;
  amountDraft: string;
  nextStepDraft: string;
  otherDeals: DealLinkOption[];
  saving: boolean;
  error: string;
  onStageDraft: (value: string) => void;
  onAmountDraft: (value: string) => void;
  onNextStepDraft: (value: string) => void;
  onCreate: () => void;
  onSave: () => void;
  onLink: (dealId: string) => void;
  onOpenClient: () => void;
  onClose: () => void;
};

export function DealLinkDialog(props: DealLinkDialogProps): JSX.Element {
  const {
    contactName,
    hasCurrentDeal,
    currentSummary,
    stages,
    stageDraft,
    amountDraft,
    nextStepDraft,
    otherDeals,
    saving,
    error,
    onStageDraft,
    onAmountDraft,
    onNextStepDraft,
    onCreate,
    onSave,
    onLink,
    onOpenClient,
    onClose
  } = props;

  return (
    <div className="drawerOverlay" onClick={onClose}>
      <div
        className="clientCardModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="deal-flow-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="clientCardModalHeader">
          <div className="clientCardModalBrand">
            <img className="brandMark" src="/logo-mark.png" alt="" width={36} height={36} />
            <div>
              <div className="clientCardModalTitle">Light CRM</div>
              <div className="clientCardModalSubtitle">Сделка</div>
            </div>
          </div>
          <button type="button" className="clientCardCloseBtn" onClick={onClose}>
            Закрыть
          </button>
        </div>
        <div className="clientCardModalBody">
          <h2 id="deal-flow-title" className="clientCardHeroTitle">
            {hasCurrentDeal ? "Сделка этого чата" : "Создать или привязать сделку"}
          </h2>
          <p className="clientCardHeroHint">
            {contactName}. Сделка привязывается к диалогу и сразу появляется на доске воронки.
          </p>
          {currentSummary ? <div className="threadDealStatus">{currentSummary}</div> : null}

          <div className="dealFlowSectionTitle">{hasCurrentDeal ? "Изменить сделку" : "Создать сделку"}</div>
          <div className="clientCardField">
            <label>Этап</label>
            <div className="clientCardInput">
              <span className="clientCardInputIcon" aria-hidden="true">
                🔽
              </span>
              <select value={stageDraft} onChange={(event) => onStageDraft(event.target.value)}>
                <option value="">Не выбрано</option>
                {stages.map((stage) => (
                  <option key={stage.name} value={stage.name}>
                    {stage.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="clientCardField">
            <label>Сумма</label>
            <div className="clientCardInput">
              <span className="clientCardInputIcon" aria-hidden="true">
                ₸
              </span>
              <input
                type="number"
                min={0}
                step="0.01"
                placeholder="0"
                value={amountDraft}
                onChange={(event) => onAmountDraft(event.target.value)}
              />
            </div>
          </div>
          <div className="clientCardField">
            <label>Следующий шаг</label>
            <div className="clientCardInput">
              <span className="clientCardInputIcon" aria-hidden="true">
                ⏱
              </span>
              <input
                type="datetime-local"
                value={nextStepDraft}
                onChange={(event) => onNextStepDraft(event.target.value)}
              />
            </div>
          </div>
          {error ? <div className="drawerInlineError">{error}</div> : null}
          <div className="clientCardActions">
            <button
              type="button"
              className="clientCardSaveBtn"
              disabled={saving}
              onClick={hasCurrentDeal ? onSave : onCreate}
            >
              {saving ? "Сохраняем…" : hasCurrentDeal ? "Сохранить" : "Создать и привязать"}
            </button>
            <button type="button" className="secondaryButton" onClick={onOpenClient}>
              Карточка клиента
            </button>
          </div>

          {!hasCurrentDeal && otherDeals.length ? (
            <>
              <div className="dealFlowSectionTitle">Привязать существующую</div>
              <p className="clientCardHeroHint">Сделка этого клиента перейдёт в текущий чат.</p>
              <div className="dealLinkList">
                {otherDeals.map((deal) => (
                  <div key={deal.id} className="dealLinkRow">
                    <div>
                      <div className="dealLinkRowMeta">{deal.stageLabel}</div>
                      <div className="sidebarHint">
                        {deal.amount}
                        {deal.nextStepLabel ? ` · Следующий шаг ${deal.nextStepLabel}` : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="textButton"
                      disabled={saving}
                      onClick={() => onLink(deal.id)}
                    >
                      Привязать
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
