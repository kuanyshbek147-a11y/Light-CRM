import { Router } from "express";
import { AuthRequest } from "./auth";
import { query } from "./db";

export const metricsRouter = Router();

metricsRouter.get("/overview", async (req: AuthRequest, res) => {
  const workspaceId = req.user?.workspaceId;
  const rawDays = Number((req.query.days as string) || 14);
  const rangeDays = [7, 14, 30].includes(rawDays) ? rawDays : 14;

  const [sent] = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM messages
     WHERE workspace_id = $1 AND direction = 'outgoing' AND created_at >= now() - interval '7 days'`,
    [workspaceId]
  );

  const [handled] = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM conversations
     WHERE workspace_id = $1 AND updated_at >= now() - interval '7 days'`,
    [workspaceId]
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
     WHERE workspace_id = $1 AND status = 'closed' AND updated_at >= now() - interval '7 days'`,
    [workspaceId]
  );

  const [messages7d] = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM messages
     WHERE workspace_id = $1 AND created_at >= now() - interval '7 days'`,
    [workspaceId]
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

  const dailyRows = await query<{ day: string; messages: string; dialogs: string; closed: string }>(
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
     SELECT to_char(days.day, 'DD.MM') AS day,
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
    dailySeries: dailyRows.map((row) => ({
      day: row.day,
      messages: Number(row.messages || 0),
      dialogs: Number(row.dialogs || 0),
      closed: Number(row.closed || 0)
    }))
  });
});
