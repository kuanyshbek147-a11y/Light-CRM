import { useState } from "react";
import {
  ADD_CLIENT_UNAVAILABLE_HINT,
  canCreateDealFromPipeline,
  createDealHint
} from "./pipelineEmpty";

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
  onCreateDeal: (conversationId: string) => void;
};

function channelLabel(channel: string): string {
  switch (channel) {
    case "whatsapp":
      return "WhatsApp";
    case "telegram":
      return "Telegram";
    case "instagram":
      return "Instagram";
    case "web":
      return "Сайт";
    case "email":
      return "Почта";
    default:
      return channel;
  }
}

export function PipelineEmptyState(props: PipelineEmptyStateProps): JSX.Element {
  const { conversations, otherTabHint, onCreateDeal } = props;
  const [pickerOpen, setPickerOpen] = useState(false);
  const canCreate = canCreateDealFromPipeline(conversations.length);
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
      <div className="pipelineEmptyActions dialogsEmptyActions">
        <button
          type="button"
          className="primaryButton"
          data-testid="pipeline-create-deal"
          disabled={!canCreate}
          title={createDealHint(conversations.length)}
          onClick={startCreateDeal}
        >
          Создать сделку
        </button>
        <button
          type="button"
          className="secondaryButton"
          data-testid="pipeline-add-client"
          disabled
          title={ADD_CLIENT_UNAVAILABLE_HINT}
        >
          Добавить клиента
        </button>
      </div>
      {!canCreate ? <p className="sidebarHint">{createDealHint(0)}</p> : null}
      <p className="sidebarHint" data-testid="pipeline-add-client-hint">
        {ADD_CLIENT_UNAVAILABLE_HINT}
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
              {` · ${channelLabel(item.channel)}`}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
