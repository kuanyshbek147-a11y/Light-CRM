import { Router } from "express";
import type { Server } from "socket.io";
import { resolveAutoAssignedManager } from "../../../auto-assignment";
import { authMiddleware, type AuthRequest } from "../../../auth";
import { query } from "../../../db";
import {
  clearWorkspaceEmailCredentials,
  getEmailCredentialsForWorkspace,
  getEmailLastUid,
  getWorkspaceEmailCredentials,
  isEmailDisabledForWorkspace,
  listWorkspacesWithEmail,
  saveWorkspaceEmailCredentials,
  setEmailLastUid,
  type EmailCredentials,
  type EmailProvider
} from "./credentials";
import { fetchNewEmails, getMailboxHighestUid, verifyEmailImap } from "./imap";
import { sendEmailMessage, verifyEmailSmtp } from "./mailer";
import { EMAIL_PROVIDER_PRESETS, resolveEmailProviderPreset } from "./providers";
import { assertSafeMailCredentials } from "./hostPolicy";

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parsePort(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.round(parsed);
}

function parseSecureFlag(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
  }
  return fallback;
}

function buildCredentialsFromBody(body: Record<string, unknown>): EmailCredentials {
  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  // Gmail app passwords are often copied with spaces: "abcd efgh ijkl mnop"
  const passwordRaw = typeof body.password === "string" ? body.password : "";
  const password = passwordRaw.replace(/\s+/g, "");
  const providerRaw = typeof body.provider === "string" ? body.provider.trim().toLowerCase() : "custom";
  const provider = (
    ["gmail", "yandex", "mailru", "outlook", "custom"].includes(providerRaw) ? providerRaw : "custom"
  ) as EmailProvider;
  const preset = resolveEmailProviderPreset(provider);
  const displayName =
    typeof body.displayName === "string" && body.displayName.trim()
      ? body.displayName.trim()
      : email;

  // Preset providers: ignore client-supplied hosts/ports to prevent credential theft / SSRF.
  if (provider !== "custom") {
    return {
      email,
      displayName,
      provider,
      password,
      smtpHost: preset.smtpHost,
      smtpPort: preset.smtpPort,
      smtpSecure: preset.smtpSecure,
      imapHost: preset.imapHost,
      imapPort: preset.imapPort,
      imapSecure: preset.imapSecure,
      connectedAt: new Date().toISOString()
    };
  }

  return {
    email,
    displayName,
    provider,
    password,
    smtpHost:
      typeof body.smtpHost === "string" && body.smtpHost.trim() ? body.smtpHost.trim() : preset.smtpHost,
    smtpPort: parsePort(body.smtpPort, preset.smtpPort),
    smtpSecure: parseSecureFlag(body.smtpSecure, preset.smtpSecure),
    imapHost:
      typeof body.imapHost === "string" && body.imapHost.trim() ? body.imapHost.trim() : preset.imapHost,
    imapPort: parsePort(body.imapPort, preset.imapPort),
    imapSecure: parseSecureFlag(body.imapSecure, preset.imapSecure),
    connectedAt: new Date().toISOString()
  };
}

async function ensureEmailConversation(
  workspaceId: string,
  fromEmail: string,
  fromName: string
): Promise<{ conversationId: string; contactId: string }> {
  const existing = await query<{ conversation_id: string; contact_id: string }>(
    `SELECT c.id AS conversation_id, ct.id AS contact_id
     FROM contacts ct
     JOIN conversations c ON c.contact_id = ct.id AND c.workspace_id = ct.workspace_id
     WHERE ct.workspace_id = $1
       AND ct.channel = 'email'
       AND lower(ct.external_id) = $2
     ORDER BY c.updated_at DESC
     LIMIT 1`,
    [workspaceId, fromEmail]
  );

  if (existing[0]) {
    return {
      conversationId: existing[0].conversation_id,
      contactId: existing[0].contact_id
    };
  }

  const managerId = await resolveAutoAssignedManager(workspaceId);
  const contactId = (
    await query<{ id: string }>(
      `INSERT INTO contacts (workspace_id, name, phone, channel, external_id)
       VALUES ($1, $2, $3, 'email', $3)
       RETURNING id`,
      [workspaceId, fromName || fromEmail, fromEmail]
    )
  )[0].id;

  const conversationId = (
    await query<{ id: string }>(
      `INSERT INTO conversations (workspace_id, contact_id, assigned_manager_id, channel, priority, first_response_due_at)
       VALUES ($1, $2, $3, 'email', 'normal', now() + interval '15 minutes')
       RETURNING id`,
      [workspaceId, contactId, managerId ?? null]
    )
  )[0].id;

  return { conversationId, contactId };
}

