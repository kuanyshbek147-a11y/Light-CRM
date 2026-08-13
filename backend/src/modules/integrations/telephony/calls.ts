import type { Server } from "socket.io";
import { query } from "../../../db";
import { getRealtimeServer } from "../../../realtime";
import {
  applyOutboundPrefix,
  getTelephonySettings,
  normalizePhoneDigits
} from "./credentials";

export type CallDirection = "in" | "out";
export type CallStatus = "ringing" | "started" | "answered" | "ended" | "missed" | "failed";

export type CallLog = {
  id: string;
  workspace_id: string;
  conversation_id: string | null;
  contact_id: string | null;
  user_id: string | null;
  direction: CallDirection;
  remote_number: string;
  status: CallStatus;
  started_at: string;
  ended_at: string | null;
  duration_sec: number | null;
  sip_call_id: string | null;
};

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

async function findContactByPhone(
  workspaceId: string,
  phone: string
): Promise<{ id: string; name: string; phone: string } | null> {
  const digits = normalizePhoneDigits(phone);
  if (!digits) {
    return null;
  }

  const rows = await query<{ id: string; name: string; phone: string }>(
    `SELECT id, name, phone
     FROM contacts
     WHERE workspace_id = $1
       AND regexp_replace(phone, '\\D', '', 'g') <> ''
       AND (
         regexp_replace(phone, '\\D', '', 'g') = $2
         OR regexp_replace(phone, '\\D', '', 'g') LIKE '%' || $2
         OR $2 LIKE '%' || regexp_replace(phone, '\\D', '', 'g')
       )
     ORDER BY
       CASE WHEN regexp_replace(phone, '\\D', '', 'g') = $2 THEN 0 ELSE 1 END,
       created_at DESC NULLS LAST
     LIMIT 1`,
    [workspaceId, digits]
  );
  return rows[0] || null;
}

async function ensureCallContact(
  workspaceId: string,
  phone: string
): Promise<{ id: string; name: string; phone: string }> {
  const existing = await findContactByPhone(workspaceId, phone);
  if (existing) {
    return existing;
  }

  const digits = normalizePhoneDigits(phone) || phone.trim() || "unknown";
  const inserted = await query<{ id: string; name: string; phone: string }>(
    `INSERT INTO contacts (workspace_id, name, phone, channel)
     VALUES ($1, $2, $3, 'call')
     RETURNING id, name, phone`,
    [workspaceId, digits, digits]
  );
  return inserted[0];
}

async function ensureCallConversation(
  workspaceId: string,
  contactId: string,
  userId: string | null
): Promise<string> {
  const existing = await query<{ id: string }>(
    `SELECT id FROM conversations
     WHERE workspace_id = $1 AND contact_id = $2 AND channel = 'call' AND status = 'open'
     ORDER BY updated_at DESC
     LIMIT 1`,
    [workspaceId, contactId]
  );
  if (existing[0]) {
    return existing[0].id;
  }

  const inserted = await query<{ id: string }>(
    `INSERT INTO conversations (workspace_id, contact_id, assigned_manager_id, channel, status)
     VALUES ($1, $2, $3, 'call', 'open')
     RETURNING id`,
    [workspaceId, contactId, userId]
  );
  return inserted[0].id;
}

function emitCallUpdate(workspaceId: string, payload: Record<string, unknown>): void {
  const io = getRealtimeServer();
  if (!io) {
    return;
  }
  io.emit("call:update", { workspaceId, ...payload });
}

