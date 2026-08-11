import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { uploadsDir } from "../media/upload";
import type { ContentPostChannel } from "./posts";

export type GeneratedPostDraft = {
  title: string;
  body: string;
  hashtags: string;
  imagePrompt: string;
};

function getOpenAiConfig(): { apiKey: string; baseUrl: string; model: string } | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  return {
    apiKey,
    baseUrl: (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""),
    model: process.env.OPENAI_MODEL || "gpt-4o-mini"
  };
}

export function isMarketingAiConfigured(): boolean {
  return Boolean(getOpenAiConfig());
}

function publicBaseUrl(): string {
  return (
    process.env.PUBLIC_BASE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    "https://light-crm-backend.onrender.com"
  ).replace(/\/+$/, "");
}

function channelHint(channel: ContentPostChannel | string): string {
  switch (channel) {
    case "instagram":
      return "Стиль Instagram: эмоции, короткий абзац, 3–8 хэштегов, CTA.";
    case "telegram":
      return "Стиль Telegram-канала: ясный текст, можно 1–2 эмодзи, без воды.";
    case "whatsapp":
      return "Стиль WhatsApp-рассылки: лично, коротко, обращение на вы, CTA.";
    case "web":
      return "Стиль поста для сайта/блога: понятный заголовок и 2–4 абзаца.";
    default:
      return "Нейтральный маркетинговый тон, коротко и по делу.";
  }
}

function parseGeneratedJson(raw: string): GeneratedPostDraft {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(cleaned) as Partial<GeneratedPostDraft>;
    return {
      title: String(parsed.title || "Пост").trim().slice(0, 120),
      body: String(parsed.body || "").trim().slice(0, 3500),
      hashtags: String(parsed.hashtags || "").trim().slice(0, 400),
      imagePrompt: String(parsed.imagePrompt || parsed.title || "marketing poster").trim().slice(0, 800)
    };
  } catch {
    return {
      title: "Черновик поста",
      body: cleaned.slice(0, 3500),
      hashtags: "",
      imagePrompt: "clean modern marketing visual, soft light, no text"
    };
  }
}

export async function generateMarketingPostText(input: {
  topic: string;
  channel?: string;
  tone?: string;
  offer?: string;
  language?: string;
}): Promise<GeneratedPostDraft | { error: string }> {
  const config = getOpenAiConfig();
  if (!config) {
    return { error: "openai_not_configured" };
  }

  const topic = input.topic.trim();
  if (!topic) {
    return { error: "topic_required" };
  }

  const channel = (input.channel || "telegram").trim().toLowerCase();
  const tone = (input.tone || "дружелюбный, экспертный").trim();
  const offer = (input.offer || "").trim();
  const language = (input.language || "ru").trim();

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.7,
        max_tokens: 700,
        messages: [
          {
            role: "system",
            content:
              "Ты маркетолог для малого бизнеса в Казахстане/СНГ. Верни ТОЛЬКО JSON без markdown: " +
              '{"title":"...","body":"...","hashtags":"#a #b","imagePrompt":"english visual prompt"}. ' +
              "body — готовый текст поста без заголовка. imagePrompt — на английском, без текста на картинке."
          },
          {
            role: "user",
            content: [
              `Язык текста: ${language}`,
              `Канал: ${channel}. ${channelHint(channel)}`,
              `Тон: ${tone}`,
              offer ? `Оффер/детали: ${offer}` : "",
              `Тема: ${topic}`
            ]
              .filter(Boolean)
              .join("\n")
          }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Marketing text generate failed", response.status, errText.slice(0, 400));
      return { error: "openai_text_failed" };
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return { error: "openai_empty_response" };
    }

    const draft = parseGeneratedJson(content);
    if (!draft.body) {
      return { error: "openai_empty_response" };
    }
    if (draft.hashtags && !draft.body.includes("#")) {
      draft.body = `${draft.body}\n\n${draft.hashtags}`.trim();
    }
    return draft;
  } catch (error) {
    console.error("Marketing text generate error", error);
    return { error: "openai_text_failed" };
  }
}