async function processInboundEmail(
  workspaceId: string,
  mail: {
    messageId: string | null;
    fromEmail: string;
    fromName: string;
    subject: string;
    text: string;
    date: string;
    fromAuthenticated: boolean;
  },
  io: Server
): Promise<void> {
  if (mail.messageId) {
    const duplicate = await query<{ id: string }>(
      `SELECT id FROM messages WHERE workspace_id = $1 AND external_message_id = $2 LIMIT 1`,
      [workspaceId, mail.messageId]
    );
    if (duplicate[0]) {
      return;
    }
  }

  const session = await ensureEmailConversation(workspaceId, mail.fromEmail, mail.fromName);
  let body = mail.subject && mail.subject !== "(без темы)"
    ? `${mail.subject}\n\n${mail.text}`
    : mail.text;
  if (!mail.fromAuthenticated) {
    body = `[!] Отправитель не подтверждён (нет SPF/DKIM)\n\n${body}`;
  }

  const inserted = await query<{ id: string; created_at: string }>(
    `INSERT INTO messages (conversation_id, workspace_id, direction, body, external_message_id)
     VALUES ($1, $2, 'incoming', $3, $4)
     RETURNING id, created_at`,
    [session.conversationId, workspaceId, body, mail.messageId]
  );

  await query(
    `UPDATE conversations
     SET updated_at = now(),
         status = 'open',
         first_response_due_at = now() + interval '15 minutes'
     WHERE id = $1`,
    [session.conversationId]
  );

  io.emit("message:new", {
    conversationId: session.conversationId,
    messageId: inserted[0].id,
    direction: "incoming",
    body,
    createdAt: inserted[0].created_at || mail.date,
    channel: "email"
  });
}

async function pollWorkspaceEmail(workspaceId: string, io: Server): Promise<void> {
  const credentials = await getEmailCredentialsForWorkspace(workspaceId);
  if (!credentials) {
    return;
  }

  try {
    await assertSafeMailCredentials(credentials);
  } catch (error) {
    console.error(
      `Email poll skipped unsafe credentials for workspace ${workspaceId}:`,
      error instanceof Error ? error.message : error
    );
    return;
  }

  const lastUid = await getEmailLastUid(workspaceId);
  const { messages, maxUid } = await fetchNewEmails(credentials, lastUid);
  if (messages.length > 0) {
    console.log(`Email poll workspace=${workspaceId}: imported ${messages.length} message(s), uid ${lastUid} -> ${maxUid}`);
  }
  for (const mail of messages) {
    await processInboundEmail(workspaceId, mail, io);
  }
  if (maxUid > lastUid) {
    await setEmailLastUid(workspaceId, maxUid);
  }
}

