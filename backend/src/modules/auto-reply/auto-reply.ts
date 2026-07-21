import { Server } from "socket.io";
import { query } from "../../db";

const KEYS = {
  enabled: "auto_reply_enabled",
  mode: "auto_reply_mode",
  defaultText: "auto_reply_default_text",
  systemPrompt: "auto_reply_system_prompt",
  firstOnly: "auto_reply_first_only"
} as const;

export type AutoReplyMode = "rules" | "ai";

export type AutoReplySettings = {
  enabled: boolean;
  mode: AutoReplyMode;
  defaultText: string;
  systemPrompt: string;
  firstOnly: boolean;
  aiConfigured: boolean;
};

const DEFAULT_TEXT =
  "Здравствуйте! Спасибо за сообщение. Мы получили его и скоро ответим. Если вопрос срочный — напишите, пожалуйста, детали.";

const DEFAULT_SYSTEM_PROMPT =
  "Ты — вежливый ассистент компании в CRM. Отвечай кратко на русском (2–4 предложения). " +
  "Не выдумывай цены и факты. Если не уверен — попроси подождать ответа менеджера. " +
  "Не используй markdown-заголовки.";

async function getSetting(workspaceId: string, key: string): Promise<string | null> {
  const rows = await query<{ value: string }>(
    `SELECT value FROM workspace_settings WHERE workspace_id = $1 AND key = $2 LIMIT 1`,
    [workspaceId, key]
  );
  return rows[0]?.value ?? null;
}

async function setSetting(workspaceId: string, key: string, value: string): Promise<void> {
  await query(
    `INSERT INTO workspace_settings (workspace_id, key, value)
     VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, key) DO UPDATE SET value = EXCLUDED.value`,
    [workspaceId, key, value]
  );
}

export function isOpenAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export async function getAutoReplySettings(workspaceId: string): Promise<AutoReplySettings> {
  const [enabled, mode, defaultText, systemPrompt, firstOnly] = await Promise.all([
    getSetting(workspaceId, KEYS.enabled),
    getSetting(workspaceId, KEYS.mode),
    getSetting(workspaceId, KEYS.defaultText),
    getSetting(workspaceId, KEYS.systemPrompt),
    getSetting(workspaceId, KEYS.firstOnly)
  ]);

  const resolvedMode: AutoReplyMode =
    mode === "ai" && isOpenAiConfigured() ? "ai" : mode === "ai" ? "rules" : mode === "rules" ? "rules" : "rules";

  return {
    enabled: enabled === "1" || enabled === "true",
    mode: mode === "ai" ? "ai" : resolvedMode,
    defaultText: (defaultText || DEFAULT_TEXT).trim() || DEFAULT_TEXT,
    systemPrompt: (systemPrompt || DEFAULT_SYSTEM_PROMPT).trim() || DEFAULT_SYSTEM_PROMPT,
    firstOnly: firstOnly !== "0" && firstOnly !== "false",
    aiConfigured: isOpenAiConfigured()
  };
}

export async function saveAutoReplySettings(
  workspaceId: string,
  patch: {
    enabled?: boolean;
    mode?: AutoReplyMode;
    defaultText?: string;
    systemPrompt?: string;
    firstOnly?: boolean;
  }
): Promise<AutoReplySettings> {
  if (typeof patch.enabled === "boolean") {
    await setSetting(workspaceId, KEYS.enabled, patch.enabled ? "1" : "0");
  }
  if (patch.mode === "ai" || patch.mode === "rules") {
    await setSetting(workspaceId, KEYS.mode, patch.mode);
  }
  if (typeof patch.defaultText === "string") {
    await setSetting(workspaceId, KEYS.defaultText, patch.defaultText.trim() || DEFAULT_TEXT);
  }
  if (typeof patch.systemPrompt === "string") {
    await setSetting(
      workspaceId,
      KEYS.systemPrompt,
      patch.systemPrompt.trim() || DEFAULT_SYSTEM_PROMPT
    );
  }
  if (typeof patch.firstOnly === "boolean") {
    await setSetting(workspaceId, KEYS.firstOnly, patch.firstOnly ? "1" : "0");
  }
  return getAutoReplySettings(workspaceId);
}

function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

async function pickRulesReply(workspaceId: string, incomingBody: string, fallback: string): Promise<string> {
  const text = normalizeForMatch(incomingBody);
  if (!text) {
    return fallback;
  }

  const scripts = await query<{ title: string; body: string; category: string | null }>(
    `SELECT title, body, category
     FROM message_scripts
     WHERE workspace_id = $1
     ORDER BY created_at DESC
     LIMIT 80`,
    [workspaceId]
  );

  let best: { score: number; body: string } | null = null;
  for (const script of scripts) {
    const title = normalizeForMatch(script.title || "");
    const category = normalizeForMatch(script.category || "");
    const bodyNorm = normalizeForMatch(script.body || "");
    let score = 0;
    if (title && text.includes(title)) {
      score += 5;
    }
    if (category && text.includes(category)) {
      score += 3;
    }
    const keywords = title.split(/[\s,/|]+/).filter((part) => part.length >= 3);
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        score += 1;
      }
    }
    // Greeting intents
    if (/^(привет|здравствуйте|добрый|салам|hello|hi)\b/.test(text) && /привет|здравствуй|добро пожаловать/i.test(script.body)) {
      score += 4;
    }
    if (score > 0 && script.body.trim()) {
      if (!best || score > best.score) {
        best = { score, body: script.body.trim() };
      }
    }
    void bodyNorm;
  }

  return best?.body || fallback;
}

