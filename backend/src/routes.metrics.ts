import { Router } from "express";
import XLSX from "xlsx";
import {
  getAutoAssignmentStrategy,
  normalizeStrategy,
  setAutoAssignmentStrategy
} from "./auto-assignment";
import { AuthRequest } from "./auth";
import { query } from "./db";

export const metricsRouter = Router();

metricsRouter.post("/snapshots/rebuild", async (req: AuthRequest, res) => {
  const workspaceId = req.user?.workspaceId || "";
  const rawFrom = typeof req.body?.from === "string" ? req.body.from : "";
  const rawTo = typeof req.body?.to === "string" ? req.body.to : "";
  const parsed = resolveSnapshotRange(rawFrom, rawTo);
  if (!parsed) {
    res.status(400).json({ error: "invalid_period" });
    return;
  }

  const { periodStart, periodEnd } = parsed;

  const [totalDialogs] = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM conversations
     WHERE workspace_id = $1`,
    [workspaceId]
  );
  const [openDialogs] = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM conversations
     WHERE workspace_id = $1 AND status = 'open'`,
    [workspaceId]
  );
  const [closedDialogs] = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM conversations
     WHERE workspace_id = $1
       AND status = 'closed'
       AND updated_at >= $2::date
       AND updated_at < ($3::date + interval '1 day')`,
    [workspaceId, periodStart, periodEnd]
  );
  const [messages] = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM messages
     WHERE workspace_id = $1
       AND created_at >= $2::date
       AND created_at < ($3::date + interval '1 day')`,
    [workspaceId, periodStart, periodEnd]
  );

  const globals: Array<{ key: string; value: number }> = [
    { key: "total_conversations", value: Number(totalDialogs?.count || 0) },
    { key: "open_conversations", value: Number(openDialogs?.count || 0) },
    { key: "closed_conversations", value: Number(closedDialogs?.count || 0) },
    { key: "messages", value: Number(messages?.count || 0) }
  ];

  for (const item of globals) {
    await upsertMetricSnapshot(workspaceId, null, item.key, item.value, periodStart, periodEnd);
  }

  const managers = await query<{ manager_id: string; dialogs: string; outgoing: string }>(
    `SELECT
       u.id AS manager_id,
       COALESCE(h.dialogs, 0)::text AS dialogs,
       COALESCE(m.outgoing, 0)::text AS outgoing
     FROM users u
     LEFT JOIN (
       SELECT c.assigned_manager_id AS manager_id, COUNT(*)::int AS dialogs
       FROM conversations c
       WHERE c.workspace_id = $1
         AND c.assigned_manager_id IS NOT NULL
         AND c.updated_at >= $2::date
         AND c.updated_at < ($3::date + interval '1 day')
       GROUP BY c.assigned_manager_id
     ) h ON h.manager_id = u.id
     LEFT JOIN (
       SELECT msg.author_user_id AS manager_id, COUNT(*)::int AS outgoing
       FROM messages msg
       WHERE msg.workspace_id = $1
         AND msg.direction = 'outgoing'
         AND msg.author_user_id IS NOT NULL
         AND msg.created_at >= $2::date
         AND msg.created_at < ($3::date + interval '1 day')
       GROUP BY msg.author_user_id
     ) m ON m.manager_id = u.id
     WHERE u.workspace_id = $1
       AND u.role = 'manager'
       AND u.is_active = true`,
    [workspaceId, periodStart, periodEnd]
  );

  for (const row of managers) {
    await upsertMetricSnapshot(
      workspaceId,
      row.manager_id,
      "manager_dialogs_handled",
      Number(row.dialogs || 0),
      periodStart,
      periodEnd
    );
    await upsertMetricSnapshot(
      workspaceId,
      row.manager_id,
      "manager_outgoing_messages",
      Number(row.outgoing || 0),
      periodStart,
      periodEnd
    );
  }

  res.json({
    ok: true,
    periodStart,
    periodEnd,
    globalMetrics: globals.length,
    managerMetrics: managers.length * 2
  });
});

metricsRouter.get("/snapshots", async (req: AuthRequest, res) => {
  const workspaceId = req.user?.workspaceId || "";
  const rows = await query<{
    period_start: string;
    period_end: string;
    total_conversations: string;
    open_conversations: string;
    closed_conversations: string;
    messages: string;
    created_at: string;
  }>(
    `SELECT
       period_start,
       period_end,
       MAX(CASE WHEN metric_key = 'total_conversations' THEN metric_value END)::text AS total_conversations,
       MAX(CASE WHEN metric_key = 'open_conversations' THEN metric_value END)::text AS open_conversations,
       MAX(CASE WHEN metric_key = 'closed_conversations' THEN metric_value END)::text AS closed_conversations,
       MAX(CASE WHEN metric_key = 'messages' THEN metric_value END)::text AS messages,
       MAX(created_at)::text AS created_at
     FROM metric_snapshots
     WHERE workspace_id = $1
       AND manager_user_id IS NULL
       AND metric_key IN ('total_conversations', 'open_conversations', 'closed_conversations', 'messages')
     GROUP BY period_start, period_end
     ORDER BY period_end DESC, MAX(created_at) DESC
     LIMIT 12`,
    [workspaceId]
  );

  res.json(
    rows.map((row) => ({
      periodStart: row.period_start,
      periodEnd: row.period_end,
      totalConversations: Number(row.total_conversations || 0),
      openConversations: Number(row.open_conversations || 0),
      closedConversations: Number(row.closed_conversations || 0),
      messages: Number(row.messages || 0),
      createdAt: row.created_at
    }))
  );
});

metricsRouter.get("/auto-assignment-strategy", async (req: AuthRequest, res) => {
  const workspaceId = req.user?.workspaceId || "";
  const strategy = await getAutoAssignmentStrategy(workspaceId);
  res.json({ strategy });
});

metricsRouter.patch("/auto-assignment-strategy", async (req: AuthRequest, res) => {
  if (req.user?.role !== "admin") {
    res.status(403).json({ error: "forbidden" });
    return;
  }
  const workspaceId = req.user?.workspaceId || "";
  const rawStrategy = typeof req.body?.strategy === "string" ? req.body.strategy : "";
  const strategy = normalizeStrategy(rawStrategy);
  if (rawStrategy !== "round_robin" && rawStrategy !== "least_open_load") {
    res.status(400).json({ error: "invalid_strategy" });
    return;
  }
  await setAutoAssignmentStrategy(workspaceId, strategy);
  res.json({ ok: true, strategy });
});

metricsRouter.get("/auto-assignment-load", async (req: AuthRequest, res) => {
  const workspaceId = req.user?.workspaceId || "";
  const rows = await query<{
    manager_id: string;
    manager_name: string;
    open_conversations: string;
  }>(
    `SELECT
       u.id AS manager_id,
       u.full_name AS manager_name,
       COUNT(c.id)::text AS open_conversations
     FROM users u
     LEFT JOIN conversations c
       ON c.workspace_id = u.workspace_id
      AND c.assigned_manager_id = u.id
      AND c.status = 'open'
     WHERE u.workspace_id = $1
       AND u.role = 'manager'
       AND u.is_active = true
     GROUP BY u.id, u.full_name
     ORDER BY COUNT(c.id) ASC, u.full_name ASC`,
    [workspaceId]
  );

  res.json(
    rows.map((row) => ({
      managerId: row.manager_id,
      managerName: row.manager_name,
      openConversations: Number(row.open_conversations || 0)
    }))
  );
});

