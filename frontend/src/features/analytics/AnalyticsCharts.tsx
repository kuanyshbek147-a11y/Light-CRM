import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  LabelList,
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
  date?: string;
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

type ChartPoint = DailyPoint & {
  label: string;
  weekday: string;
};

type Props = {
  dailySeries: DailyPoint[];
  weeklySeries?: WeeklyPoint[];
  managersLoadSeries?: ManagerLoadPoint[];
  periodLabel: string;
};

const COLORS = ["#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed", "#0891b2"];
const WEEKDAYS_RU = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"] as const;

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

function enrichDailySeries(series: DailyPoint[]): ChartPoint[] {
  return series.map((point) => {
    const iso = point.date || "";
    const parsed = iso ? new Date(`${iso}T12:00:00`) : null;
    const weekday =
      parsed && !Number.isNaN(parsed.getTime()) ? WEEKDAYS_RU[parsed.getDay()] : "";
    return {
      ...point,
      weekday,
      label: weekday ? `${weekday} ${point.day}` : point.day
    };
  });
}

function xAxisInterval(length: number): number | "preserveStartEnd" {
  if (length <= 10) {
    return 0;
  }
  if (length <= 16) {
    return 1;
  }
  if (length <= 24) {
    return 2;
  }
  return Math.ceil(length / 10) - 1;
}

function DynamicsBarChart({
  title,
  dataKey,
  color,
  data
}: {
  title: string;
  dataKey: "messages" | "dialogs" | "closed";
  color: string;
  data: ChartPoint[];
}): JSX.Element {
  const total = data.reduce((sum, row) => sum + Number(row[dataKey] || 0), 0);
  const showValues = data.length <= 16;

  return (
    <div className="analyticsChartCard analyticsDynamicsCard">
      <div className="analyticsDynamicsHeader">
        <div className="analyticsLabel">{title}</div>
        <div className="analyticsDynamicsTotal">
          Итого: <strong>{total}</strong>
        </div>
      </div>
      <div className="analyticsChartFrame analyticsChartFrameLarge">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 18, right: 8, left: 0, bottom: 28 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <XAxis
              dataKey="label"
              interval={xAxisInterval(data.length)}
              tick={{ fontSize: 11, fill: "#64748b" }}
              angle={data.length > 14 ? -35 : 0}
              textAnchor={data.length > 14 ? "end" : "middle"}
              height={data.length > 14 ? 56 : 36}
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} width={36} />
            <Tooltip
              formatter={(value: number) => [value, title]}
              labelFormatter={(label) => String(label)}
              contentStyle={{ borderRadius: 10, borderColor: "#e5e7eb", fontSize: 12 }}
            />
            <Bar dataKey={dataKey} name={title} fill={color} radius={[6, 6, 2, 2]} maxBarSize={42}>
              {showValues ? (
                <LabelList
                  dataKey={dataKey}
                  position="top"
                  formatter={(value: number) => (value > 0 ? value : "")}
                  style={{ fontSize: 11, fill: "#334155", fontWeight: 700 }}
                />
              ) : null}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function AnalyticsCharts({
  dailySeries,
  weeklySeries = [],
  managersLoadSeries = [],
  periodLabel
}: Props) {
  const loadChart = buildManagerLoadChartData(managersLoadSeries);
  const chartData = enrichDailySeries(dailySeries);

  return (
    <div className="analyticsChartsStack">
      <div className="analyticsDynamicsIntro">
        <div className="analyticsLabel">Динамика · {periodLabel}</div>
        <div className="sidebarHint">Отдельные графики с числами и днями недели</div>
      </div>

      <DynamicsBarChart title="Сообщения" dataKey="messages" color="#d97706" data={chartData} />
      <DynamicsBarChart title="Новые диалоги" dataKey="dialogs" color="#2563eb" data={chartData} />
      <DynamicsBarChart title="Закрытые карточки" dataKey="closed" color="#059669" data={chartData} />

      <div className="analyticsChartCard">
        <div className="analyticsLabel">Конверсия сделок по дням</div>
        <div className="analyticsChartFrame analyticsChartFrameLarge">
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chartData} margin={{ top: 12, right: 8, left: 0, bottom: 28 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="label"
                interval={xAxisInterval(chartData.length)}
                tick={{ fontSize: 11 }}
                angle={chartData.length > 14 ? -35 : 0}
                textAnchor={chartData.length > 14 ? "end" : "middle"}
                height={chartData.length > 14 ? 56 : 36}
              />
              <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ borderRadius: 10, borderColor: "#e5e7eb", fontSize: 12 }} />
              <Legend />
              <Bar yAxisId="left" dataKey="won" name="Выиграно" fill="#059669" radius={[4, 4, 0, 0]}>
                {chartData.length <= 16 ? (
                  <LabelList dataKey="won" position="top" style={{ fontSize: 10, fill: "#166534" }} />
                ) : null}
              </Bar>
              <Bar yAxisId="left" dataKey="lost" name="Проиграно" fill="#dc2626" radius={[4, 4, 0, 0]}>
                {chartData.length <= 16 ? (
                  <LabelList dataKey="lost" position="top" style={{ fontSize: 10, fill: "#991b1b" }} />
                ) : null}
              </Bar>
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="winRate"
                name="Доля побед %"
                stroke="#2563eb"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {weeklySeries.length > 1 ? (
        <div className="analyticsChartCard">
          <div className="analyticsLabel">Конверсия по неделям</div>
          <div className="analyticsChartFrame analyticsChartFrameLarge">
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={weeklySeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: 10, borderColor: "#e5e7eb", fontSize: 12 }} />
                <Legend />
                <Bar yAxisId="left" dataKey="won" name="Выиграно" fill="#059669">
                  <LabelList dataKey="won" position="top" style={{ fontSize: 11, fill: "#166534" }} />
                </Bar>
                <Bar yAxisId="left" dataKey="lost" name="Проиграно" fill="#dc2626">
                  <LabelList dataKey="lost" position="top" style={{ fontSize: 11, fill: "#991b1b" }} />
                </Bar>
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
          <div className="analyticsLabel">Нагрузка менеджеров по дням (диалоги)</div>
          <div className="analyticsChartFrame analyticsChartFrameLarge">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={loadChart.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: 10, borderColor: "#e5e7eb", fontSize: 12 }} />
                <Legend />
                {loadChart.managers.map((name, index) => (
                  <Line
                    key={name}
                    type="monotone"
                    dataKey={name}
                    name={name}
                    stroke={COLORS[index % COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 2 }}
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
