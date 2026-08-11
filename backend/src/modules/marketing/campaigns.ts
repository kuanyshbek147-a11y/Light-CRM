import { query } from "../../db";
import { getRealtimeServer } from "../../realtime";
import { sendTelegramMessageForConversation } from "../../telegram";
import {
  sendWhatsAppMessageForConversation,
  sendWhatsAppTemplateForConversation
} from "../../whatsapp";
import { resolveSegmentContacts, type SegmentContact, type SegmentFilter } from "./segments";

export type CampaignChannel = "whatsapp" | "telegram";
export type CampaignStatus = "draft" | "queued" | "sending" | "done" | "cancelled" | "failed";

export type MarketingCampaign = {
  id: string;
  segment_id: string | null;
  segment_name: string | null;
  name: string;
  channel: CampaignChannel;
  body: string;
  template_name?: string | null;
  template_lang?: string | null;
  status: CampaignStatus;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
  recipients_total?: number;
  recipients_sent?: number;
  recipients_failed?: number;
  recipients_skipped?: number;
  recipients_pending?: number;
};

const SEND_GAP_MS = 700;
const MAX_RECIPIENTS = 500;
let workerRunning = false;
let workerTimer: NodeJS.Timeout | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function personalizeBody(template: string, contact: SegmentContact): string {
  const map: Record<string, string> = {
    "{{name}}": contact.name || "",
    "{{city}}": contact.city || "",
    "{{phone}}": contact.phone || "",
    "{{client_type}}": contact.client_type || "",
    "{{category}}": contact.category || ""
  };
  return Object.entries(map).reduce((text, [token, value]) => text.split(token).join(value), template);
}

async function attachCampaignStats(campaign: MarketingCampaign): Promise<MarketingCampaign> {
  const stats = await query<{
    total: string;
    sent: string;
    failed: string;
    skipped: string;
    pending: string;
  }>(
    `SELECT
       COUNT(*)::text AS total,
       COUNT(*) FILTER (WHERE status = 'sent')::text AS sent,
       COUNT(*) FILTER (WHERE status = 'failed')::text AS failed,
       COUNT(*) FILTER (WHERE status = 'skipped')::text AS skipped,
       COUNT(*) FILTER (WHERE status = 'pending')::text AS pending
     FROM marketing_campaign_recipients
     WHERE campaign_id = $1`,
    [campaign.id]
  );
  const row = stats[0];
  return {
    ...campaign,
    recipients_total: Number(row?.total || 0),
    recipients_sent: Number(row?.sent || 0),
    recipients_failed: Number(row?.failed || 0),
    recipients_skipped: Number(row?.skipped || 0),
    recipients_pending: Number(row?.pending || 0)
  };
}

export async function listCampaigns(workspaceId: string): Promise<MarketingCampaign[]> {
  const rows = await query<MarketingCampaign>(
    `SELECT c.id, c.segment_id, s.name AS segment_name, c.name, c.channel, c.body,
            c.template_name, c.template_lang, c.status,
            c.started_at, c.finished_at, c.created_at, c.updated_at
     FROM marketing_campaigns c
     LEFT JOIN marketing_segments s ON s.id = c.segment_id
     WHERE c.workspace_id = $1
     ORDER BY c.created_at DESC
     LIMIT 100`,
    [workspaceId]
  );
  const result: MarketingCampaign[] = [];
  for (const row of rows) {
    result.push(await attachCampaignStats(row));
  }
  return result;
}

export async function getCampaign(
  workspaceId: string,
  campaignId: string
): Promise<MarketingCampaign | null> {
  const rows = await query<MarketingCampaign>(
    `SELECT c.id, c.segment_id, s.name AS segment_name, c.name, c.channel, c.body, c.status,
            c.started_at, c.finished_at, c.created_at, c.updated_at
     FROM marketing_campaigns c
     LEFT JOIN marketing_segments s ON s.id = c.segment_id
     WHERE c.id = $1 AND c.workspace_id = $2
     LIMIT 1`,
    [campaignId, workspaceId]
  );
  if (!rows[0]) {
    return null;
  }
  return attachCampaignStats(rows[0]);
}