metricsRouter.get("/export.csv", async (req: AuthRequest, res) => {
  const workspaceId = req.user?.workspaceId || "";
  const rawDays = Number((req.query.days as string) || 14);
  const rawFrom = typeof req.query.from === "string" ? req.query.from : "";
  const rawTo = typeof req.query.to === "string" ? req.query.to : "";

  const fromDate = parseIsoDate(rawFrom);
  const toDate = parseIsoDate(rawTo);
  const hasCustomRange = Boolean(fromDate && toDate && fromDate.getTime() <= toDate.getTime());
  const presetDays = [7, 14, 30].includes(rawDays) ? rawDays : 14;
  const rangeDays = hasCustomRange
    ? Math.max(1, Math.min(90, getDiffDaysInclusive(fromDate as Date, toDate as Date)))
    : presetDays;
  const rangeParams: unknown[] = hasCustomRange ? [workspaceId, rawFrom, rawTo] : [workspaceId, rangeDays];
  const messageRangeCondition = hasCustomRange
    ? "created_at >= $2::date AND created_at < ($3::date + interval '1 day')"
    : "created_at >= date_trunc('day', now()) - (($2::int - 1) * interval '1 day')";
  const conversationUpdatedRangeCondition = hasCustomRange
    ? "updated_at >= $2::date AND updated_at < ($3::date + interval '1 day')"
    : "updated_at >= date_trunc('day', now()) - (($2::int - 1) * interval '1 day')";
  const dealUpdatedRangeCondition = hasCustomRange
    ? "d.updated_at >= $2::date AND d.updated_at < ($3::date + interval '1 day')"
    : "d.updated_at >= date_trunc('day', now()) - (($2::int - 1) * interval '1 day')";

  const [totalDialogs] = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM conversations WHERE workspace_id = $1`,
    [workspaceId]
  );
  const [openDialogs] = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM conversations WHERE workspace_id = $1 AND status = 'open'`,
    [workspaceId]
  );
  const [closedDialogs] = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM conversations
     WHERE workspace_id = $1 AND status = 'closed' AND ${conversationUpdatedRangeCondition}`,
    rangeParams
  );
  const [messages] = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM messages
     WHERE workspace_id = $1 AND ${messageRangeCondition}`,
    rangeParams
  );

  const managers = await query<{ manager_name: string; dialogs: string; outgoing: string }>(
    `SELECT
       u.full_name AS manager_name,
       COALESCE(h.dialogs, 0)::text AS dialogs,
       COALESCE(m.outgoing, 0)::text AS outgoing
     FROM users u
     LEFT JOIN (
       SELECT c.assigned_manager_id AS manager_id, COUNT(*)::int AS dialogs
       FROM conversations c
       WHERE c.workspace_id = $1
         AND c.assigned_manager_id IS NOT NULL
         AND ${conversationUpdatedRangeCondition}
       GROUP BY c.assigned_manager_id
     ) h ON h.manager_id = u.id
     LEFT JOIN (
       SELECT msg.author_user_id AS manager_id, COUNT(*)::int AS outgoing
       FROM messages msg
       WHERE msg.workspace_id = $1
         AND msg.direction = 'outgoing'
         AND msg.author_user_id IS NOT NULL
         AND ${messageRangeCondition}
       GROUP BY msg.author_user_id
     ) m ON m.manager_id = u.id
     WHERE u.workspace_id = $1
       AND u.role = 'manager'
       AND u.is_active = true
     ORDER BY u.full_name ASC`,
    rangeParams
  );

  const stages = await query<{ stage_name: string; deals_count: string; deals_amount: string }>(
    `SELECT
       COALESCE(ps.name, d.stage, 'Без этапа') AS stage_name,
       COUNT(*)::text AS deals_count,
       COALESCE(SUM(d.amount), 0)::text AS deals_amount
     FROM deals d
     LEFT JOIN pipeline_stages ps
       ON ps.workspace_id = d.workspace_id
      AND ps.name = d.stage
     WHERE d.workspace_id = $1
       AND ${dealUpdatedRangeCondition}
     GROUP BY COALESCE(ps.name, d.stage, 'Без этапа')
     ORDER BY COUNT(*) DESC`,
    rangeParams
  );

  const snapshots = await query<{
    period_start: string;
    period_end: string;
    total_conversations: string;
    open_conversations: string;
    closed_conversations: string;
    messages: string;
  }>(
    `SELECT
       period_start,
       period_end,
       MAX(CASE WHEN metric_key = 'total_conversations' THEN metric_value END)::text AS total_conversations,
       MAX(CASE WHEN metric_key = 'open_conversations' THEN metric_value END)::text AS open_conversations,
       MAX(CASE WHEN metric_key = 'closed_conversations' THEN metric_value END)::text AS closed_conversations,
       MAX(CASE WHEN metric_key = 'messages' THEN metric_value END)::text AS messages
     FROM metric_snapshots
     WHERE workspace_id = $1
       AND manager_user_id IS NULL
       AND metric_key IN ('total_conversations', 'open_conversations', 'closed_conversations', 'messages')
     GROUP BY period_start, period_end
     ORDER BY period_end DESC
     LIMIT 12`,
    [workspaceId]
  );

  const csvRows: string[][] = [];
  csvRows.push(["section", "name", "value_1", "value_2", "value_3"]);
  csvRows.push(["overview", "total_conversations", String(Number(totalDialogs?.count || 0)), "", ""]);
  csvRows.push(["overview", "open_conversations", String(Number(openDialogs?.count || 0)), "", ""]);
  csvRows.push(["overview", "closed_conversations_period", String(Number(closedDialogs?.count || 0)), "", ""]);
  csvRows.push(["overview", "messages_period", String(Number(messages?.count || 0)), "", ""]);

  for (const row of managers) {
    csvRows.push(["managers", row.manager_name, String(Number(row.dialogs || 0)), String(Number(row.outgoing || 0)), ""]);
  }
  for (const row of stages) {
    csvRows.push(["stages", row.stage_name, String(Number(row.deals_count || 0)), String(Number(row.deals_amount || 0)), ""]);
  }
  for (const row of snapshots) {
    csvRows.push([
      "snapshots",
      `${row.period_start}..${row.period_end}`,
      String(Number(row.total_conversations || 0)),
      String(Number(row.open_conversations || 0)),
      `${Number(row.closed_conversations || 0)}|${Number(row.messages || 0)}`
    ]);
  }

  const csv = csvRows.map((row) => row.map(escapeCsv).join(",")).join("\n");
  const suffix = hasCustomRange && rawFrom && rawTo ? `${rawFrom}_${rawTo}` : `${rangeDays}d`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="analytics-${suffix}.csv"`);
  res.send(csv);
});

metricsRouter.get("/export.xlsx", async (req: AuthRequest, res) => {
  const workspaceId = req.user?.workspaceId || "";
  const rawDays = Number((req.query.days as string) || 14);
  const rawFrom = typeof req.query.from === "string" ? req.query.from : "";
  const rawTo = typeof req.query.to === "string" ? req.query.to : "";

  const fromDate = parseIsoDate(rawFrom);
  const toDate = parseIsoDate(rawTo);
  const hasCustomRange = Boolean(fromDate && toDate && fromDate.getTime() <= toDate.getTime());
  const presetDays = [7, 14, 30].includes(rawDays) ? rawDays : 14;
  const rangeDays = hasCustomRange
    ? Math.max(1, Math.min(90, getDiffDaysInclusive(fromDate as Date, toDate as Date)))
    : presetDays;
  const rangeParams: unknown[] = hasCustomRange ? [workspaceId, rawFrom, rawTo] : [workspaceId, rangeDays];
  const messageRangeCondition = hasCustomRange
    ? "created_at >= $2::date AND created_at < ($3::date + interval '1 day')"
    : "created_at >= date_trunc('day', now()) - (($2::int - 1) * interval '1 day')";
  const conversationUpdatedRangeCondition = hasCustomRange
    ? "updated_at >= $2::date AND updated_at < ($3::date + interval '1 day')"
    : "updated_at >= date_trunc('day', now()) - (($2::int - 1) * interval '1 day')";
  const dealUpdatedRangeCondition = hasCustomRange
    ? "d.updated_at >= $2::date AND d.updated_at < ($3::date + interval '1 day')"
    : "d.updated_at >= date_trunc('day', now()) - (($2::int - 1) * interval '1 day')";

  const [totalDialogs] = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM conversations WHERE workspace_id = $1`,
    [workspaceId]
  );
  const [openDialogs] = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM conversations WHERE workspace_id = $1 AND status = 'open'`,
    [workspaceId]
  );
  const [closedDialogs] = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM conversations
     WHERE workspace_id = $1 AND status = 'closed' AND ${conversationUpdatedRangeCondition}`,
    rangeParams
  );
  const [messages] = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM messages
     WHERE workspace_id = $1 AND ${messageRangeCondition}`,
    rangeParams
  );

  const managers = await query<{ manager_name: string; dialogs: string; outgoing: string }>(
    `SELECT
       u.full_name AS manager_name,
       COALESCE(h.dialogs, 0)::text AS dialogs,
       COALESCE(m.outgoing, 0)::text AS outgoing
     FROM users u
     LEFT JOIN (
       SELECT c.assigned_manager_id AS manager_id, COUNT(*)::int AS dialogs
       FROM conversations c
       WHERE c.workspace_id = $1
         AND c.assigned_manager_id IS NOT NULL
         AND ${conversationUpdatedRangeCondition}
       GROUP BY c.assigned_manager_id
     ) h ON h.manager_id = u.id
     LEFT JOIN (
       SELECT msg.author_user_id AS manager_id, COUNT(*)::int AS outgoing
       FROM messages msg
       WHERE msg.workspace_id = $1
         AND msg.direction = 'outgoing'
         AND msg.author_user_id IS NOT NULL
         AND ${messageRangeCondition}
       GROUP BY msg.author_user_id
     ) m ON m.manager_id = u.id
     WHERE u.workspace_id = $1
       AND u.role = 'manager'
       AND u.is_active = true
     ORDER BY u.full_name ASC`,
    rangeParams
  );

  const stages = await query<{ stage_name: string; deals_count: string; deals_amount: string }>(
    `SELECT
       COALESCE(ps.name, d.stage, 'Без этапа') AS stage_name,
       COUNT(*)::text AS deals_count,
       COALESCE(SUM(d.amount), 0)::text AS deals_amount
     FROM deals d
     LEFT JOIN pipeline_stages ps
       ON ps.workspace_id = d.workspace_id
      AND ps.name = d.stage
     WHERE d.workspace_id = $1
       AND ${dealUpdatedRangeCondition}
     GROUP BY COALESCE(ps.name, d.stage, 'Без этапа')
     ORDER BY COUNT(*) DESC`,
    rangeParams
  );

  const snapshots = await query<{
    period_start: string;
    period_end: string;
    total_conversations: string;
    open_conversations: string;
    closed_conversations: string;
    messages: string;
  }>(
    `SELECT
       period_start,
       period_end,
       MAX(CASE WHEN metric_key = 'total_conversations' THEN metric_value END)::text AS total_conversations,
       MAX(CASE WHEN metric_key = 'open_conversations' THEN metric_value END)::text AS open_conversations,
       MAX(CASE WHEN metric_key = 'closed_conversations' THEN metric_value END)::text AS closed_conversations,
       MAX(CASE WHEN metric_key = 'messages' THEN metric_value END)::text AS messages
     FROM metric_snapshots
     WHERE workspace_id = $1
       AND manager_user_id IS NULL
       AND metric_key IN ('total_conversations', 'open_conversations', 'closed_conversations', 'messages')
     GROUP BY period_start, period_end
     ORDER BY period_end DESC
     LIMIT 12`,
    [workspaceId]
  );

  const dailyRows = hasCustomRange
    ? await query<{ day: string; messages: string; dialogs: string; closed: string }>(
        `WITH days AS (
           SELECT generate_series($2::date, $3::date, interval '1 day') AS day
         ),
         msg AS (
           SELECT date_trunc('day', created_at) AS day, COUNT(*)::int AS cnt
           FROM messages
           WHERE workspace_id = $1 AND created_at >= $2::date AND created_at < ($3::date + interval '1 day')
           GROUP BY 1
         ),
         conv AS (
           SELECT date_trunc('day', created_at) AS day, COUNT(*)::int AS cnt
           FROM conversations
           WHERE workspace_id = $1 AND created_at >= $2::date AND created_at < ($3::date + interval '1 day')
           GROUP BY 1
         ),
         cls AS (
           SELECT date_trunc('day', updated_at) AS day, COUNT(*)::int AS cnt
           FROM conversations
           WHERE workspace_id = $1 AND status = 'closed' AND updated_at >= $2::date AND updated_at < ($3::date + interval '1 day')
           GROUP BY 1
         )
         SELECT to_char(days.day, 'YYYY-MM-DD') AS day,
                COALESCE(msg.cnt, 0)::text AS messages,
                COALESCE(conv.cnt, 0)::text AS dialogs,
                COALESCE(cls.cnt, 0)::text AS closed
         FROM days
         LEFT JOIN msg ON msg.day = days.day
         LEFT JOIN conv ON conv.day = days.day
         LEFT JOIN cls ON cls.day = days.day
         ORDER BY days.day ASC`,
        [workspaceId, rawFrom, rawTo]
      )
    : await query<{ day: string; messages: string; dialogs: string; closed: string }>(
        `WITH days AS (
           SELECT generate_series(
             date_trunc('day', now()) - (($2::int - 1) * interval '1 day'),
             date_trunc('day', now()),
             interval '1 day'
           ) AS day
         ),
         msg AS (
           SELECT date_trunc('day', created_at) AS day, COUNT(*)::int AS cnt
           FROM messages
           WHERE workspace_id = $1 AND created_at >= date_trunc('day', now()) - (($2::int - 1) * interval '1 day')
           GROUP BY 1
         ),
         conv AS (
           SELECT date_trunc('day', created_at) AS day, COUNT(*)::int AS cnt
           FROM conversations
           WHERE workspace_id = $1 AND created_at >= date_trunc('day', now()) - (($2::int - 1) * interval '1 day')
           GROUP BY 1
         ),
         cls AS (
           SELECT date_trunc('day', updated_at) AS day, COUNT(*)::int AS cnt
           FROM conversations
           WHERE workspace_id = $1 AND status = 'closed' AND updated_at >= date_trunc('day', now()) - (($2::int - 1) * interval '1 day')
           GROUP BY 1
         )
         SELECT to_char(days.day, 'YYYY-MM-DD') AS day,
                COALESCE(msg.cnt, 0)::text AS messages,
                COALESCE(conv.cnt, 0)::text AS dialogs,
                COALESCE(cls.cnt, 0)::text AS closed
         FROM days
         LEFT JOIN msg ON msg.day = days.day
         LEFT JOIN conv ON conv.day = days.day
         LEFT JOIN cls ON cls.day = days.day
         ORDER BY days.day ASC`,
        [workspaceId, rangeDays]
      );

  const workbook = XLSX.utils.book_new();
  const periodLabel = hasCustomRange ? `${rawFrom}..${rawTo}` : `${rangeDays}d`;

  const metaRows = [
    ["Параметр", "Значение"],
    ["Время генерации", new Date().toISOString()],
    ["Режим периода", hasCustomRange ? "Пользовательский" : "Пресет"],
    ["Период", periodLabel],
    ["Workspace ID", workspaceId]
  ];
  const metaSheet = XLSX.utils.aoa_to_sheet(metaRows);
  applyAutoWidth(metaSheet);
  applyAutoFilter(metaSheet);
  applyFreezeHeader(metaSheet);
  XLSX.utils.book_append_sheet(workbook, metaSheet, "Отчет");

  const overviewRows = [
    ["Метрика", "Значение"],
    ["Период", periodLabel],
    ["Всего диалогов", Number(totalDialogs?.count || 0)],
    ["Открытые диалоги", Number(openDialogs?.count || 0)],
    ["Закрытые за период", Number(closedDialogs?.count || 0)],
    ["Сообщения за период", Number(messages?.count || 0)]
  ];
  const overviewSheet = XLSX.utils.aoa_to_sheet(overviewRows);
  applyAutoWidth(overviewSheet);
  applyAutoFilter(overviewSheet);
  applyFreezeHeader(overviewSheet);
  XLSX.utils.book_append_sheet(workbook, overviewSheet, "Сводка");

  const managerRows = [
    ["Менеджер", "Диалогов обработано", "Исходящих сообщений"],
    ...managers.map((row) => [row.manager_name, Number(row.dialogs || 0), Number(row.outgoing || 0)]),
    [
      "ИТОГО",
      managers.reduce((sum, row) => sum + Number(row.dialogs || 0), 0),
      managers.reduce((sum, row) => sum + Number(row.outgoing || 0), 0)
    ]
  ];
  const managersSheet = XLSX.utils.aoa_to_sheet(managerRows);
  applyAutoWidth(managersSheet);
  applyAutoFilter(managersSheet);
  applyFreezeHeader(managersSheet);
  XLSX.utils.book_append_sheet(workbook, managersSheet, "Менеджеры");

  const stageRows = [
    ["Этап", "Сделок", "Сумма"],
    ...stages.map((row) => [row.stage_name, Number(row.deals_count || 0), Number(row.deals_amount || 0)]),
    [
      "ИТОГО",
      stages.reduce((sum, row) => sum + Number(row.deals_count || 0), 0),
      stages.reduce((sum, row) => sum + Number(row.deals_amount || 0), 0)
    ]
  ];
  const stagesSheet = XLSX.utils.aoa_to_sheet(stageRows);
  applyAutoWidth(stagesSheet);
  applyAutoFilter(stagesSheet);
  applyFreezeHeader(stagesSheet);
  applyNumberFormatByColumn(stagesSheet, 2, "#,##0.00");
  XLSX.utils.book_append_sheet(workbook, stagesSheet, "Этапы");

  const snapshotRows = [
    ["Период с", "Период по", "Всего диалогов", "Открытые", "Закрытые", "Сообщения"],
    ...snapshots.map((row) => [
      row.period_start,
      row.period_end,
      Number(row.total_conversations || 0),
      Number(row.open_conversations || 0),
      Number(row.closed_conversations || 0),
      Number(row.messages || 0)
    ])
  ];
  const snapshotsSheet = XLSX.utils.aoa_to_sheet(snapshotRows);
  applyAutoWidth(snapshotsSheet);
  applyAutoFilter(snapshotsSheet);
  applyFreezeHeader(snapshotsSheet);
  XLSX.utils.book_append_sheet(workbook, snapshotsSheet, "Снимки");

  const trendRows = [
    ["Дата", "Сообщения", "Новые диалоги", "Закрытые диалоги"],
    ...dailyRows.map((row) => [
      row.day,
      Number(row.messages || 0),
      Number(row.dialogs || 0),
      Number(row.closed || 0)
    ])
  ];
  const trendSheet = XLSX.utils.aoa_to_sheet(trendRows);
  applyAutoWidth(trendSheet);
  applyAutoFilter(trendSheet);
  applyFreezeHeader(trendSheet);
  XLSX.utils.book_append_sheet(workbook, trendSheet, "Динамика");

  const topManagers = managers
    .map((row) => ({
      manager: row.manager_name,
      dialogs: Number(row.dialogs || 0),
      outgoing: Number(row.outgoing || 0)
    }))
    .sort((a, b) => (b.dialogs !== a.dialogs ? b.dialogs - a.dialogs : b.outgoing - a.outgoing))
    .slice(0, 5);
  const topStages = stages
    .map((row) => ({
      stage: row.stage_name,
      deals: Number(row.deals_count || 0),
      amount: Number(row.deals_amount || 0)
    }))
    .sort((a, b) => (b.amount !== a.amount ? b.amount - a.amount : b.deals - a.deals))
    .slice(0, 5);

  const topRows: Array<Array<string | number>> = [
    ["ТОП-5 менеджеров", "", ""],
    ["Менеджер", "Диалогов", "Исходящих"],
    ...topManagers.map((row) => [row.manager, row.dialogs, row.outgoing]),
    ["", "", ""],
    ["ТОП-5 этапов", "", ""],
    ["Этап", "Сделок", "Сумма"],
    ...topStages.map((row) => [row.stage, row.deals, row.amount])
  ];
  const topSheet = XLSX.utils.aoa_to_sheet(topRows);
  applyAutoWidth(topSheet);
  applyNumberFormatByColumn(topSheet, 2, "#,##0.00");
  XLSX.utils.book_append_sheet(workbook, topSheet, "Топ-5");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const suffix = hasCustomRange && rawFrom && rawTo ? `${rawFrom}_${rawTo}` : `${rangeDays}d`;
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", `attachment; filename="analytics-${suffix}.xlsx"`);
  res.send(buffer);
});

metricsRouter.get("/overview", async (req: AuthRequest, res) => {
  const workspaceId = req.user?.workspaceId;
  const rawDays = Number((req.query.days as string) || 14);
  const rawFrom = typeof req.query.from === "string" ? req.query.from : "";
  const rawTo = typeof req.query.to === "string" ? req.query.to : "";

  const fromDate = parseIsoDate(rawFrom);
  const toDate = parseIsoDate(rawTo);
  const hasCustomRange = Boolean(fromDate && toDate && fromDate.getTime() <= toDate.getTime());
  const presetDays = [7, 14, 30].includes(rawDays) ? rawDays : 14;
  const rangeDays = hasCustomRange
    ? Math.max(1, Math.min(90, getDiffDaysInclusive(fromDate as Date, toDate as Date)))
    : presetDays;
  const rangeParams: unknown[] = hasCustomRange ? [workspaceId, rawFrom, rawTo] : [workspaceId, rangeDays];
  const messageRangeCondition = hasCustomRange
    ? "created_at >= $2::date AND created_at < ($3::date + interval '1 day')"
    : "created_at >= date_trunc('day', now()) - (($2::int - 1) * interval '1 day')";
  const conversationUpdatedRangeCondition = hasCustomRange
    ? "updated_at >= $2::date AND updated_at < ($3::date + interval '1 day')"
    : "updated_at >= date_trunc('day', now()) - (($2::int - 1) * interval '1 day')";
  const dealUpdatedRangeCondition = hasCustomRange
    ? "d.updated_at >= $2::date AND d.updated_at < ($3::date + interval '1 day')"
    : "d.updated_at >= date_trunc('day', now()) - (($2::int - 1) * interval '1 day')";

  const [sent] = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM messages
     WHERE workspace_id = $1 AND direction = 'outgoing' AND ${messageRangeCondition}`,
    rangeParams
  );

  const [handled] = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM conversations
     WHERE workspace_id = $1 AND ${conversationUpdatedRangeCondition}`,
    rangeParams
  );

  const [totalDialogs] = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM conversations
     WHERE workspace_id = $1`,
    [workspaceId]
  );

  const [openDialogs] = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM conversations
     WHERE workspace_id = $1 AND status = 'open'`,
    [workspaceId]
  );

  const [closedDialogs7d] = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM conversations
     WHERE workspace_id = $1 AND status = 'closed' AND ${conversationUpdatedRangeCondition}`,
    rangeParams
  );

  const [messages7d] = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM messages
     WHERE workspace_id = $1 AND ${messageRangeCondition}`,
    rangeParams
  );

  const [frt] = await query<{ avg_minutes: string }>(
    `WITH first_incoming AS (
       SELECT conversation_id, MIN(created_at) AS in_time
       FROM messages
       WHERE workspace_id = $1 AND direction = 'incoming'
       GROUP BY conversation_id
     ), first_outgoing AS (
       SELECT m.conversation_id, MIN(m.created_at) AS out_time
       FROM messages m
       JOIN first_incoming fi ON fi.conversation_id = m.conversation_id
       WHERE m.workspace_id = $1 AND m.direction = 'outgoing' AND m.created_at > fi.in_time
       GROUP BY m.conversation_id
     )
     SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (fo.out_time - fi.in_time)) / 60)), 0)::text AS avg_minutes
     FROM first_incoming fi
     JOIN first_outgoing fo ON fo.conversation_id = fi.conversation_id`,
    [workspaceId]
  );

  const [openToClose] = await query<{ avg_minutes: string }>(
    `SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 60)), 0)::text AS avg_minutes
     FROM conversations
     WHERE workspace_id = $1 AND status = 'closed'`,
    [workspaceId]
  );

  const [avgMessagesPerDialog] = await query<{ avg_messages: string }>(
    `WITH dialog_messages AS (
       SELECT c.id, COUNT(m.id)::numeric AS msg_count
       FROM conversations c
       LEFT JOIN messages m ON m.conversation_id = c.id
       WHERE c.workspace_id = $1
       GROUP BY c.id
     )
     SELECT COALESCE(ROUND(AVG(msg_count), 1), 0)::text AS avg_messages
     FROM dialog_messages`,
    [workspaceId]
  );

  const [whatsappDialogs] = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM conversations
     WHERE workspace_id = $1 AND channel = 'whatsapp'`,
    [workspaceId]
  );

  const [telegramDialogs] = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM conversations
     WHERE workspace_id = $1 AND channel = 'telegram'`,
    [workspaceId]
  );

  const [instagramDialogs] = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM conversations
     WHERE workspace_id = $1 AND channel = 'instagram'`,
    [workspaceId]
  );

  const [emailDialogs] = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM conversations
     WHERE workspace_id = $1 AND channel = 'email'`,
    [workspaceId]
  );

  const [webDialogs] = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM conversations
     WHERE workspace_id = $1 AND channel IN ('web', 'webchat')`,
    [workspaceId]
  );

  const [salesTotals] = await query<{
    total_deals: string;
    won_deals: string;
    lost_deals: string;
    won_amount: string;
    pipeline_amount: string;
  }>(
    `SELECT
       COUNT(*)::text AS total_deals,
       COUNT(*) FILTER (WHERE COALESCE(ps.outcome, 'open') = 'won')::text AS won_deals,
       COUNT(*) FILTER (WHERE COALESCE(ps.outcome, 'open') = 'lost')::text AS lost_deals,
       COALESCE(SUM(d.amount) FILTER (WHERE COALESCE(ps.outcome, 'open') = 'won'), 0)::text AS won_amount,
       COALESCE(SUM(d.amount), 0)::text AS pipeline_amount
     FROM deals d
     LEFT JOIN pipeline_stages ps
       ON ps.workspace_id = d.workspace_id
      AND lower(ps.name) = lower(d.stage)
     WHERE d.workspace_id = $1
       AND ${dealUpdatedRangeCondition}`,
    rangeParams
  );

  const managersKpi = await query<{
    manager_id: string;
    manager_name: string;
    dialogs_handled: string;
    outgoing_messages: string;
    won_deals: string;
    lost_deals: string;
    won_amount: string;
    avg_first_response_minutes: string;
    overdue_sla_count: string;
  }>(
    `SELECT
       u.id AS manager_id,
       u.full_name AS manager_name,
       COALESCE(handled.dialogs_handled, 0)::text AS dialogs_handled,
       COALESCE(msg.outgoing_messages, 0)::text AS outgoing_messages,
       COALESCE(deals.won_deals, 0)::text AS won_deals,
       COALESCE(deals.lost_deals, 0)::text AS lost_deals,
       COALESCE(deals.won_amount, 0)::text AS won_amount,
       COALESCE(frt.avg_minutes, 0)::text AS avg_first_response_minutes,
       COALESCE(sla.overdue_sla_count, 0)::text AS overdue_sla_count
     FROM users u
     LEFT JOIN (
       SELECT c.assigned_manager_id AS manager_id, COUNT(*)::int AS dialogs_handled
       FROM conversations c
       WHERE c.workspace_id = $1
         AND c.assigned_manager_id IS NOT NULL
         AND ${conversationUpdatedRangeCondition}
       GROUP BY c.assigned_manager_id
     ) handled ON handled.manager_id = u.id
     LEFT JOIN (
       SELECT m.author_user_id AS manager_id, COUNT(*)::int AS outgoing_messages
       FROM messages m
       WHERE m.workspace_id = $1
         AND m.direction = 'outgoing'
         AND m.author_user_id IS NOT NULL
         AND ${messageRangeCondition}
       GROUP BY m.author_user_id
     ) msg ON msg.manager_id = u.id
     LEFT JOIN (
       SELECT COALESCE(d.owner_user_id, c.assigned_manager_id) AS manager_id,
              COUNT(*) FILTER (WHERE COALESCE(ps.outcome, 'open') = 'won')::int AS won_deals,
              COUNT(*) FILTER (WHERE COALESCE(ps.outcome, 'open') = 'lost')::int AS lost_deals,
              COALESCE(SUM(d.amount) FILTER (WHERE COALESCE(ps.outcome, 'open') = 'won'), 0)::float8 AS won_amount
       FROM deals d
       JOIN conversations c ON c.id = d.conversation_id
       LEFT JOIN pipeline_stages ps
         ON ps.workspace_id = d.workspace_id
        AND lower(ps.name) = lower(d.stage)
       WHERE d.workspace_id = $1
         AND ${dealUpdatedRangeCondition}
         AND COALESCE(d.owner_user_id, c.assigned_manager_id) IS NOT NULL
       GROUP BY 1
     ) deals ON deals.manager_id = u.id
     LEFT JOIN (
       WITH first_incoming AS (
         SELECT conversation_id, MIN(created_at) AS in_time
         FROM messages
         WHERE workspace_id = $1 AND direction = 'incoming'
         GROUP BY conversation_id
       ), first_outgoing AS (
         SELECT m.conversation_id, MIN(m.created_at) AS out_time
         FROM messages m
         JOIN first_incoming fi ON fi.conversation_id = m.conversation_id
         WHERE m.workspace_id = $1 AND m.direction = 'outgoing' AND m.created_at > fi.in_time
         GROUP BY m.conversation_id
       )
       SELECT c.assigned_manager_id AS manager_id,
              COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (fo.out_time - fi.in_time)) / 60)), 0)::int AS avg_minutes
       FROM conversations c
       JOIN first_incoming fi ON fi.conversation_id = c.id
       JOIN first_outgoing fo ON fo.conversation_id = c.id
       WHERE c.workspace_id = $1
         AND c.assigned_manager_id IS NOT NULL
       GROUP BY c.assigned_manager_id
     ) frt ON frt.manager_id = u.id
     LEFT JOIN (
       SELECT c.assigned_manager_id AS manager_id, COUNT(*)::int AS overdue_sla_count
       FROM conversations c
       WHERE c.workspace_id = $1
         AND c.assigned_manager_id IS NOT NULL
         AND c.status = 'open'
         AND c.first_response_due_at IS NOT NULL
         AND c.first_response_due_at < now()
         AND EXISTS (
           SELECT 1
           FROM messages mi
           WHERE mi.conversation_id = c.id
             AND mi.direction = 'incoming'
             AND mi.created_at > COALESCE((
               SELECT MAX(mo.created_at)
               FROM messages mo
               WHERE mo.conversation_id = c.id
                 AND mo.direction = 'outgoing'
             ), '1970-01-01'::timestamp)
         )
       GROUP BY c.assigned_manager_id
     ) sla ON sla.manager_id = u.id
     WHERE u.workspace_id = $1
       AND u.role = 'manager'
       AND u.is_active = true
     ORDER BY COALESCE(deals.won_amount, 0) DESC,
              COALESCE(handled.dialogs_handled, 0) DESC,
              u.full_name ASC`,
    rangeParams
  );

  const [leadsInPeriod] = await query<{ count: string }>(
    hasCustomRange
      ? `SELECT COUNT(*)::text AS count
         FROM conversations
         WHERE workspace_id = $1
           AND created_at >= $2::date
           AND created_at < ($3::date + interval '1 day')`
      : `SELECT COUNT(*)::text AS count
         FROM conversations
         WHERE workspace_id = $1
           AND created_at >= date_trunc('day', now()) - (($2::int - 1) * interval '1 day')`,
    rangeParams
  );

  const stageKpi = await query<{
    stage_name: string;
    deals_count: string;
    deals_amount: string;
  }>(
    `SELECT
       COALESCE(ps.name, d.stage, 'Без этапа') AS stage_name,
       COUNT(*)::text AS deals_count,
       COALESCE(SUM(d.amount), 0)::text AS deals_amount
     FROM deals d
     JOIN conversations c ON c.id = d.conversation_id
     LEFT JOIN pipeline_stages ps
       ON ps.workspace_id = d.workspace_id
      AND ps.name = d.stage
     WHERE d.workspace_id = $1
       AND ${dealUpdatedRangeCondition}
     GROUP BY COALESCE(ps.name, d.stage, 'Без этапа')
     ORDER BY COUNT(*) DESC, COALESCE(SUM(d.amount), 0) DESC`,
    rangeParams
  );

  const [slaEscalations] = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM conversations c
     WHERE c.workspace_id = $1
       AND c.status = 'open'
       AND c.first_response_due_at IS NOT NULL
       AND c.first_response_due_at < now()
       AND EXISTS (
         SELECT 1
         FROM messages mi
         WHERE mi.conversation_id = c.id
           AND mi.direction = 'incoming'
           AND mi.created_at > COALESCE((
             SELECT MAX(mo.created_at)
             FROM messages mo
             WHERE mo.conversation_id = c.id
               AND mo.direction = 'outgoing'
           ), '1970-01-01'::timestamp)
       )`,
    [workspaceId]
  );

  const [slaAvgDelay] = await query<{ avg_minutes: string }>(
    `SELECT COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (now() - c.first_response_due_at)) / 60)), 0)::text AS avg_minutes
     FROM conversations c
     WHERE c.workspace_id = $1
       AND c.status = 'open'
       AND c.first_response_due_at IS NOT NULL
       AND c.first_response_due_at < now()
       AND EXISTS (
         SELECT 1
         FROM messages mi
         WHERE mi.conversation_id = c.id
           AND mi.direction = 'incoming'
           AND mi.created_at > COALESCE((
             SELECT MAX(mo.created_at)
             FROM messages mo
             WHERE mo.conversation_id = c.id
               AND mo.direction = 'outgoing'
           ), '1970-01-01'::timestamp)
       )`,
    [workspaceId]
  );

  const slaManagers = await query<{
    manager_id: string;
    manager_name: string;
    escalated_count: string;
    avg_delay_minutes: string;
  }>(
    `SELECT
       u.id AS manager_id,
       u.full_name AS manager_name,
       COUNT(c.id)::text AS escalated_count,
       COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (now() - c.first_response_due_at)) / 60)), 0)::text AS avg_delay_minutes
     FROM users u
     LEFT JOIN conversations c
       ON c.workspace_id = u.workspace_id
      AND c.assigned_manager_id = u.id
      AND c.status = 'open'
      AND c.first_response_due_at IS NOT NULL
      AND c.first_response_due_at < now()
      AND EXISTS (
        SELECT 1
        FROM messages mi
        WHERE mi.conversation_id = c.id
          AND mi.direction = 'incoming'
          AND mi.created_at > COALESCE((
            SELECT MAX(mo.created_at)
            FROM messages mo
            WHERE mo.conversation_id = c.id
              AND mo.direction = 'outgoing'
          ), '1970-01-01'::timestamp)
      )
     WHERE u.workspace_id = $1
       AND u.role = 'manager'
       AND u.is_active = true
     GROUP BY u.id, u.full_name
     ORDER BY COUNT(c.id) DESC, u.full_name ASC`,
    [workspaceId]
  );

  const dailyRows = hasCustomRange
    ? await query<{
        day: string;
        messages: string;
        dialogs: string;
        closed: string;
        won: string;
        lost: string;
      }>(
        `WITH days AS (
           SELECT generate_series($2::date, $3::date, interval '1 day') AS day
         ),
         msg AS (
           SELECT date_trunc('day', created_at) AS day, COUNT(*)::int AS cnt
           FROM messages
           WHERE workspace_id = $1 AND created_at >= $2::date AND created_at < ($3::date + interval '1 day')
           GROUP BY 1
         ),
         conv AS (
           SELECT date_trunc('day', created_at) AS day, COUNT(*)::int AS cnt
           FROM conversations
           WHERE workspace_id = $1 AND created_at >= $2::date AND created_at < ($3::date + interval '1 day')
           GROUP BY 1
         ),
         cls AS (
           SELECT date_trunc('day', updated_at) AS day, COUNT(*)::int AS cnt
           FROM conversations
           WHERE workspace_id = $1 AND status = 'closed' AND updated_at >= $2::date AND updated_at < ($3::date + interval '1 day')
           GROUP BY 1
         ),
         deals_by_day AS (
           SELECT date_trunc('day', d.updated_at) AS day,
                  COUNT(*) FILTER (WHERE COALESCE(ps.outcome, 'open') = 'won')::int AS won,
                  COUNT(*) FILTER (WHERE COALESCE(ps.outcome, 'open') = 'lost')::int AS lost
           FROM deals d
           LEFT JOIN pipeline_stages ps
             ON ps.workspace_id = d.workspace_id
            AND lower(ps.name) = lower(d.stage)
           WHERE d.workspace_id = $1
             AND d.updated_at >= $2::date
             AND d.updated_at < ($3::date + interval '1 day')
           GROUP BY 1
         )
         SELECT to_char(days.day, 'DD.MM') AS day,
                COALESCE(msg.cnt, 0)::text AS messages,
                COALESCE(conv.cnt, 0)::text AS dialogs,
                COALESCE(cls.cnt, 0)::text AS closed,
                COALESCE(deals_by_day.won, 0)::text AS won,
                COALESCE(deals_by_day.lost, 0)::text AS lost
         FROM days
         LEFT JOIN msg ON msg.day = days.day
         LEFT JOIN conv ON conv.day = days.day
         LEFT JOIN cls ON cls.day = days.day
         LEFT JOIN deals_by_day ON deals_by_day.day = days.day
         ORDER BY days.day ASC`,
        [workspaceId, rawFrom, rawTo]
      )
    : await query<{
        day: string;
        messages: string;
        dialogs: string;
        closed: string;
        won: string;
        lost: string;
      }>(
        `WITH days AS (
           SELECT generate_series(
             date_trunc('day', now()) - (($2::int - 1) * interval '1 day'),
             date_trunc('day', now()),
             interval '1 day'
           ) AS day
         ),
         msg AS (
           SELECT date_trunc('day', created_at) AS day, COUNT(*)::int AS cnt
           FROM messages
           WHERE workspace_id = $1 AND created_at >= date_trunc('day', now()) - (($2::int - 1) * interval '1 day')
           GROUP BY 1
         ),
         conv AS (
           SELECT date_trunc('day', created_at) AS day, COUNT(*)::int AS cnt
           FROM conversations
           WHERE workspace_id = $1 AND created_at >= date_trunc('day', now()) - (($2::int - 1) * interval '1 day')
           GROUP BY 1
         ),
         cls AS (
           SELECT date_trunc('day', updated_at) AS day, COUNT(*)::int AS cnt
           FROM conversations
           WHERE workspace_id = $1 AND status = 'closed' AND updated_at >= date_trunc('day', now()) - (($2::int - 1) * interval '1 day')
           GROUP BY 1
         ),
         deals_by_day AS (
           SELECT date_trunc('day', d.updated_at) AS day,
                  COUNT(*) FILTER (WHERE COALESCE(ps.outcome, 'open') = 'won')::int AS won,
                  COUNT(*) FILTER (WHERE COALESCE(ps.outcome, 'open') = 'lost')::int AS lost
           FROM deals d
           LEFT JOIN pipeline_stages ps
             ON ps.workspace_id = d.workspace_id
            AND lower(ps.name) = lower(d.stage)
           WHERE d.workspace_id = $1
             AND d.updated_at >= date_trunc('day', now()) - (($2::int - 1) * interval '1 day')
           GROUP BY 1
         )
         SELECT to_char(days.day, 'DD.MM') AS day,
                COALESCE(msg.cnt, 0)::text AS messages,
                COALESCE(conv.cnt, 0)::text AS dialogs,
                COALESCE(cls.cnt, 0)::text AS closed,
                COALESCE(deals_by_day.won, 0)::text AS won,
                COALESCE(deals_by_day.lost, 0)::text AS lost
         FROM days
         LEFT JOIN msg ON msg.day = days.day
         LEFT JOIN conv ON conv.day = days.day
         LEFT JOIN cls ON cls.day = days.day
         LEFT JOIN deals_by_day ON deals_by_day.day = days.day
         ORDER BY days.day ASC`,
        [workspaceId, rangeDays]
      );

  const managersLoadRows = hasCustomRange
    ? await query<{
        day: string;
        manager_id: string;
        manager_name: string;
        dialogs_handled: string;
        outgoing_messages: string;
      }>(
        `WITH days AS (
           SELECT generate_series($2::date, $3::date, interval '1 day') AS day
         ),
         managers AS (
           SELECT id, full_name
           FROM users
           WHERE workspace_id = $1 AND role = 'manager' AND is_active = true
         ),
         grid AS (
           SELECT days.day, managers.id AS manager_id, managers.full_name AS manager_name
           FROM days CROSS JOIN managers
         ),
         handled AS (
           SELECT date_trunc('day', c.updated_at) AS day,
                  c.assigned_manager_id AS manager_id,
                  COUNT(*)::int AS cnt
           FROM conversations c
           WHERE c.workspace_id = $1
             AND c.assigned_manager_id IS NOT NULL
             AND c.updated_at >= $2::date
             AND c.updated_at < ($3::date + interval '1 day')
           GROUP BY 1, 2
         ),
         outgoing AS (
           SELECT date_trunc('day', m.created_at) AS day,
                  m.author_user_id AS manager_id,
                  COUNT(*)::int AS cnt
           FROM messages m
           WHERE m.workspace_id = $1
             AND m.direction = 'outgoing'
             AND m.author_user_id IS NOT NULL
             AND m.created_at >= $2::date
             AND m.created_at < ($3::date + interval '1 day')
           GROUP BY 1, 2
         )
         SELECT to_char(grid.day, 'DD.MM') AS day,
                grid.manager_id::text AS manager_id,
                grid.manager_name,
                COALESCE(handled.cnt, 0)::text AS dialogs_handled,
                COALESCE(outgoing.cnt, 0)::text AS outgoing_messages
         FROM grid
         LEFT JOIN handled ON handled.day = grid.day AND handled.manager_id = grid.manager_id
         LEFT JOIN outgoing ON outgoing.day = grid.day AND outgoing.manager_id = grid.manager_id
         ORDER BY grid.day ASC, grid.manager_name ASC`,
        [workspaceId, rawFrom, rawTo]
      )
    : await query<{
        day: string;
        manager_id: string;
        manager_name: string;
        dialogs_handled: string;
        outgoing_messages: string;
      }>(
        `WITH days AS (
           SELECT generate_series(
             date_trunc('day', now()) - (($2::int - 1) * interval '1 day'),
             date_trunc('day', now()),
             interval '1 day'
           ) AS day
         ),
         managers AS (
           SELECT id, full_name
           FROM users
           WHERE workspace_id = $1 AND role = 'manager' AND is_active = true
         ),
         grid AS (
           SELECT days.day, managers.id AS manager_id, managers.full_name AS manager_name
           FROM days CROSS JOIN managers
         ),
         handled AS (
           SELECT date_trunc('day', c.updated_at) AS day,
                  c.assigned_manager_id AS manager_id,
                  COUNT(*)::int AS cnt
           FROM conversations c
           WHERE c.workspace_id = $1
             AND c.assigned_manager_id IS NOT NULL
             AND c.updated_at >= date_trunc('day', now()) - (($2::int - 1) * interval '1 day')
           GROUP BY 1, 2
         ),
         outgoing AS (
           SELECT date_trunc('day', m.created_at) AS day,
                  m.author_user_id AS manager_id,
                  COUNT(*)::int AS cnt
           FROM messages m
           WHERE m.workspace_id = $1
             AND m.direction = 'outgoing'
             AND m.author_user_id IS NOT NULL
             AND m.created_at >= date_trunc('day', now()) - (($2::int - 1) * interval '1 day')
           GROUP BY 1, 2
         )
         SELECT to_char(grid.day, 'DD.MM') AS day,
                grid.manager_id::text AS manager_id,
                grid.manager_name,
                COALESCE(handled.cnt, 0)::text AS dialogs_handled,
                COALESCE(outgoing.cnt, 0)::text AS outgoing_messages
         FROM grid
         LEFT JOIN handled ON handled.day = grid.day AND handled.manager_id = grid.manager_id
         LEFT JOIN outgoing ON outgoing.day = grid.day AND outgoing.manager_id = grid.manager_id
         ORDER BY grid.day ASC, grid.manager_name ASC`,
        [workspaceId, rangeDays]
      );

  const dailySeries = dailyRows.map((row) => {
    const won = Number(row.won || 0);
    const lost = Number(row.lost || 0);
    const decided = won + lost;
    return {
      day: row.day,
      messages: Number(row.messages || 0),
      dialogs: Number(row.dialogs || 0),
      closed: Number(row.closed || 0),
      won,
      lost,
      winRate: decided > 0 ? Math.round((won / decided) * 100) : 0
    };
  });

  const weeklyMap = new Map<
    string,
    { week: string; messages: number; dialogs: number; closed: number; won: number; lost: number }
  >();
  for (let index = 0; index < dailySeries.length; index += 1) {
    const row = dailySeries[index];
    const weekIndex = Math.floor(index / 7) + 1;
    const key = `W${weekIndex}`;
    const current = weeklyMap.get(key) || {
      week: key,
      messages: 0,
      dialogs: 0,
      closed: 0,
      won: 0,
      lost: 0
    };
    current.messages += row.messages;
    current.dialogs += row.dialogs;
    current.closed += row.closed;
    current.won += row.won;
    current.lost += row.lost;
    weeklyMap.set(key, current);
  }
  const weeklySeries = Array.from(weeklyMap.values()).map((row) => {
    const decided = row.won + row.lost;
    return {
      ...row,
      winRate: decided > 0 ? Math.round((row.won / decided) * 100) : 0
    };
  });

  res.json({
    sentMessages7d: Number(sent?.count || 0),
    handledConversations7d: Number(handled?.count || 0),
    firstResponseMinutes: Number(frt?.avg_minutes || 0),
    totalConversations: Number(totalDialogs?.count || 0),
    openConversations: Number(openDialogs?.count || 0),
    closedConversations7d: Number(closedDialogs7d?.count || 0),
    messages7d: Number(messages7d?.count || 0),
    openToCloseMinutes: Number(openToClose?.avg_minutes || 0),
    avgMessagesPerConversation: Number(avgMessagesPerDialog?.avg_messages || 0),
    whatsappConversations: Number(whatsappDialogs?.count || 0),
    telegramConversations: Number(telegramDialogs?.count || 0),
    instagramConversations: Number(instagramDialogs?.count || 0),
    emailConversations: Number(emailDialogs?.count || 0),
    webConversations: Number(webDialogs?.count || 0),
    salesKpi: {
      totalDeals: Number(salesTotals?.total_deals || 0),
      wonDeals: Number(salesTotals?.won_deals || 0),
      lostDeals: Number(salesTotals?.lost_deals || 0),
      wonAmount: Number(salesTotals?.won_amount || 0),
      pipelineAmount: Number(salesTotals?.pipeline_amount || 0),
      winRate:
        Number(salesTotals?.won_deals || 0) + Number(salesTotals?.lost_deals || 0) > 0
          ? Math.round(
              (Number(salesTotals?.won_deals || 0) /
                (Number(salesTotals?.won_deals || 0) + Number(salesTotals?.lost_deals || 0))) *
                100
            )
          : 0
    },
    managersKpi: (() => {
      const mapped = managersKpi.map((row) => {
        const wonDeals = Number(row.won_deals || 0);
        const lostDeals = Number(row.lost_deals || 0);
        const decided = wonDeals + lostDeals;
        return {
          managerId: row.manager_id,
          managerName: row.manager_name,
          dialogsHandled: Number(row.dialogs_handled || 0),
          outgoingMessages: Number(row.outgoing_messages || 0),
          wonDeals,
          lostDeals,
          wonAmount: Number(row.won_amount || 0),
          winRate: decided > 0 ? Math.round((wonDeals / decided) * 100) : 0,
          avgFirstResponseMinutes: Number(row.avg_first_response_minutes || 0),
          overdueSlaCount: Number(row.overdue_sla_count || 0)
        };
      });
      mapped.sort((a, b) => {
        if (b.wonAmount !== a.wonAmount) {
          return b.wonAmount - a.wonAmount;
        }
        if (b.winRate !== a.winRate) {
          return b.winRate - a.winRate;
        }
        return a.avgFirstResponseMinutes - b.avgFirstResponseMinutes;
      });
      return mapped;
    })(),
    ownerKpi: {
      revenueWon: Number(salesTotals?.won_amount || 0),
      pipelineAmount: Number(salesTotals?.pipeline_amount || 0),
      winRate:
        Number(salesTotals?.won_deals || 0) + Number(salesTotals?.lost_deals || 0) > 0
          ? Math.round(
              (Number(salesTotals?.won_deals || 0) /
                (Number(salesTotals?.won_deals || 0) + Number(salesTotals?.lost_deals || 0))) *
                100
            )
          : 0,
      avgFirstResponseMinutes: Number(frt?.avg_minutes || 0),
      leads: Number(leadsInPeriod?.count || 0),
      wonDeals: Number(salesTotals?.won_deals || 0),
      conversion:
        Number(leadsInPeriod?.count || 0) > 0
          ? Math.round((Number(salesTotals?.won_deals || 0) / Number(leadsInPeriod?.count || 0)) * 1000) / 10
          : 0
    },
    laggingManagers: (() => {
      const mapped = managersKpi.map((row) => {
        const wonDeals = Number(row.won_deals || 0);
        const lostDeals = Number(row.lost_deals || 0);
        const decided = wonDeals + lostDeals;
        return {
          managerId: row.manager_id,
          managerName: row.manager_name,
          wonAmount: Number(row.won_amount || 0),
          winRate: decided > 0 ? Math.round((wonDeals / decided) * 100) : 0,
          avgFirstResponseMinutes: Number(row.avg_first_response_minutes || 0),
          overdueSlaCount: Number(row.overdue_sla_count || 0),
          dialogsHandled: Number(row.dialogs_handled || 0)
        };
      });
      if (!mapped.length) {
        return [];
      }
      const byRevenue = [...mapped].sort((a, b) => a.wonAmount - b.wonAmount);
      const cut = Math.max(1, Math.ceil(mapped.length * 0.3));
      const totalRevenue = mapped.reduce((sum, row) => sum + row.wonAmount, 0);
      if (totalRevenue <= 0) {
        return [...mapped]
          .sort((a, b) => a.winRate - b.winRate || b.avgFirstResponseMinutes - a.avgFirstResponseMinutes)
          .slice(0, cut);
      }
      return byRevenue.slice(0, cut);
    })(),
    stageKpi: stageKpi.map((row) => ({
      stageName: row.stage_name,
      dealsCount: Number(row.deals_count || 0),
      dealsAmount: Number(row.deals_amount || 0)
    })),
    slaEscalations: Number(slaEscalations?.count || 0),
    slaAverageDelayMinutes: Number(slaAvgDelay?.avg_minutes || 0),
    slaManagers: slaManagers.map((row) => ({
      managerId: row.manager_id,
      managerName: row.manager_name,
      escalatedCount: Number(row.escalated_count || 0),
      avgDelayMinutes: Number(row.avg_delay_minutes || 0)
    })),
    periodDays: rangeDays,
    dailySeries,
    weeklySeries,
    managersLoadSeries: managersLoadRows.map((row) => ({
      day: row.day,
      managerId: row.manager_id,
      managerName: row.manager_name,
      dialogsHandled: Number(row.dialogs_handled || 0),
      outgoingMessages: Number(row.outgoing_messages || 0)
    }))
  });
});

function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getDiffDaysInclusive(from: Date, to: Date): number {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.floor((to.getTime() - from.getTime()) / dayMs) + 1;
}

function resolveSnapshotRange(from: string, to: string): { periodStart: string; periodEnd: string } | null {
  const fromDate = parseIsoDate(from);
  const toDate = parseIsoDate(to);
  if (fromDate && toDate && fromDate.getTime() <= toDate.getTime()) {
    return { periodStart: from, periodEnd: to };
  }

  if (!from && !to) {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(end.getDate() - 13);
    return {
      periodStart: start.toISOString().slice(0, 10),
      periodEnd: end.toISOString().slice(0, 10)
    };
  }

  return null;
}

async function upsertMetricSnapshot(
  workspaceId: string,
  managerUserId: string | null,
  metricKey: string,
  metricValue: number,
  periodStart: string,
  periodEnd: string
): Promise<void> {
  await query(
    `INSERT INTO metric_snapshots (workspace_id, manager_user_id, metric_key, metric_value, period_start, period_end)
     VALUES ($1, $2, $3, $4, $5::date, $6::date)
     ON CONFLICT (workspace_id, COALESCE(manager_user_id, '00000000-0000-0000-0000-000000000000'::uuid), metric_key, period_start, period_end)
     DO UPDATE SET metric_value = EXCLUDED.metric_value, created_at = now()`,
    [workspaceId, managerUserId, metricKey, metricValue, periodStart, periodEnd]
  );
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes("\"") || value.includes("\n")) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }
  return value;
}

function applyAutoWidth(sheet: XLSX.WorkSheet): void {
  const ref = sheet["!ref"];
  if (!ref) {
    return;
  }
  const range = XLSX.utils.decode_range(ref);
  const columnWidths: number[] = [];

  for (let col = range.s.c; col <= range.e.c; col += 1) {
    let maxLength = 10;
    for (let row = range.s.r; row <= range.e.r; row += 1) {
      const address = XLSX.utils.encode_cell({ c: col, r: row });
      const cell = sheet[address];
      if (!cell || cell.v == null) {
        continue;
      }
      const valueLength = String(cell.v).length;
      if (valueLength > maxLength) {
        maxLength = valueLength;
      }
    }
    columnWidths.push(Math.min(60, maxLength + 2));
  }

  sheet["!cols"] = columnWidths.map((wch) => ({ wch }));
}

function applyNumberFormatByColumn(sheet: XLSX.WorkSheet, columnIndex: number, format: string): void {
  const ref = sheet["!ref"];
  if (!ref) {
    return;
  }
  const range = XLSX.utils.decode_range(ref);
  const targetColumn = range.s.c + columnIndex;
  if (targetColumn < range.s.c || targetColumn > range.e.c) {
    return;
  }

  for (let row = range.s.r + 1; row <= range.e.r; row += 1) {
    const valueAddress = XLSX.utils.encode_cell({ c: targetColumn, r: row });
    const valueCell = sheet[valueAddress];
    if (!valueCell || typeof valueCell.v !== "number") {
      continue;
    }
    valueCell.z = format;
  }
}

function applyAutoFilter(sheet: XLSX.WorkSheet): void {
  const ref = sheet["!ref"];
  if (!ref) {
    return;
  }
  sheet["!autofilter"] = { ref };
}

function applyFreezeHeader(sheet: XLSX.WorkSheet): void {
  const sheetWithFreeze = sheet as XLSX.WorkSheet & { "!freeze"?: { xSplit: number; ySplit: number } };
  sheetWithFreeze["!freeze"] = { xSplit: 0, ySplit: 1 };
}
