import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { EmailCredentials } from "./credentials";
import { resolveSafeMailEndpoint } from "./hostPolicy";

export type FetchedEmail = {
  uid: number;
  messageId: string | null;
  fromEmail: string;
  fromName: string;
  subject: string;
  text: string;
  date: string;
  fromAuthenticated: boolean;
};

function extractAddress(value: unknown): { email: string; name: string } {
  if (!value || typeof value !== "object") {
    return { email: "", name: "" };
  }

  const direct = value as { address?: string; name?: string; value?: unknown; text?: string };
  if (typeof direct.address === "string" && direct.address.includes("@")) {
    return {
      email: direct.address.trim().toLowerCase(),
      name: (direct.name || direct.address).trim()
    };
  }

  const nested = direct.value;
  if (Array.isArray(nested) && nested[0] && typeof nested[0] === "object") {
    const first = nested[0] as { address?: string; name?: string };
    if (first.address) {
      return {
        email: first.address.trim().toLowerCase(),
        name: (first.name || first.address).trim()
      };
    }
  }

  if (Array.isArray(value) && value[0]) {
    return extractAddress(value[0]);
  }

  const text = typeof direct.text === "string" ? direct.text : "";
  const match = text.match(/<?([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})>?/i);
  return {
    email: (match?.[1] || "").toLowerCase(),
    name: text.replace(/<[^>]+>/g, "").trim() || match?.[1] || ""
  };
}

function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*p\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizeBodyText(text: string): string {
  const cleaned = text.replace(/\r\n/g, "\n").trim();
  if (!cleaned) {
    return "[Пустое письмо]";
  }
  if (cleaned.length > 8000) {
    return `${cleaned.slice(0, 8000)}…`;
  }
  return cleaned;
}

function headerValuesToText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => headerValuesToText(item)).join("\n");
  }
  if (value && typeof value === "object" && "value" in (value as object)) {
    return headerValuesToText((value as { value: unknown }).value);
  }
  return "";
}

/**
 * Trust only the topmost Authentication-Results header (added by the receiving MTA).
 * Never scan the MIME body — attackers can forge auth tokens there.
 */
function isAuthenticatedSender(authResultsHeader: unknown): boolean {
  const values = Array.isArray(authResultsHeader)
    ? authResultsHeader
    : authResultsHeader != null
      ? [authResultsHeader]
      : [];
  const top = headerValuesToText(values[0] ?? "").trim();
  if (!top) {
    return false;
  }

  const authservId = top.split(";")[0]?.trim().toLowerCase() || "";
  if (!authservId || !authservId.includes(".") || authservId.length < 3) {
    return false;
  }

  return /(?:^|[\s;])(?:spf|dkim|dmarc)=pass\b/i.test(top);
}

async function parseMailSource(source: Buffer | string): Promise<{
  text: string;
  subject: string;
  messageId: string | null;
  fromEmail: string;
  fromName: string;
  date: string;
  fromAuthenticated: boolean;
}> {
  const parsed = await simpleParser(source);
  const text =
    (typeof parsed.text === "string" && parsed.text.trim()) ||
    (typeof parsed.html === "string" ? htmlToText(parsed.html) : "") ||
    "";

  const fromValue = parsed.from?.value?.[0];
  const authResults = parsed.headers?.get("authentication-results");
  return {
    text: normalizeBodyText(text),
    subject: parsed.subject?.trim() || "(без темы)",
    messageId: parsed.messageId || null,
    fromEmail: (fromValue?.address || "").trim().toLowerCase(),
    fromName: (fromValue?.name || fromValue?.address || "").trim(),
    date: parsed.date ? parsed.date.toISOString() : new Date().toISOString(),
    fromAuthenticated: isAuthenticatedSender(authResults)
  };
}

async function createPinnedImapClient(credentials: EmailCredentials): Promise<ImapFlow> {
  const endpoint = await resolveSafeMailEndpoint(credentials.imapHost, credentials.imapPort, "IMAP");
  return new ImapFlow({
    host: endpoint.ip,
    port: endpoint.port,
    secure: credentials.imapSecure,
    servername: endpoint.hostname,
    auth: {
      user: credentials.email,
      pass: credentials.password
    },
    logger: false,
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 30000
  });
}