export function createEmailRouter(io: Server): Router {
  const router = Router();

  router.get("/providers", authMiddleware, (_req, res) => {
    res.json({ providers: EMAIL_PROVIDER_PRESETS });
  });

  router.get("/status", authMiddleware, async (req: AuthRequest, res) => {
    if (!req.user?.workspaceId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const disabled = await isEmailDisabledForWorkspace(req.user.workspaceId);
    const credentials = disabled ? null : await getWorkspaceEmailCredentials(req.user.workspaceId);

    res.json({
      connected: Boolean(credentials),
      disabled,
      email: credentials?.email || null,
      displayName: credentials?.displayName || null,
      provider: credentials?.provider || null,
      smtpHost: credentials?.smtpHost || null,
      smtpPort: credentials?.smtpPort || null,
      imapHost: credentials?.imapHost || null,
      imapPort: credentials?.imapPort || null,
      connectedAt: credentials?.connectedAt || null,
      providers: EMAIL_PROVIDER_PRESETS
    });
  });

  router.post("/connect", authMiddleware, async (req: AuthRequest, res) => {
    if (!req.user?.workspaceId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const credentials = buildCredentialsFromBody((req.body || {}) as Record<string, unknown>);
    if (!isValidEmail(credentials.email)) {
      res.status(400).json({ ok: false, error: "Укажите корректный email" });
      return;
    }
    if (!credentials.password) {
      res.status(400).json({ ok: false, error: "Укажите пароль или пароль приложения" });
      return;
    }
    if (!credentials.smtpHost || !credentials.imapHost) {
      res.status(400).json({ ok: false, error: "Укажите SMTP и IMAP серверы" });
      return;
    }

    try {
      await assertSafeMailCredentials(credentials);
      await verifyEmailSmtp(credentials);
      await verifyEmailImap(credentials);
      await saveWorkspaceEmailCredentials(req.user.workspaceId, credentials);
      // Start from current mailbox end so only NEW mail after connect is imported.
      const highestUid = await getMailboxHighestUid(credentials);
      await setEmailLastUid(req.user.workspaceId, highestUid);
      res.json({
        ok: true,
        connected: true,
        email: credentials.email,
        provider: credentials.provider
      });
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Не удалось подключить почту";
      const isGmailAuth =
        credentials.provider === "gmail" ||
        /smtp\.gmail\.com/i.test(credentials.smtpHost) ||
        /535.*BadCredentials|Username and Password not accepted/i.test(raw);
      const message = isGmailAuth
        ? "Gmail отклонил логин. Нужен пароль приложения (не обычный пароль): myaccount.google.com/apppasswords → включите 2FA → создайте пароль для «Почта» → вставьте 16 символов сюда."
        : raw;
      res.status(400).json({ ok: false, error: message });
    }
  });

  router.post("/disconnect", authMiddleware, async (req: AuthRequest, res) => {
    if (!req.user?.workspaceId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (req.user.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    await clearWorkspaceEmailCredentials(req.user.workspaceId);
    res.json({ ok: true, connected: false, disabled: true });
  });

  // Keep reference so TypeScript doesn't drop io in tree-shaken builds of helpers.
  void io;

  return router;
}

export async function sendEmailMessageForConversation(
  conversationId: string,
  workspaceId: string,
  body: string
): Promise<string | null> {
  const rows = await query<{
    channel: string;
    external_id: string | null;
    contact_name: string;
    last_subject: string | null;
    last_external_id: string | null;
  }>(
    `SELECT c.channel,
            ct.external_id,
            ct.name AS contact_name,
            (
              SELECT split_part(m.body, E'\n\n', 1)
              FROM messages m
              WHERE m.conversation_id = c.id AND m.direction = 'incoming'
              ORDER BY m.created_at DESC
              LIMIT 1
            ) AS last_subject,
            (
              SELECT m.external_message_id
              FROM messages m
              WHERE m.conversation_id = c.id AND m.direction = 'incoming'
              ORDER BY m.created_at DESC
              LIMIT 1
            ) AS last_external_id
     FROM conversations c
     JOIN contacts ct ON ct.id = c.contact_id
     WHERE c.id = $1 AND c.workspace_id = $2
     LIMIT 1`,
    [conversationId, workspaceId]
  );

  const conversation = rows[0];
  if (!conversation || conversation.channel !== "email" || !conversation.external_id) {
    return null;
  }

  const credentials = await getEmailCredentialsForWorkspace(workspaceId);
  if (!credentials) {
    return null;
  }

  await assertSafeMailCredentials(credentials);

  const subjectBase = conversation.last_subject?.trim() || "Диалог Light CRM";
  const subject = subjectBase.toLowerCase().startsWith("re:")
    ? subjectBase
    : `Re: ${subjectBase}`;

  return sendEmailMessage({
    credentials,
    to: conversation.external_id,
    subject,
    text: body,
    inReplyTo: conversation.last_external_id,
    references: conversation.last_external_id
  });
}

export function startEmailPolling(io: Server): void {
  const intervalMs = Number(process.env.EMAIL_POLL_INTERVAL_MS || 30000);
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    return;
  }

  const tick = async (): Promise<void> => {
    try {
      const workspaceIds = await listWorkspacesWithEmail();
      for (const workspaceId of workspaceIds) {
        try {
          await pollWorkspaceEmail(workspaceId, io);
        } catch (error) {
          console.error(`Email poll failed for workspace ${workspaceId}`, error);
        }
      }
    } catch (error) {
      console.error("Email polling loop failed", error);
    }
  };

  void tick();
  setInterval(() => {
    void tick();
  }, intervalMs);
}
