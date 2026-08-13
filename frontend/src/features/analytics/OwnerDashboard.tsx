type ManagerRow = {
  managerId: string;
  managerName: string;
  dialogsHandled?: number;
  outgoingMessages?: number;
  wonDeals?: number;
  lostDeals?: number;
  wonAmount?: number;
  winRate?: number;
  avgFirstResponseMinutes?: number;
  overdueSlaCount?: number;
};

type OwnerKpi = {
  revenueWon: number;
  pipelineAmount: number;
  winRate: number;
  avgFirstResponseMinutes: number;
  leads?: number;
  wonDeals?: number;
  conversion?: number;
};

type Props = {
  ownerKpi?: OwnerKpi | null;
  managersKpi?: ManagerRow[];
  laggingManagers?: ManagerRow[];
  periodLabel: string;
};

function money(value: number): string {
  return new Intl.NumberFormat("ru-KZ", {
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

export function OwnerDashboard({
  ownerKpi,
  managersKpi = [],
  laggingManagers = [],
  periodLabel
}: Props) {
  const ranked = [...managersKpi].sort((a, b) => {
    const amountDiff = Number(b.wonAmount || 0) - Number(a.wonAmount || 0);
    if (amountDiff !== 0) {
      return amountDiff;
    }
    const winDiff = Number(b.winRate || 0) - Number(a.winRate || 0);
    if (winDiff !== 0) {
      return winDiff;
    }
    return Number(a.avgFirstResponseMinutes || 0) - Number(b.avgFirstResponseMinutes || 0);
  });

  return (
    <div className="ownerDashboard">
      <div className="analyticsLabel">Для владельца · {periodLabel}</div>
      <div className="ownerKpiGrid">
        <div className="ownerKpiCard">
          <div className="analyticsValue">{money(ownerKpi?.revenueWon || 0)} ₸</div>
          <div className="analyticsLabel">Выручка (won)</div>
        </div>
        <div className="ownerKpiCard">
          <div className="analyticsValue">{money(ownerKpi?.pipelineAmount || 0)} ₸</div>
          <div className="analyticsLabel">Pipeline</div>
        </div>
        <div className="ownerKpiCard">
          <div className="analyticsValue">{ownerKpi?.winRate ?? 0}%</div>
          <div className="analyticsLabel">Win rate</div>
        </div>
        <div className="ownerKpiCard">
          <div className="analyticsValue">{ownerKpi?.avgFirstResponseMinutes ?? 0} мин</div>
          <div className="analyticsLabel">Ср. FRT</div>
        </div>
      </div>
      <div className="ownerMetaLine">
        Лиды: <strong>{ownerKpi?.leads ?? 0}</strong>
        {" · "}
        Won: <strong>{ownerKpi?.wonDeals ?? 0}</strong>
        {" · "}
        Конверсия лид→won: <strong>{ownerKpi?.conversion ?? 0}%</strong>
      </div>

      {laggingManagers.length ? (
        <div className="ownerLagging">
          <div className="analyticsLabel">Отстающие</div>
          <div className="ownerLaggingList">
            {laggingManagers.map((row) => (
              <div key={row.managerId} className="ownerLaggingRow">
                <span>{row.managerName}</span>
                <strong>
                  {money(row.wonAmount || 0)} ₸ · {row.winRate ?? 0}% · FRT {row.avgFirstResponseMinutes ?? 0}м
                </strong>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="analyticsLabel">Рейтинг менеджеров</div>
      <div className="analyticsManagersTable ownerManagersTable">
        <div className="analyticsManagersHead ownerManagersHead">
          <span>#</span>
          <span>Менеджер</span>
          <span>Выручка</span>
          <span>Win %</span>
          <span>FRT</span>
          <span>SLA</span>
          <span>Диалоги</span>
        </div>
        {ranked.map((row, index) => (
          <div key={row.managerId} className="analyticsManagersRow ownerManagersRow">
            <span>{index + 1}</span>
            <span>{row.managerName}</span>
            <strong>{money(row.wonAmount || 0)}</strong>
            <strong>{row.winRate ?? 0}%</strong>
            <strong>{row.avgFirstResponseMinutes ?? 0}</strong>
            <strong>{row.overdueSlaCount ?? 0}</strong>
            <strong>{row.dialogsHandled ?? 0}</strong>
          </div>
        ))}
        {ranked.length ? null : <div className="analyticsManagersEmpty">Нет активных менеджеров.</div>}
      </div>
    </div>
  );
}
