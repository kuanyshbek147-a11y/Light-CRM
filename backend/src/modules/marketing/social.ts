import { query } from "../../db";
import { getInstagramCredentialsForWorkspace } from "../integrations/instagram/credentials";
import { publishInstagramFeedImage } from "../integrations/instagram/graph";
import { getTelegramCredentialsForWorkspace } from "../integrations/telegram/credentials";
import { sendTelegramTextMessage } from "../integrations/telegram/api";
import type { ContentPostChannel } from "./posts";

const SETTINGS = {
  telegramChannelId: "marketing_telegram_channel_id"
} as const;

export type MarketingSocialSettings = {
  telegramChannelId: string;
  telegramConnected: boolean;
  instagramConnected: boolean;
};

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
     ON CONFLICT (workspace_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [workspaceId, key, value]
  );
}

export async function getMarketingSocialSettings(
  workspaceId: string
): Promise<MarketingSocialSettings> {
  const [telegramChannelId, telegram, instagram] = await Promise.all([
    getSetting(workspaceId, SETTINGS.telegramChannelId),
    getTelegramCredentialsForWorkspace(workspaceId),
    getInstagramCredentialsForWorkspace(workspaceId)
  ]);
  return {
    telegramChannelId: (telegramChannelId || "").trim(),
    telegramConnected: Boolean(telegram?.botToken),
    instagramConnected: Boolean(instagram?.pageAccessToken && instagram?.igUserId)
  };
}

export async function setMarketingSocialSettings(
  workspaceId: string,
  input: { telegramChannelId?: string }
): Promise<MarketingSocialSettings> {
  if (input.telegramChannelId !== undefined) {
    await setSetting(workspaceId, SETTINGS.telegramChannelId, input.telegramChannelId.trim());
  }
  return getMarketingSocialSettings(workspaceId);
}

export async function publishPostToSocial(input: {
  workspaceId: string;
  channel: ContentPostChannel;
  title: string;
  body: string;
  imageUrl?: string | null;
}): Promise<{ externalId: string; target: string }> {
  const text = [input.title.trim(), input.body.trim()].filter(Boolean).join("\n\n").slice(0, 4000);

  if (input.channel === "telegram" || input.channel === "other") {
    const settings = await getMarketingSocialSettings(input.workspaceId);
    const channelId = settings.telegramChannelId;
    if (!channelId) {
      throw new Error("Не задан ID Telegram-канала в настройках маркетинга");
    }
    const credentials = await getTelegramCredentialsForWorkspace(input.workspaceId);
    if (!credentials?.botToken) {
      throw new Error("Telegram-бот не подключён");
    }
    const messageId = await sendTelegramTextMessage(credentials.botToken, channelId, text);
    if (!messageId) {
      throw new Error("Telegram channel send failed");
    }
    return { externalId: messageId, target: `telegram:${channelId}` };
  }

  if (input.channel === "instagram") {
    const imageUrl = (input.imageUrl || "").trim();
    if (!imageUrl) {
      throw new Error("Для Instagram нужна публичная ссылка на изображение (image_url)");
    }
    const credentials = await getInstagramCredentialsForWorkspace(input.workspaceId);
    if (!credentials?.pageAccessToken || !credentials.igUserId) {
      throw new Error("Instagram не подключён");
    }
    const mediaId = await publishInstagramFeedImage({
      igUserId: credentials.igUserId,
      accessToken: credentials.pageAccessToken,
      imageUrl,
      caption: text
    });
    return { externalId: mediaId, target: `instagram:${credentials.igUserId}` };
  }

  if (input.channel === "web") {
    throw new Error("Автопубликация на сайт пока не настроена — используйте статус «Опубликован» вручную");
  }

  throw new Error(`Автопубликация для канала ${input.channel} не поддерживается (используйте рассылку)`);
}
