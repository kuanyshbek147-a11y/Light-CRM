import { query } from "../../db";

export type CampaignReport = {
  campaign_id: string;
  name: string;
  status: string;
  channel: string;
  started_at: string | null;
  finished_at: string | null;
  sent: number;
  failed: number;
  skipped: number;
  replied: number;
  reply_rate: number;
  deals_touched: number;
  deals_won: number;
};

export async function getCampaignReports(workspaceId: string): Promise<CampaignReport[]> {
  const rows = await query<{
    campaign_id: string;
    name: string;
    status: string;
    channel: string;
    started_at: string | null;
    finished_at: string | null;
    sent: string;
    failed: string;
    skipped: string;
    replied: string;
    deals_touched: string;
    deals_won: string;
  }>(
    `SELECT c.id AS campaign_id, c.name, c.status, c.channel, c.started_at, c.finished_at,
            COUNT(*) FILTER (WHERE r.status = 'sent')::text AS sent,
            COUNT(*) FILTER (WHERE r.status = 'failed')::text AS failed,
            COUNT(*) FILTER (WHERE r.status = 'skipped')::text AS skipped,
            COUNT(DISTINCT r.contact_id) FILTER (
              WHERE r.status = 'sent'
                AND EXISTS (
                  SELECT 1 FROM messages m
                  WHERE m.conversation_id = r.conversation_id
                    AND m.direction = 'incoming'
                    AND m.created_at > COALESCE(r.sent_at, c.started_at, c.created_at)
                )
            )::text AS replied,
            COUNT(DISTINCT d.id)::text AS deals_touched,
            COUNT(DISTINCT d.id) FILTER (
              WHERE LOWER(TRIM(d.stage)) IN ('won', 'выиграно', 'успех', 'closed')
            )::text AS deals_won
     FROM marketing_campaigns c
     LEFT JOIN marketing_campaign_recipients r ON r.campaign_id = c.id
     LEFT JOIN conversations conv ON conv.id = r.conversation_id
     LEFT JOIN deals d ON d.conversation_id = conv.id AND d.workspace_id = c.workspace_id
     WHERE c.workspace_id = $1
     GROUP BY c.id
     ORDER BY c.created_at DESC
     LIMIT 50`,
    [workspaceId]
  );

  return rows.map((row) => {
    const sent = Number(row.sent || 0);
    const replied = Number(row.replied || 0);
    return {
      campaign_id: row.campaign_id,
      name: row.name,
      status: row.status,
      channel: row.channel,
      started_at: row.started_at,
      finished_at: row.finished_at,
      sent,
      failed: Number(row.failed || 0),
      skipped: Number(row.skipped || 0),
      replied,
      reply_rate: sent > 0 ? Math.round((replied / sent) * 1000) / 10 : 0,
      deals_touched: Number(row.deals_touched || 0),
      deals_won: Number(row.deals_won || 0)
    };
  });
}