export async function upsertCallEvent(input: {
  workspaceId: string;
  userId: string;
  direction: CallDirection;
  remoteNumber: string;
  status: CallStatus;
  sipCallId?: string | null;
  callLogId?: string | null;
  durationSec?: number | null;
  io?: Server;
}): Promise<CallLog & { contact_name?: string | null }> {
  const settings = await getTelephonySettings(input.workspaceId);
  const rawNumber = String(input.remoteNumber || "").trim();
  const remoteNumber =
    input.direction === "out"
      ? applyOutboundPrefix(rawNumber, settings.outboundPrefix) || normalizePhoneDigits(rawNumber) || rawNumber
      : normalizePhoneDigits(rawNumber) || rawNumber;

  if (!remoteNumber) {
    throw new Error("remote_number_required");
  }

  const contact = await ensureCallContact(input.workspaceId, remoteNumber);
  const conversationId = await ensureCallConversation(
    input.workspaceId,
    contact.id,
    input.userId
  );

  const sipCallId = String(input.sipCallId || "").trim() || null;
  let existing: CallLog | null = null;

  if (input.callLogId) {
    const rows = await query<CallLog>(
      `SELECT id, workspace_id, conversation_id, contact_id, user_id, direction, remote_number,
              status, started_at::text, ended_at::text, duration_sec, sip_call_id
       FROM call_logs
       WHERE id = $1 AND workspace_id = $2
       LIMIT 1`,
      [input.callLogId, input.workspaceId]
    );
    existing = rows[0] || null;
  } else if (sipCallId) {
    const rows = await query<CallLog>(
      `SELECT id, workspace_id, conversation_id, contact_id, user_id, direction, remote_number,
              status, started_at::text, ended_at::text, duration_sec, sip_call_id
       FROM call_logs
       WHERE workspace_id = $1 AND sip_call_id = $2
       LIMIT 1`,
      [input.workspaceId, sipCallId]
    );
    existing = rows[0] || null;
  }

  const terminal = input.status === "ended" || input.status === "missed" || input.status === "failed";
  const durationSec =
    input.durationSec != null && Number.isFinite(Number(input.durationSec))
      ? Math.max(0, Math.round(Number(input.durationSec)))
      : null;

  let call: CallLog;
  const wasTerminal =
    existing?.status === "ended" || existing?.status === "missed" || existing?.status === "failed";
  if (existing) {
    const updated = await query<CallLog>(
      `UPDATE call_logs
       SET status = $1,
           conversation_id = COALESCE($2, conversation_id),
           contact_id = COALESCE($3, contact_id),
           remote_number = $4,
           ended_at = CASE WHEN $5 THEN COALESCE(ended_at, now()) ELSE ended_at END,
           duration_sec = COALESCE($6, duration_sec),
           sip_call_id = COALESCE($7, sip_call_id),
           updated_at = now()
       WHERE id = $8 AND workspace_id = $9
       RETURNING id, workspace_id, conversation_id, contact_id, user_id, direction, remote_number,
                 status, started_at::text, ended_at::text, duration_sec, sip_call_id`,
      [
        input.status,
        conversationId,
        contact.id,
        remoteNumber,
        terminal,
        durationSec,
        sipCallId,
        existing.id,
        input.workspaceId
      ]
    );
    call = updated[0];
  } else {
    const inserted = await query<CallLog>(
      `INSERT INTO call_logs (
         workspace_id, conversation_id, contact_id, user_id, direction, remote_number,
         status, ended_at, duration_sec, sip_call_id
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         CASE WHEN $8 THEN now() ELSE NULL END,
         $9, $10
       )
       RETURNING id, workspace_id, conversation_id, contact_id, user_id, direction, remote_number,
                 status, started_at::text, ended_at::text, duration_sec, sip_call_id`,
      [
        input.workspaceId,
        conversationId,
        contact.id,
        input.userId,
        input.direction,
        remoteNumber,
        input.status,
        terminal,
        durationSec,
        sipCallId
      ]
    );
    call = inserted[0];
  }

  await query(`UPDATE conversations SET updated_at = now() WHERE id = $1`, [conversationId]);

  if (terminal && !wasTerminal) {
    const label =
      input.direction === "out"
        ? "Исходящий звонок"
        : input.status === "missed"
          ? "Пропущенный звонок"
          : "Входящий звонок";
    const durationLabel =
      call.duration_sec != null && call.duration_sec > 0
        ? ` · ${formatDuration(call.duration_sec)}`
        : input.status === "missed"
          ? " · без ответа"
          : input.status === "failed"
            ? " · ошибка"
            : "";
    const body = `📞 ${label}${durationLabel} · ${remoteNumber}`;
    await query(
      `INSERT INTO messages (conversation_id, workspace_id, direction, body, author_user_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        conversationId,
        input.workspaceId,
        input.direction === "out" ? "outgoing" : "incoming",
        body,
        input.userId
      ]
    );
  }

  const payload = {
    ...call,
    contact_name: contact.name,
    conversation_id: conversationId
  };
  emitCallUpdate(input.workspaceId, payload);
  void input.io;

  return payload;
}