export async function generateMarketingImage(input: {
  prompt: string;
  title?: string;
}): Promise<{ imageUrl: string; relativeUrl: string; revisedPrompt?: string } | { error: string }> {
  const config = getOpenAiConfig();
  if (!config) {
    return { error: "openai_not_configured" };
  }

  const prompt = [
    input.prompt.trim(),
    input.title ? `Context: ${input.title.trim()}` : "",
    "Square social media marketing image, clean composition, no watermarks, no readable text overlays."
  ]
    .filter(Boolean)
    .join(". ")
    .slice(0, 900);

  if (!prompt.trim()) {
    return { error: "image_prompt_required" };
  }

  const imageModel = process.env.OPENAI_IMAGE_MODEL || "dall-e-3";

  try {
    const response = await fetch(`${config.baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: imageModel,
        prompt,
        n: 1,
        size: "1024x1024",
        response_format: "b64_json"
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Marketing image generate failed", response.status, errText.slice(0, 400));
      return { error: "openai_image_failed" };
    }

    const payload = (await response.json()) as {
      data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
    };
    const item = payload.data?.[0];
    if (!item) {
      return { error: "openai_empty_response" };
    }

    await fs.mkdir(uploadsDir, { recursive: true });
    const fileName = `marketing-${Date.now()}-${randomUUID().slice(0, 8)}.png`;
    const filePath = path.join(uploadsDir, fileName);

    if (item.b64_json) {
      await fs.writeFile(filePath, Buffer.from(item.b64_json, "base64"));
    } else if (item.url) {
      const imageResponse = await fetch(item.url);
      if (!imageResponse.ok) {
        return { error: "openai_image_download_failed" };
      }
      const buffer = Buffer.from(await imageResponse.arrayBuffer());
      await fs.writeFile(filePath, buffer);
    } else {
      return { error: "openai_empty_response" };
    }

    const relativeUrl = `/uploads/${fileName}`;
    return {
      imageUrl: `${publicBaseUrl()}${relativeUrl}`,
      relativeUrl,
      revisedPrompt: item.revised_prompt
    };
  } catch (error) {
    console.error("Marketing image generate error", error);
    return { error: "openai_image_failed" };
  }
}

export type GeneratedWeekItem = GeneratedPostDraft & {
  dayOffset: number;
  theme: string;
};

function parseWeekJson(raw: string): GeneratedWeekItem[] {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }
  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { posts?: unknown }).posts)
      ? ((parsed as { posts: unknown[] }).posts)
      : [];

  return list
    .map((item, index) => {
      const row = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      const draft = parseGeneratedJson(JSON.stringify(row));
      const dayOffset = Number(row.dayOffset ?? row.day ?? index);
      return {
        ...draft,
        dayOffset: Number.isFinite(dayOffset) ? Math.max(0, Math.min(13, Math.floor(dayOffset))) : index,
        theme: String(row.theme || row.role || `День ${index + 1}`).trim().slice(0, 80)
      };
    })
    .filter((item) => item.body);
}

export function plannedAtForWeekDay(dayOffset: number, hourLocal = 11): string {
  const date = new Date();
  // Approximate Asia/Almaty (UTC+5) publish slot without tz lib
  const almatyOffsetMin = 5 * 60;
  const utc = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + dayOffset + 1,
    hourLocal - 5,
    0,
    0,
    0
  );
  void almatyOffsetMin;
  return new Date(utc).toISOString();
}

export async function generateMarketingWeekPlan(input: {
  topic: string;
  channel?: string;
  tone?: string;
  offer?: string;
  language?: string;
  days?: number;
}): Promise<GeneratedWeekItem[] | { error: string }> {
  const config = getOpenAiConfig();
  if (!config) {
    return { error: "openai_not_configured" };
  }

  const topic = input.topic.trim();
  if (!topic) {
    return { error: "topic_required" };
  }

  const days = Math.min(7, Math.max(3, Number(input.days) || 7));
  const channel = (input.channel || "telegram").trim().toLowerCase();
  const tone = (input.tone || "дружелюбный, экспертный").trim();
  const offer = (input.offer || "").trim();
  const language = (input.language || "ru").trim();

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.75,
        max_tokens: 3200,
        messages: [
          {
            role: "system",
            content:
              "Ты контент-маркетолог. Верни ТОЛЬКО JSON-массив из N постов без markdown. " +
              'Элемент: {"dayOffset":0,"theme":"...","title":"...","body":"...","hashtags":"#a #b","imagePrompt":"english"}. ' +
              "Микс недели: боль клиента, совет, кейс/история, оффер, FAQ, соцдоказательство, CTA. " +
              "Посты разные, без повторов. body на языке пользователя, imagePrompt на английском без текста на картинке."
          },
          {
            role: "user",
            content: [
              `N=${days}`,
              `Язык: ${language}`,
              `Канал: ${channel}. ${channelHint(channel)}`,
              `Тон: ${tone}`,
              offer ? `Оффер/продукт: ${offer}` : "",
              `Тема недели / продукт: ${topic}`,
              "dayOffset: 0..N-1 по порядку."
            ]
              .filter(Boolean)
              .join("\n")
          }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Marketing week generate failed", response.status, errText.slice(0, 400));
      return { error: "openai_text_failed" };
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return { error: "openai_empty_response" };
    }

    const items = parseWeekJson(content).slice(0, days);
    if (!items.length) {
      return { error: "openai_empty_response" };
    }

    return items.map((item, index) => {
      let body = item.body;
      if (item.hashtags && !body.includes("#")) {
        body = `${body}\n\n${item.hashtags}`.trim();
      }
      return {
        ...item,
        body,
        dayOffset: index,
        title: item.title || `${item.theme || "Пост"} · день ${index + 1}`
      };
    });
  } catch (error) {
    console.error("Marketing week generate error", error);
    return { error: "openai_text_failed" };
  }
}
