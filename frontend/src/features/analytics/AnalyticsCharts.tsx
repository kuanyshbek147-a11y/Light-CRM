import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

export type DailyPoint = {
  day: string;
  messages: number;
  dialogs: number;
  closed: number;
  won?: number;
  lost?: number;
  winRate?: number;
};

export type WeeklyPoint = {
  week: string;
  messages: number;
  dialogs: number;
  closed: number;
  won: number;
  lost: number;
  winRate: number;
};

export type ManagerLoadPoint = {
  day: string;
  managerId: string;
  managerName: string;
  dialogsHandled: number;
  outgoingMessages: number;
};

type Props = {
  dailySeries: DailyPoint[];
  weeklySeries?: WeeklyPoint[];
  managersLoadSeries?: ManagerLoadPoint[];
  periodLabel: string;
};

const COLORS = ["#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed", "#0891b2"];

function buildManagerLoadChartData(rows: ManagerLoadPoint[]): {
  data: Array<Record<string, string | number>>;
  managers: string[];
} {
  const managers = Array.from(new Set(rows.map((row) => row.managerName)));
  const byDay = new Map<string, Record<string, string | number>>();
  for (const row of rows) {
    const current = byDay.get(row.day) || { day: row.day };
    current[row.managerName] = row.dialogsHandled;
    byDay.set(row.day, current);
  }
  return { data: Array.from(byDay.values()), managers };
}

export function AnalyticsCharts({
  dailySeries,
  weeklySeries = [],
  managersLoadSeries = [],
  periodLabel
}: Props) {
  const loadChart = buildManagerLoadChartData(managersLoadSeries);

  return (
    <div className="analyticsChartsStack">
      <div className="analyticsChartCard">
        <div className="analyticsLabel">Динамика диалогов · {periodLabel}</div>
        <div className="analyticsChartFrame">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={dailySeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="dialogs" name="Новые" stroke="#2563eb" fill="#93c5fd" />
              <Area type="monotone" dataKey="closed" name="Закрытые" stroke="#059669" fill="#6ee7b7" />
              <Area type="monotone" dataKey="messages" name="Сообщения" stroke="#d97706" fill="#fcd34d" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="analyticsChartCard">
        <div className="analyticsLabel">Конверсия сделок по дням</div>
        <div className="analyticsChartFrame">
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={dailySeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar yAxisId="left" dataKey="won" name="Выиграно" fill="#059669" />
              <Bar yAxisId="left" dataKey="lost" name="Проиграно" fill="#dc2626" />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="winRate"
                name="Доля побед %"
                stroke="#2563eb"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {weeklySeries.length > 1 ? (
        <div className="analyticsChartCard">
          <div className="analyticsLabel">Конверсия по неделям</div>
          <div className="analyticsChartFrame">
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={weeklySeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="won" name="Выиграно" fill="#059669" />
                <Bar yAxisId="left" dataKey="lost" name="Проиграно" fill="#dc2626" />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="winRate"
                  name="Доля побед %"
                  stroke="#7c3aed"
                  strokeWidth={2}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      {loadChart.managers.length ? (
        <div className="analyticsChartCard">
          <div className="analyticsLabel">Нагрузка операторов по дням (диалоги)</div>
          <div className="analyticsChartFrame">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={loadChart.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                {loadChart.managers.map((name, index) => (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={name}
                    name={name}
                    stroke={COLORS[index % COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
