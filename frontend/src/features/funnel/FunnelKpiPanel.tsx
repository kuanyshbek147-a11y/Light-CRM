type Deal = {
  id: string;
  conversation_id: string;
  stage: string;
  amount: string;
  contact_name: string;
  manager_name: string;
};

type Metrics = {
  firstResponseMinutes: number;
  handledConversations7d: number;
  sentMessages7d: number;
} | null;

type FunnelKpiLabels = {
  pipelineAndKpi: string;
  salesOverview: string;
  min: string;
  firstResponse: string;
  chats7d: string;
  outgoing7d: string;
  deals: string;
  client: string;
  amount: string;
  stage: string;
};

type FunnelKpiPanelProps = {
  metrics: Metrics;
  deals: Deal[];
  availableStageNames: string[];
  labels: FunnelKpiLabels;
  formatStageLabel: (stage: string) => string;
  onDealStageChange: (dealId: string, stage: string) => void;
  className?: string;
  showHeader?: boolean;
};

export function FunnelKpiPanel({
  metrics,
  deals,
  availableStageNames,
  labels,
  formatStageLabel,
  onDealStageChange,
  className,
  showHeader = true
}: FunnelKpiPanelProps) {
  return (
    <div className={className}>
      {showHeader ? (
        <div className="railHeader">
          <div>
            <div className="sidebarTitle">{labels.pipelineAndKpi}</div>
            <div className="sidebarHint">{labels.salesOverview}</div>
          </div>
        </div>
      ) : null}

      <div className="kpiGrid">
        <div className="kpiCard">
          <div className="kpiValue">
            {metrics?.firstResponseMinutes ?? 0} {labels.min}
          </div>
          <div className="kpiLabel">{labels.firstResponse}</div>
        </div>
        <div className="kpiCard">
          <div className="kpiValue">{metrics?.handledConversations7d ?? 0}</div>
          <div className="kpiLabel">{labels.chats7d}</div>
        </div>
        <div className="kpiCard">
          <div className="kpiValue">{metrics?.sentMessages7d ?? 0}</div>
          <div className="kpiLabel">{labels.outgoing7d}</div>
        </div>
      </div>

      <div className="tableSection">
        <div className="tableTitle">{labels.deals}</div>
        <table className="dealTable">
          <thead>
            <tr>
              <th>{labels.client}</th>
              <th>{labels.amount}</th>
              <th>{labels.stage}</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((deal) => (
              <tr key={deal.id}>
                <td>{deal.contact_name}</td>
                <td>{deal.amount}</td>
                <td>
                  <select
                    className="stageSelect"
                    value={deal.stage}
                    onChange={(event) => onDealStageChange(deal.id, event.target.value)}
                  >
                    {availableStageNames.map((stageName) => (
                      <option key={stageName} value={stageName}>
                        {formatStageLabel(stageName)}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
