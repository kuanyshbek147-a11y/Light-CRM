import { query } from "../../db";
import { getRealtimeServer } from "../../realtime";
import { sendTelegramMessageForConversation } from "../../telegram";
import {
  sendWhatsAppMessageForConversation,
  sendWhatsAppTemplateForConversation
} from "../../whatsapp";
import { personalizeBody } from "./campaigns";
import { resolveSegmentContacts, type SegmentContact } from "./segments";

export type MarketingSequence = {
  id: string;
  name: string;
  segment_id: string | null;
  channel: "whatsapp" | "telegram";
  step0_body: string;
  step3_body: string;
  step7_body: string;
  template_name: string | null;
  template_lang: string | null;
  status: "draft" | "active" | "paused" | "done";
  created_at: string;
  pending_runs?: number;
};

const STEP_DAYS = [0, 3, 7] as const;
let workerTimer: NodeJS.Timeout | null = null;
let tickRunning = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function listSequences(workspaceId: string): Promise<MarketingSequence[]> {
  const rows = await query<MarketingSequence>(
    `SELECT id, name, segment_id, channel, step0_body, step3_body, step7_body,
            template_name, template_lang, status, created_at
     FROM marketing_sequences
     WHERE workspace_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [workspaceId]
  );
  const result: MarketingSequence[] = [];
  for (const row of rows) {
    const pending = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM marketing_sequence_runs
       WHERE sequence_id = $1 AND status = 'pending'`,
      [row.id]
    );
    result.push({ ...row, pending_runs: Number(pending[0]?.count || 0) });
  }
  return result;
}