/** Decode already-stored garbled bodies (base64 / quoted-printable leftovers). */
export function repairStoredEmailBody(body: string): string {
  const raw = body.replace(/\r\n/g, "\n").trim();
  if (!raw) {
    return raw;
  }

  const subjectSplit = raw.match(/^([^\n]+)\n\n([\s\S]+)$/);
  const subject = subjectSplit ? subjectSplit[1] : null;
  const payload = subjectSplit ? subjectSplit[2] : raw;

  let fixed = payload;

  const compact = payload.replace(/\s+/g, "");
  if (/^[A-Za-z0-9+/]+=*$/.test(compact) && compact.length >= 8 && compact.length % 4 === 0) {
    try {
      const decoded = Buffer.from(compact, "base64").toString("utf8").trim();
      if (decoded && /[а-яА-Яa-zA-Z]/.test(decoded) && !decoded.includes("\uFFFD")) {
        fixed = decoded;
      }
    } catch {
      /* keep */
    }
  } else if (/=(?:[0-9A-F]{2}|\r?\n)/i.test(payload) || payload.includes("=3D")) {
    const softStripped = payload.replace(/=\r?\n/g, "");
    const bytes: number[] = [];
    for (let i = 0; i < softStripped.length; i += 1) {
      if (softStripped[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(softStripped.slice(i + 1, i + 3))) {
        bytes.push(parseInt(softStripped.slice(i + 1, i + 3), 16));
        i += 2;
      } else {
        bytes.push(softStripped.charCodeAt(i) & 0xff);
      }
    }
    const decoded = Buffer.from(bytes).toString("utf8").trim();
    if (decoded) {
      fixed = /<html|<!doctype html|<style/i.test(decoded) ? htmlToText(decoded) : decoded;
    }
  }

  fixed = fixed.replace(/\r\n/g, "\n").trim();
  if (subject && subject !== "(без темы)") {
    // Avoid duplicating subject if payload already starts with it
    if (fixed.toLowerCase().startsWith(subject.toLowerCase())) {
      return fixed;
    }
    return `${subject}\n\n${fixed}`;
  }
  return fixed;
}

export async function verifyEmailImap(credentials: EmailCredentials): Promise<void> {
  const client = await createPinnedImapClient(credentials);

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    lock.release();
  } finally {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }
}

/** Highest UID currently in INBOX (0 if empty). Used to start polling from "now". */
export async function getMailboxHighestUid(credentials: EmailCredentials): Promise<number> {
  const client = await createPinnedImapClient(credentials);

  try {
    await client.connect();
    const status = await client.status("INBOX", { uidNext: true });
    const uidNext = Number(status.uidNext || 1);
    return Number.isFinite(uidNext) && uidNext > 1 ? uidNext - 1 : 0;
  } finally {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }
}

export async function fetchNewEmails(
  credentials: EmailCredentials,
  lastUid: number
): Promise<{ messages: FetchedEmail[]; maxUid: number }> {
  const client = await createPinnedImapClient(credentials);

  const messages: FetchedEmail[] = [];
  let maxUid = lastUid;

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const range = lastUid > 0 ? `${lastUid + 1}:*` : "1:*";
      for await (const message of client.fetch(range, {
        uid: true,
        envelope: true,
        source: true,
        flags: true
      })) {
        const uid = Number(message.uid || 0);
        if (!uid || uid <= lastUid) {
          continue;
        }
        maxUid = Math.max(maxUid, uid);

        const envelopeFrom = extractAddress(message.envelope?.from);
        if (!message.source) {
          continue;
        }

        const parsed = await parseMailSource(message.source);
        const fromEmail = parsed.fromEmail || envelopeFrom.email;
        if (!fromEmail) {
          console.warn(`Email skip uid=${uid}: empty from`);
          continue;
        }

        messages.push({
          uid,
          messageId: parsed.messageId || message.envelope?.messageId || null,
          fromEmail,
          fromName: parsed.fromName || envelopeFrom.name || fromEmail,
          subject: parsed.subject || message.envelope?.subject || "(без темы)",
          text: parsed.text,
          date: parsed.date,
          fromAuthenticated: parsed.fromAuthenticated
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }

  messages.sort((a, b) => a.uid - b.uid);
  return { messages, maxUid };
}