async function pickAiReply(params: {
  workspaceId: string;
  incomingBody: string;
  systemPrompt: string;
  fallback: string;
}): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return pickRulesReply(params.workspaceId, params.incomingBody, params.fallback);
  }

  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const scripts = await query<{ title: string; body: string }>(
    `SELECT title, body FROM message_scripts WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [params.workspaceId]
  );
  const scriptContext = scripts
    .map((item) => `- ${item.title}: ${item.body}`)
    .join("\n")
    .slice(0, 3500);

  const recent = await query<{ direction: string; body: string }>(
    `SELECT direction, body
     FROM messages
     WHERE workspace_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [params.workspaceId]
  );
  void recent;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 220,
        messages: [
          { role: "system", content: params.systemPrompt },
          {
            role: "system",
            content: scriptContext
              ? `Готовые формулировки компании (можно перефразировать):\n${scriptContext}`
              : "Готовых скриптов нет — ответь вежливо и коротко."
          },
          { role: "user", content: params.incomingBody.slice(0, 1500) }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Auto-reply AI failed", response.status, errText.slice(0, 300));
      return pickRulesReply(params.workspaceId, params.incomingBody, params.fallback);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return pickRulesReply(params.workspaceId, params.incomingBody, params.fallback);
    }
    return content.slice(0, 2000);
  } catch (error) {
    console.error("Auto-reply AI error", error);
    return pickRulesReply(params.workspaceId, params.incomingBody, params.fallback);
  }
}

async function countIncomingInConversation(conversationId: string): Promise<number> {
  const rows = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM messages
     WHERE conversation_id = $1 AND direction = 'incoming'`,
    [conversationId]
  );
  return Number(rows[0]?.count || 0);
}

async function deliverText(params: {
  conversationId: string;
  workspaceId: string;
  channel: string;
  body: string;
  messageId: string;
  createdAt: string;
}): Promise<string | null> {
  const { conversationId, workspaceId, channel, body, messageId, createdAt } = params;
  // Dynamic imports avoid circular deps with channel modules that call maybeAutoReply.
  if (channel === "whatsapp") {
    const { sendWhatsAppMessageForConversation } = await import("../../whatsapp");
    return sendWhatsAppMessageForConversation(conversationId, workspaceId, body);
  }
  if (channel === "telegram") {
    const { sendTelegramMessageForConversation } = await import("../../telegram");
    return sendTelegramMessageForConversation(conversationId, workspaceId, body);
  }
  if (channel === "instagram") {
    const { sendInstagramMessageForConversation } = await import("../integrations/instagram");
    return sendInstagramMessageForConversation(conversationId, workspaceId, body);
  }
  if (channel === "email") {
    const { sendEmailMessageForConversation } = await import("../integrations/email");
    return sendEmailMessageForConversation(conversationId, workspaceId, body);
  }
  if (channel === "web") {
    const { sendWebChatMessageForConversation } = await import("../integrations/webchat");
    return sendWebChatMessageForConversation(conversationId, workspaceId, body, messageId, createdAt);
  }
  return null;
}

export async function maybeAutoReply(params: {
  workspaceId: string;
  conversationId: string;
  channel: string;
  incomingBody: string;
  io?: Server;
}): Promise<void> {
  const { workspaceId, conversationId, channel, incomingBody, io } = params;
  const settings = await getAutoReplySettings(workspaceId);
  if (!settings.enabled) {
    return;
  }

  const bodyTrim = (incomingBody || "").trim();
  if (!bodyTrim || bodyTrim.startsWith("[")) {
    // Skip pure media placeholders unless we want a generic ack — still reply with default
    if (!bodyTrim) {
      return;
    }
  }

  if (settings.firstOnly) {
    const incomingCount = await countIncomingInConversation(conversationId);
    // current incoming already inserted → allow only when this is the first incoming
    if (incomingCount > 1) {
      return;
    }
  }

  // Avoid double-fire within a few seconds (webhook retries)
  const recentAuto = await query<{ id: string }>(
    `SELECT id
     FROM messages
     WHERE conversation_id = $1
       AND direction = 'outgoing'
       AND body LIKE '[Автоответ]%'
       AND created_at > now() - interval '45 seconds'
     LIMIT 1`,
    [conversationId]
  );
  if (recentAuto[0]) {
    return;
  }

  const replyCore =
    settings.mode === "ai" && settings.aiConfigured
      ? await pickAiReply({
          workspaceId,
          incomingBody: bodyTrim,
          systemPrompt: settings.systemPrompt,
          fallback: settings.defaultText
        })
      : await pickRulesReply(workspaceId, bodyTrim, settings.defaultText);

  const replyBody = `[Автоответ] ${replyCore}`.slice(0, 4000);

  const inserted = await query<{ id: string; created_at: string }>(
    `INSERT INTO messages (conversation_id, workspace_id, direction, body)
     VALUES ($1, $2, 'outgoing', $3)
     RETURNING id, created_at`,
    [conversationId, workspaceId, replyBody]
  );

  await query(`UPDATE conversations SET updated_at = now() WHERE id = $1`, [conversationId]);

  const messageId = inserted[0].id;
  const createdAt = inserted[0].created_at;

  io?.emit("message:new", {
    conversationId,
    messageId,
    direction: "outgoing",
    body: replyBody,
    createdAt
  });

  try {
    const externalId = await deliverText({
      conversationId,
      workspaceId,
      channel,
      body: replyCore,
      messageId,
      createdAt
    });
    if (externalId) {
      await query(`UPDATE messages SET external_message_id = $1 WHERE id = $2`, [
        externalId,
        messageId
      ]);
    }
  } catch (error) {
    console.error("Auto-reply delivery failed", error);
  }
}