export async function createSequence(input: {
  workspaceId: string;
  userId: string;
  name: string;
  segmentId: string;
  channel: string;
  step0Body: string;
  step3Body: string;
  step7Body: string;
  templateName?: string | null;
  templateLang?: string | null;
}): Promise<MarketingSequence | { error: string }> {
  const name = input.name.trim();
  const step0 = input.step0Body.trim();
  const step3 = input.step3Body.trim();
  const step7 = input.step7Body.trim();
  const channel = input.channel.trim().toLowerCase();
  if (!name || !step0 || !step3 || !step7) {
    return { error: "sequence_fields_required" };
  }
  if (channel !== "whatsapp" && channel !== "telegram") {
    return { error: "invalid_channel" };
  }
  const segment = await query<{ id: string }>(
    `SELECT id FROM marketing_segments WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
    [input.segmentId, input.workspaceId]
  );
  if (!segment[0]) {
    return { error: "segment_not_found" };
  }

  const rows = await query<MarketingSequence>(
    `INSERT INTO marketing_sequences
       (workspace_id, name, segment_id, channel, step0_body, step3_body, step7_body,
        template_name, template_lang, created_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NULLIF($8,''),NULLIF($9,''),$10)
     RETURNING id, name, segment_id, channel, step0_body, step3_body, step7_body,
               template_name, template_lang, status, created_at`,
    [
      input.workspaceId,
      name,
      input.segmentId,
      channel,
      step0,
      step3,
      step7,
      (input.templateName || "").trim(),
      (input.templateLang || "ru").trim(),
      input.userId
    ]
  );
  return { ...rows[0], pending_runs: 0 };
}

export async function startSequence(
  workspaceId: string,
  sequenceId: string
): Promise<MarketingSequence | { error: string }> {
  const rows = await query<MarketingSequence & { workspace_id: string }>(
    `SELECT id, name, segment_id, channel, step0_body, step3_body, step7_body,
            template_name, template_lang, status, created_at, workspace_id
     FROM marketing_sequences
     WHERE id = $1 AND workspace_id = $2
     LIMIT 1`,
    [sequenceId, workspaceId]
  );
  const sequence = rows[0];
  if (!sequence) {
    return { error: "sequence_not_found" };
  }
  if (!sequence.segment_id) {
    return { error: "segment_required" };
  }
  if (sequence.status === "active") {
    return { error: "already_active" };
  }

  const contacts = await resolveSegmentContacts(workspaceId, {}, 500);
  // Re-resolve with segment filter
  const segmentFilter = await query<{ filter_json: unknown }>(
    `SELECT filter_json FROM marketing_segments WHERE id = $1 LIMIT 1`,
    [sequence.segment_id]
  );
  const filtered = await resolveSegmentContacts(
    workspaceId,
    segmentFilter[0]?.filter_json || {},
    500
  );
  void contacts;

  if (!filtered.length) {
    return { error: "segment_empty" };
  }

  for (const contact of filtered) {
    await query(
      `INSERT INTO marketing_sequence_runs
         (sequence_id, workspace_id, contact_id, step_index, status, next_run_at)
       VALUES ($1, $2, $3, 0, 'pending', now())
       ON CONFLICT (sequence_id, contact_id) DO NOTHING`,
      [sequenceId, workspaceId, contact.id]
    );
  }

  await query(
    `UPDATE marketing_sequences SET status = 'active', updated_at = now() WHERE id = $1`,
    [sequenceId]
  );

  void processSequenceQueue();
  const list = await listSequences(workspaceId);
  return list.find((item) => item.id === sequenceId) || { error: "sequence_not_found" };
}

async function findOrCreateConversation(
  workspaceId: string,
  contactId: string,
  channel: "whatsapp" | "telegram"
): Promise<string | null> {
  const existing = await query<{ id: string }>(
    `SELECT id FROM conversations
     WHERE workspace_id = $1 AND contact_id = $2 AND channel = $3
     ORDER BY updated_at DESC NULLS LAST
     LIMIT 1`,
    [workspaceId, contactId, channel]
  );
  if (existing[0]) {
    return existing[0].id;
  }
  const inserted = await query<{ id: string }>(
    `INSERT INTO conversations (workspace_id, contact_id, channel, status)
     VALUES ($1, $2, $3, 'open')
     RETURNING id`,
    [workspaceId, contactId, channel]
  );
  return inserted[0]?.id || null;
}

function bodyForStep(sequence: MarketingSequence, stepIndex: number): string {
  if (stepIndex === 0) return sequence.step0_body;
  if (stepIndex === 1) return sequence.step3_body;
  return sequence.step7_body;
}

export async function processSequenceQueue(): Promise<void> {
  if (tickRunning) {
    return;
  }
  tickRunning = true;
  try {
    while (true) {
      const due = await query<{
        id: string;
        sequence_id: string;
        workspace_id: string;
        contact_id: string;
        conversation_id: string | null;
        step_index: number;
        channel: "whatsapp" | "telegram";
        step0_body: string;
        step3_body: string;
        step7_body: string;
        template_name: string | null;
        template_lang: string | null;
        name: string;
        phone: string | null;
        city: string | null;
        client_type: string | null;
        category: string | null;
        contact_channel: string | null;
        external_id: string | null;
        contact_name: string;
      }>(
        `SELECT r.id, r.sequence_id, r.workspace_id, r.contact_id, r.conversation_id, r.step_index,
                s.channel, s.step0_body, s.step3_body, s.step7_body, s.template_name, s.template_lang,
                ct.name AS contact_name, ct.phone, ct.city, ct.client_type, ct.category,
                ct.channel AS contact_channel, ct.external_id
         FROM marketing_sequence_runs r
         INNER JOIN marketing_sequences s ON s.id = r.sequence_id
         INNER JOIN contacts ct ON ct.id = r.contact_id
         WHERE r.status = 'pending'
           AND r.next_run_at <= now()
           AND s.status = 'active'
         ORDER BY r.next_run_at ASC
         LIMIT 1`
      );
      const row = due[0];
      if (!row) {
        break;
      }

      const sequence: MarketingSequence = {
        id: row.sequence_id,
        name: "",
        segment_id: null,
        channel: row.channel,
        step0_body: row.step0_body,
        step3_body: row.step3_body,
        step7_body: row.step7_body,
        template_name: row.template_name,
        template_lang: row.template_lang,
        status: "active",
        created_at: ""
      };

      const contact: SegmentContact = {
        id: row.contact_id,
        name: row.contact_name,
        phone: row.phone,
        city: row.city,
        client_type: row.client_type,
        category: row.category,
        channel: row.contact_channel,
        external_id: row.external_id
      };

      const conversationId =
        row.conversation_id ||
        (await findOrCreateConversation(row.workspace_id, row.contact_id, row.channel));
      if (!conversationId) {
        await query(
          `UPDATE marketing_sequence_runs
           SET status = 'failed', last_error = 'conversation_failed', updated_at = now()
           WHERE id = $1`,
          [row.id]
        );
        continue;
      }

      const rawBody = bodyForStep(sequence, row.step_index);
      const text = personalizeBody(rawBody, contact).slice(0, 4000);

      const inserted = await query<{ id: string; created_at: string }>(
        `INSERT INTO messages (conversation_id, workspace_id, direction, body)
         VALUES ($1, $2, 'outgoing', $3)
         RETURNING id, created_at`,
        [conversationId, row.workspace_id, text]
      );
      await query(`UPDATE conversations SET updated_at = now() WHERE id = $1`, [conversationId]);
      getRealtimeServer()?.emit("message:new", {
        conversationId,
        messageId: inserted[0]?.id,
        direction: "outgoing",
        body: text,
        createdAt: inserted[0]?.created_at
      });

      try {
        let externalId: string | null = null;
        if (row.channel === "whatsapp" && row.template_name && row.step_index === 0) {
          externalId = await sendWhatsAppTemplateForConversation(conversationId, row.workspace_id, {
            name: row.template_name,
            language: row.template_lang || "ru",
            bodyParameters: [contact.name || ""]
          });
        } else if (row.channel === "whatsapp") {
          externalId = await sendWhatsAppMessageForConversation(
            conversationId,
            row.workspace_id,
            text
          );
        } else {
          externalId = await sendTelegramMessageForConversation(
            conversationId,
            row.workspace_id,
            text
          );
        }

        if (!externalId) {
          await query(
            `UPDATE marketing_sequence_runs
             SET status = 'failed', conversation_id = $2, last_error = 'send_failed', updated_at = now()
             WHERE id = $1`,
            [row.id, conversationId]
          );
        } else {
          await query(`UPDATE messages SET external_message_id = $1 WHERE id = $2`, [
            externalId,
            inserted[0]?.id
          ]);
          const nextIndex = row.step_index + 1;
          if (nextIndex >= STEP_DAYS.length) {
            await query(
              `UPDATE marketing_sequence_runs
               SET status = 'done', step_index = $2, conversation_id = $3, updated_at = now()
               WHERE id = $1`,
              [row.id, nextIndex, conversationId]
            );
          } else {
            const dayGap = STEP_DAYS[nextIndex] - STEP_DAYS[row.step_index];
            await query(
              `UPDATE marketing_sequence_runs
               SET status = 'pending',
                   step_index = $2,
                   conversation_id = $3,
                   next_run_at = now() + ($4 || ' days')::interval,
                   updated_at = now()
               WHERE id = $1`,
              [row.id, nextIndex, conversationId, String(dayGap)]
            );
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "send_error";
        await query(
          `UPDATE marketing_sequence_runs
           SET status = 'failed', last_error = $2, conversation_id = $3, updated_at = now()
           WHERE id = $1`,
          [row.id, message.slice(0, 500), conversationId]
        );
      }

      await sleep(700);
    }

    // Mark sequences done when no pending runs
    await query(
      `UPDATE marketing_sequences s
       SET status = 'done', updated_at = now()
       WHERE s.status = 'active'
         AND NOT EXISTS (
           SELECT 1 FROM marketing_sequence_runs r
           WHERE r.sequence_id = s.id AND r.status = 'pending'
         )`
    );
  } finally {
    tickRunning = false;
  }
}

export function startSequenceWorker(): void {
  if (workerTimer) {
    return;
  }
  workerTimer = setInterval(() => {
    void processSequenceQueue();
  }, 60_000);
  setTimeout(() => {
    void processSequenceQueue();
  }, 25_000);
}
