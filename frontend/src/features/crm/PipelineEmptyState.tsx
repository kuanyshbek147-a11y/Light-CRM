import { useState } from "react";
import { formatChannelLabel } from "../../shared/i18n/glossary";
import { canCreateDealFromPipeline, createDealHint } from "./pipelineEmpty";

export type PipelineConversationOption = {
  id: string;
  name: string;
  channel: string;
  phone: string;
  status: "open" | "closed";
};

type PipelineEmptyStateProps = {
  conversations: PipelineConversationOption[];
  otherTabHint?: string | null;
  isAdmin?: boolean;
  onConnectChannel?: () => void;
  onCreateDeal: (conversationId: string) => void;
};

export function PipelineEmptyState(props: PipelineEmptyStateProps): JSX.Element {
  const { conversations, otherTabHint, isAdmin = false, onConnectChannel, onCreateDeal } = props;
  const [pickerOpen, setPickerOpen] = useState(false);
  const canCreate = canCreateDealFromPipeline(conversations.length);
  const hint = createDealHint(conversations.length, isAdmin);
  const openConversations = conversations.filter((item) => item.status === "open");
  const pickerItems = openConversations.length ? openConversations : conversations;

  function startCreateDeal(): void {
    if (!canCreate) {
      return;
    }
    if (pickerItems.length === 1) {
      onCreateDeal(pickerItems[0].id);
      return;
    }
    setPickerOpen(true);
  }

  return (
    <div className="pipelineEmptyState dialogsEmptyCenter" data-testid="pipeline-empty-state">
      <div className="emptyTitle">Пока нет сделок</div>
      {otherTabHint ? <p className="sidebarHint">{otherTabHint}</p> : null}
      {canCreate ? (
        <div className="pipelineEmptyActions dialogsEmptyActions">
          <button
            type="button"
            className="primaryButton"
            data-testid="pipeline-create-deal"
            title={hint}
            onClick={startCreateDeal}
          >
            Создать сделку
          </button>
        </div>
      ) : isAdmin && onConnectChannel ? (
        <div className="pipelineEmptyActions dialogsEmptyActions">
          <button type="button" className="primaryButton" data-testid="pipeline-connect-channel" onClick={onConnectChannel}>
            Подключить канал
          </button>
        </div>
      ) : null}
      <p className="emptyHint" data-testid="pipeline-add-client-hint">
        {hint}
      </p>
      {pickerOpen ? (
        <div className="dealPickerList" data-testid="pipeline-deal-picker">
          <div className="scriptPanelTitle">Выберите диалог</div>
          {pickerItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className="secondaryButton pipelineDealPickBtn"
              onClick={() => onCreateDeal(item.id)}
            >
              {item.name || "Без имени"}
              {item.phone ? ` · ${item.phone}` : ""}
              {` · ${formatChannelLabel(item.channel)}`}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