export async function createCampaign(input: {
  workspaceId: string;
  userId: string;
  name: string;
  segmentId: string;
  channel: string;
  body: string;
  templateName?: string | null;
  templateLang?: string | null;
}): Promise<MarketingCampaign | { error: string }> {
  const name = input.name.trim();
  const body = input.body.trim();
  const templateName = (input.templateName || "").trim();
  const channel = input.channel.trim().toLowerCase();
  if (!name) {
    return { error: "campaign_name_required" };
  }
  if (!body && !templateName) {
    return { error: "campaign_body_required" };
  }
  if (channel !== "whatsapp" && channel !== "telegram") {
    return { error: "invalid_channel" };
  }
  if (templateName && channel !== "whatsapp") {
    return { error: "template_whatsapp_only" };
  }

  const segment = await query<{ id: string }>(
    `SELECT id FROM marketing_segments WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
    [input.segmentId, input.workspaceId]
  );
  if (!segment[0]) {
    return { error: "segment_not_found" };
  }

  const rows = await query<MarketingCampaign>(
    `INSERT INTO marketing_campaigns
       (workspace_id, segment_id, name, channel, body, template_name, template_lang, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, NULLIF($6,''), NULLIF($7,''), $8)
     RETURNING id, segment_id, name, channel, body, template_name, template_lang, status,
               started_at, finished_at, created_at, updated_at`,
    [
      input.workspaceId,
      input.segmentId,
      name,
      channel,
      body || `[HSM] ${templateName}`,
      templateName,
      (input.templateLang || "ru").trim(),
      input.userId
    ]
  );
  const created = rows[0];
  return {
    ...created,
    segment_name: null,
    recipients_total: 0,
    recipients_sent: 0,
    recipients_failed: 0,
    recipients_skipped: 0,
    recipients_pending: 0
  };
}

async function findOrCreateConversation(input: {
  workspaceId: string;
  contactId: string;
  channel: CampaignChannel;
}): Promise<string | null> {
  const existing = await query<{ id: string }>(
    `SELECT id
     FROM conversations
     WHERE workspace_id = $1 AND contact_id = $2 AND channel = $3
     ORDER BY updated_at DESC NULLS LAST, created_at DESC
     LIMIT 1`,
    [input.workspaceId, input.contactId, input.channel]
  );
  if (existing[0]) {
    return existing[0].id;
  }

  const inserted = await query<{ id: string }>(
    `INSERT INTO conversations (workspace_id, contact_id, channel, status)
     VALUES ($1, $2, $3, 'open')
     RETURNING id`,
    [input.workspaceId, input.contactId, input.channel]
  );
  return inserted[0]?.id || null;
}

function canSendToContact(contact: SegmentContact, channel: CampaignChannel): string | null {
  if (channel === "whatsapp") {
    const to = (contact.external_id || contact.phone || "").trim();
    if (!to) {
      return "no_whatsapp_recipient";
    }
    return null;
  }
  if (!(contact.external_id || "").trim()) {
    return "no_telegram_chat_id";
  }
  return null;
}

export async function startCampaign(
  workspaceId: string,
  campaignId: string
): Promise<MarketingCampaign | { error: string }> {
  const campaignRows = await query<{
    id: string;
    status: CampaignStatus;
    segment_id: string | null;
    channel: CampaignChannel;
    body: string;
  }>(
    `SELECT id, status, segment_id, channel, body
     FROM marketing_campaigns
     WHERE id = $1 AND workspace_id = $2
     LIMIT 1`,
    [campaignId, workspaceId]
  );
  const campaign = campaignRows[0];
  if (!campaign) {
    return { error: "campaign_not_found" };
  }
  if (campaign.status !== "draft" && campaign.status !== "failed") {
    return { error: "campaign_not_startable" };
  }
  if (!campaign.segment_id) {
    return { error: "segment_required" };
  }

  const segmentRows = await query<{ filter_json: SegmentFilter }>(
    `SELECT filter_json FROM marketing_segments WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
    [campaign.segment_id, workspaceId]
  );
  if (!segmentRows[0]) {
    return { error: "segment_not_found" };
  }

  const contacts = await resolveSegmentContacts(workspaceId, segmentRows[0].filter_json || {}, MAX_RECIPIENTS);
  if (!contacts.length) {
    return { error: "segment_empty" };
  }

  await query(`DELETE FROM marketing_campaign_recipients WHERE campaign_id = $1`, [campaignId]);

  for (const contact of contacts) {
    await query(
      `INSERT INTO marketing_campaign_recipients
         (campaign_id, workspace_id, contact_id, status)
       VALUES ($1, $2, $3, 'pending')
       ON CONFLICT (campaign_id, contact_id) DO NOTHING`,
      [campaignId, workspaceId, contact.id]
    );
  }

  await query(
    `UPDATE marketing_campaigns
     SET status = 'queued',
         started_at = now(),
         finished_at = NULL,
         updated_at = now()
     WHERE id = $1`,
    [campaignId]
  );

  void processCampaignQueue();
  const fresh = await getCampaign(workspaceId, campaignId);
  return fresh || { error: "campaign_not_found" };
}

async function markRecipient(input: {
  recipientId: string;
  status: "sent" | "failed" | "skipped";
  conversationId?: string | null;
  messageId?: string | null;
  error?: string | null;
}): Promise<void> {
  await query(
    `UPDATE marketing_campaign_recipients
     SET status = $2,
         conversation_id = COALESCE($3, conversation_id),
         message_id = COALESCE($4, message_id),
         error = $5,
         sent_at = CASE WHEN $2 = 'sent' THEN now() ELSE sent_at END
     WHERE id = $1`,
    [
      input.recipientId,
      input.status,
      input.conversationId || null,
      input.messageId || null,
      input.error || null
    ]
  );
}

async function sendOneRecipient(row: {
  id: string;
  campaign_id: string;
  workspace_id: string;
  contact_id: string;
  channel: CampaignChannel;
  body: string;
  template_name: string | null;
  template_lang: string | null;
  name: string;
  phone: string | null;
  city: string | null;
  client_type: string | null;
  category: string | null;
  contact_channel: string | null;
  external_id: string | null;
}): Promise<void> {
  const contact: SegmentContact = {
    id: row.contact_id,
    name: row.name,
    phone: row.phone,
    city: row.city,
    client_type: row.client_type,
    category: row.category,
    channel: row.contact_channel,
    external_id: row.external_id
  };

  const skipReason = canSendToContact(contact, row.channel);
  if (skipReason) {
    await markRecipient({ recipientId: row.id, status: "skipped", error: skipReason });
    return;
  }

  const conversationId = await findOrCreateConversation({
    workspaceId: row.workspace_id,
    contactId: row.contact_id,
    channel: row.channel
  });
  if (!conversationId) {
    await markRecipient({
      recipientId: row.id,
      status: "failed",
      error: "conversation_create_failed"
    });
    return;
  }

  const text = personalizeBody(row.body, contact).slice(0, 4000);
  const inserted = await query<{ id: string; created_at: string }>(
    `INSERT INTO messages (conversation_id, workspace_id, direction, body)
     VALUES ($1, $2, 'outgoing', $3)
     RETURNING id, created_at`,
    [conversationId, row.workspace_id, text]
  );
  const messageId = inserted[0]?.id;
  const createdAt = inserted[0]?.created_at;
  await query(`UPDATE conversations SET updated_at = now() WHERE id = $1`, [conversationId]);

  const io = getRealtimeServer();
  io?.emit("message:new", {
    conversationId,
    messageId,
    direction: "outgoing",
    body: text,
    createdAt
  });

  try {
    let externalId: string | null = null;
    if (row.channel === "whatsapp" && row.template_name) {
      externalId = await sendWhatsAppTemplateForConversation(conversationId, row.workspace_id, {
        name: row.template_name,
        language: row.template_lang || "ru",
        bodyParameters: [contact.name || ""]
      });
    } else if (row.channel === "whatsapp") {
      externalId = await sendWhatsAppMessageForConversation(conversationId, row.workspace_id, text);
    } else {
      externalId = await sendTelegramMessageForConversation(conversationId, row.workspace_id, text);
    }

    if (!externalId) {
      await markRecipient({
        recipientId: row.id,
        status: "failed",
        conversationId,
        messageId,
        error: "provider_send_failed"
      });
      return;
    }

    await query(`UPDATE messages SET external_message_id = $1 WHERE id = $2`, [externalId, messageId]);
    await markRecipient({
      recipientId: row.id,
      status: "sent",
      conversationId,
      messageId
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "send_error";
    await markRecipient({
      recipientId: row.id,
      status: "failed",
      conversationId,
      messageId,
      error: message.slice(0, 500)
    });
  }
}

async function finalizeCampaignIfDone(campaignId: string): Promise<void> {
  const pending = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM marketing_campaign_recipients
     WHERE campaign_id = $1 AND status = 'pending'`,
    [campaignId]
  );
  if (Number(pending[0]?.count || 0) > 0) {
    return;
  }

  const failedOnly = await query<{ count: string; sent: string }>(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'failed')::text AS count,
       COUNT(*) FILTER (WHERE status = 'sent')::text AS sent
     FROM marketing_campaign_recipients
     WHERE campaign_id = $1`,
    [campaignId]
  );
  const sent = Number(failedOnly[0]?.sent || 0);
  const nextStatus: CampaignStatus = sent > 0 ? "done" : "failed";

  await query(
    `UPDATE marketing_campaigns
     SET status = $2,
         finished_at = now(),
         updated_at = now()
     WHERE id = $1 AND status IN ('queued', 'sending')`,
    [campaignId, nextStatus]
  );

  if (nextStatus === "done") {
    await query(
      `UPDATE marketing_content_posts
       SET status = 'published',
           published_at = COALESCE(published_at, now()),
           publish_error = NULL,
           updated_at = now()
       WHERE campaign_id = $1
         AND status <> 'cancelled'`,
      [campaignId]
    );
  }
}

export async function processCampaignQueue(): Promise<void> {
  if (workerRunning) {
    return;
  }
  workerRunning = true;
  try {
    while (true) {
      const next = await query<{
        id: string;
        campaign_id: string;
        workspace_id: string;
        contact_id: string;
        channel: CampaignChannel;
        body: string;
        template_name: string | null;
        template_lang: string | null;
        name: string;
        phone: string | null;
        city: string | null;
        client_type: string | null;
        category: string | null;
        contact_channel: string | null;
        external_id: string | null;
      }>(
        `SELECT r.id, r.campaign_id, r.workspace_id, r.contact_id,
                c.channel, c.body, c.template_name, c.template_lang,
                ct.name, ct.phone, ct.city, ct.client_type, ct.category,
                ct.channel AS contact_channel, ct.external_id
         FROM marketing_campaign_recipients r
         INNER JOIN marketing_campaigns c ON c.id = r.campaign_id
         INNER JOIN contacts ct ON ct.id = r.contact_id
         WHERE r.status = 'pending'
           AND c.status IN ('queued', 'sending')
         ORDER BY r.created_at ASC
         LIMIT 1`
      );

      const row = next[0];
      if (!row) {
        break;
      }

      await query(
        `UPDATE marketing_campaigns
         SET status = 'sending', updated_at = now()
         WHERE id = $1 AND status IN ('queued', 'sending')`,
        [row.campaign_id]
      );

      await sendOneRecipient(row);
      await finalizeCampaignIfDone(row.campaign_id);
      await sleep(SEND_GAP_MS);
    }
  } finally {
    workerRunning = false;
  }
}

export function startCampaignWorker(): void {
  if (workerTimer) {
    return;
  }
  workerTimer = setInterval(() => {
    void processCampaignQueue();
  }, 15_000);
  setTimeout(() => {
    void processCampaignQueue();
  }, 5_000);
}
