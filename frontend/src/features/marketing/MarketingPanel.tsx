import { useCallback, useEffect, useState } from "react";
import {
  activateAdsCampaign,
  createAdsCampaign,
  loadAdsAudiences,
  loadAdsCampaigns,
  loadAdsSettings,
  pauseAdsCampaign,
  refreshAdsCampaignMetrics,
  saveAdsSettings,
  syncAdsAudience,
  type AdsAudience,
  type AdsCampaign,
  type AdsSettings
} from "../ads/api";
import {
  approveMarketingPost,
  createMarketingCampaign,
  createMarketingPost,
  createMarketingSegment,
  createMarketingSequence,
  deleteMarketingPost,
  deleteMarketingSegment,
  generateMarketingImage,
  generateMarketingText,
  generateMarketingWeek,
  loadCampaignReports,
  loadMarketingRoiReport,
  loadMarketingInboundReport,
  loadMarketingAiStatus,
  loadMarketingCampaigns,
  loadMarketingPosts,
  loadMarketingSegments,
  loadMarketingSequences,
  loadMarketingSocialSettings,
  postToMarketingCampaign,
  publishMarketingPostSocial,
  rewriteMarketingPost,
  saveMarketingSocialSettings,
  startMarketingCampaign,
  startMarketingSequence,
  updateMarketingPost,
  type CampaignReport,
  type MarketingCampaign,
  type MarketingContentPost,
  type MarketingInboundReport,
  type MarketingRoiReport,
  type MarketingSegment,
  type MarketingSegmentFilter,
  type MarketingSequence,
  type MarketingSocialSettings
} from "./api";
import { LandingPagesPanel } from "./LandingPagesPanel";

type Props = {
  authToken: string;
  onToast?: (message: string, kind: "success" | "error") => void;
};

const emptyFilter: MarketingSegmentFilter = {
  city: "",
  client_type: "",
  category: "",
  channel: "",
  deal_stage: ""
};

const campaignStatusLabel: Record<MarketingCampaign["status"], string> = {
  draft: "Черновик",
  queued: "В очереди",
  sending: "Отправляется",
  done: "Готово",
  cancelled: "Отменена",
  failed: "Ошибка"
};

const postStatusLabel: Record<MarketingContentPost["status"], string> = {
  idea: "Идея",
  draft: "Черновик",
  ready: "Готов",
  published: "Опубликован",
  cancelled: "Отменён"
};

const postChannelLabel: Record<MarketingContentPost["channel"], string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  instagram: "Instagram",
  web: "Сайт",
  other: "Другое"
};

function fromLocalInputValue(value: string): string | null {
  if (!value.trim()) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

export function MarketingPanel({ authToken, onToast }: Props) {
  const [segments, setSegments] = useState<MarketingSegment[]>([]);
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [posts, setPosts] = useState<MarketingContentPost[]>([]);
  const [reports, setReports] = useState<CampaignReport[]>([]);
  const [roiReport, setRoiReport] = useState<MarketingRoiReport>({ ads: [], landings: [] });
  const [inboundReport, setInboundReport] = useState<MarketingInboundReport>({
    periodDays: 14,
    posts: { total: 0, published: 0, ready: 0, withError: 0, items: [] },
    inbound: {
      instagramDialogs: 0,
      whatsappDialogs: 0,
      telegramDialogs: 0,
      demoRequests: 0,
      dealsOpen: 0,
      dealsWon: 0,
      revenueWon: 0
    },
    demos: []
  });
  const [sequences, setSequences] = useState<MarketingSequence[]>([]);
  const [marketingTab, setMarketingTab] = useState<
    "plan" | "calendar" | "series" | "reports" | "ads" | "landings"
  >("plan");
  const [campaignTemplateName, setCampaignTemplateName] = useState("");
  const [seqName, setSeqName] = useState("Серия 0/3/7");
  const [seqStep0, setSeqStep0] = useState("Здравствуйте, {{name}}! Это первое касание.");
  const [seqStep3, setSeqStep3] = useState("{{name}}, напоминаем о нашем предложении.");
  const [seqStep7, setSeqStep7] = useState("{{name}}, последний soft follow-up. Готовы обсудить?");
  const [seqTemplate, setSeqTemplate] = useState("");
  const [socialSettings, setSocialSettings] = useState<MarketingSocialSettings>({
    telegramChannelId: "",
    telegramConnected: false,
    instagramConnected: false
  });
  const [telegramChannelDraft, setTelegramChannelDraft] = useState("");
  const [segmentName, setSegmentName] = useState("");
  const [filter, setFilter] = useState<MarketingSegmentFilter>(emptyFilter);
  const [campaignName, setCampaignName] = useState("");
  const [campaignSegmentId, setCampaignSegmentId] = useState("");
  const [campaignChannel, setCampaignChannel] = useState<"whatsapp" | "telegram">("whatsapp");
  const [campaignBody, setCampaignBody] = useState(
    "Здравствуйте, {{name}}! Напоминаем о нашем предложении."
  );
  const [postTitle, setPostTitle] = useState("");
  const [postBody, setPostBody] = useState("");
  const [postChannel, setPostChannel] = useState<MarketingContentPost["channel"]>("telegram");
  const [postStatus, setPostStatus] = useState<MarketingContentPost["status"]>("ready");
  const [postPlannedLocal, setPostPlannedLocal] = useState("");
  const [postSegmentId, setPostSegmentId] = useState("");
  const [postImageUrl, setPostImageUrl] = useState("");
  const [postAutoBroadcast, setPostAutoBroadcast] = useState(false);
  const [postAutoSocial, setPostAutoSocial] = useState(true);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [genTopic, setGenTopic] = useState("");
  const [genOffer, setGenOffer] = useState("");
  const [genTone, setGenTone] = useState("дружелюбный, экспертный");
  const [imagePrompt, setImagePrompt] = useState("");
  const [weekDays, setWeekDays] = useState(7);
  const [weekWithImages, setWeekWithImages] = useState(false);
  const [weekAutoSocial, setWeekAutoSocial] = useState(false);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [adsSettings, setAdsSettings] = useState<AdsSettings | null>(null);
  const [adsAudiences, setAdsAudiences] = useState<AdsAudience[]>([]);
  const [adsCampaigns, setAdsCampaigns] = useState<AdsCampaign[]>([]);
  const [adsTokenDraft, setAdsTokenDraft] = useState("");
  const [adsAccountDraft, setAdsAccountDraft] = useState("");
  const [adsPageDraft, setAdsPageDraft] = useState("");
  const [adsSyncSegmentId, setAdsSyncSegmentId] = useState("");
  const [adsCampaignName, setAdsCampaignName] = useState("");
  const [adsAudienceId, setAdsAudienceId] = useState("");
  const [adsPostId, setAdsPostId] = useState("");
  const [adsDailyBudget, setAdsDailyBudget] = useState("5000");
  const [adsCurrency, setAdsCurrency] = useState("KZT");
  const [adsLinkUrl, setAdsLinkUrl] = useState("");

  const refresh = useCallback(async () => {
    const settled = await Promise.allSettled([
      loadMarketingSegments(authToken),
      loadMarketingCampaigns(authToken),
      loadMarketingPosts(authToken),
      loadMarketingSocialSettings(authToken),
      loadMarketingAiStatus(authToken),
      loadCampaignReports(authToken),
      loadMarketingSequences(authToken),
      loadAdsSettings(authToken),
      loadAdsAudiences(authToken),
      loadAdsCampaigns(authToken),
      loadMarketingRoiReport(authToken),
      loadMarketingInboundReport(authToken, 14)
    ]);
    const value = <T,>(index: number, fallback: T): T => {
      const item = settled[index];
      return item?.status === "fulfilled" ? (item.value as T) : fallback;
    };

    const nextSegments = value(0, [] as Awaited<ReturnType<typeof loadMarketingSegments>>);
    const nextCampaigns = value(1, [] as Awaited<ReturnType<typeof loadMarketingCampaigns>>);
    const nextPosts = value(2, [] as Awaited<ReturnType<typeof loadMarketingPosts>>);
    const nextSocial = value(3, null as Awaited<ReturnType<typeof loadMarketingSocialSettings>>);
    const nextAi = value(4, null as Awaited<ReturnType<typeof loadMarketingAiStatus>>);
    const nextReports = value(5, [] as Awaited<ReturnType<typeof loadCampaignReports>>);
    const nextSequences = value(6, [] as Awaited<ReturnType<typeof loadMarketingSequences>>);
    const nextAdsSettings = value(7, null as Awaited<ReturnType<typeof loadAdsSettings>>);
    const nextAdsAudiences = value(8, [] as Awaited<ReturnType<typeof loadAdsAudiences>>);
    const nextAdsCampaigns = value(9, [] as Awaited<ReturnType<typeof loadAdsCampaigns>>);
    const nextRoi = value(10, { ads: [], landings: [] } as MarketingRoiReport);
    const nextInbound = value(11, {
      periodDays: 14,
      posts: { total: 0, published: 0, ready: 0, withError: 0, items: [] },
      inbound: {
        instagramDialogs: 0,
        whatsappDialogs: 0,
        telegramDialogs: 0,
        demoRequests: 0,
        dealsOpen: 0,
        dealsWon: 0,
        revenueWon: 0
      },
      demos: []
    } as MarketingInboundReport);

    setSegments(nextSegments);
    setCampaigns(nextCampaigns);
    setPosts(nextPosts);
    setReports(nextReports);
    setRoiReport(nextRoi);
    setInboundReport(nextInbound);
    setSequences(nextSequences);
    setAdsAudiences(nextAdsAudiences);
    setAdsCampaigns(nextAdsCampaigns);
    if (nextSocial) {
      setSocialSettings(nextSocial);
      setTelegramChannelDraft(nextSocial.telegramChannelId || "");
    }
    if (nextAdsSettings) {
      setAdsSettings(nextAdsSettings);
      setAdsAccountDraft(nextAdsSettings.adAccountId || "");
      setAdsPageDraft(nextAdsSettings.pageId || "");
      if (nextAdsSettings.defaultLinkUrl) {
        setAdsLinkUrl((prev) => prev || nextAdsSettings.defaultLinkUrl);
      }
    }
    setAiConfigured(Boolean(nextAi?.configured));
    if (!campaignSegmentId && nextSegments[0]) {
      setCampaignSegmentId(nextSegments[0].id);
    }
    if (!postSegmentId && nextSegments[0]) {
      setPostSegmentId(nextSegments[0].id);
    }
    if (!adsSyncSegmentId && nextSegments[0]) {
      setAdsSyncSegmentId(nextSegments[0].id);
    }
    if (!adsAudienceId && nextAdsAudiences[0]) {
      setAdsAudienceId(nextAdsAudiences[0].id);
    }
  }, [authToken, campaignSegmentId, postSegmentId, adsSyncSegmentId, adsAudienceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const hasActive =
      campaigns.some((c) => c.status === "queued" || c.status === "sending") ||
      posts.some((p) => p.status === "ready" && p.planned_at && !p.schedule_processed_at);
    if (!hasActive) {
      return;
    }
    const timer = window.setInterval(() => {
      void refresh();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [campaigns, posts, refresh]);

  async function submitSegment(): Promise<void> {
    const name = segmentName.trim();
    if (!name) {
      onToast?.("Укажите название сегмента", "error");
      return;
    }
    setBusy(true);
    try {
      const cleanFilter: MarketingSegmentFilter = {};
      for (const key of Object.keys(filter) as Array<keyof MarketingSegmentFilter>) {
        const value = String(filter[key] || "").trim();
        if (value) {
          cleanFilter[key] = value;
        }
      }
      const created = await createMarketingSegment(authToken, { name, filter: cleanFilter });
      if (!created) {
        onToast?.("Не удалось создать сегмент", "error");
        return;
      }
      setSegmentName("");
      setFilter(emptyFilter);
      setCampaignSegmentId(created.id);
      setPostSegmentId(created.id);
      onToast?.(`Сегмент создан · ${created.contact_count || 0} контактов`, "success");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeSegment(segmentId: string): Promise<void> {
    setBusy(true);
    try {
      const ok = await deleteMarketingSegment(authToken, segmentId);
      if (!ok) {
        onToast?.("Не удалось удалить сегмент", "error");
        return;
      }
      if (campaignSegmentId === segmentId) setCampaignSegmentId("");
      if (postSegmentId === segmentId) setPostSegmentId("");
      onToast?.("Сегмент удалён", "success");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function submitCampaign(): Promise<void> {
    const name = campaignName.trim();
    const body = campaignBody.trim();
    if (!name || !body || !campaignSegmentId) {
      onToast?.("Заполните название, сегмент и текст", "error");
      return;
    }
    setBusy(true);
    try {
      const created = await createMarketingCampaign(authToken, {
        name,
        segmentId: campaignSegmentId,
        channel: campaignChannel,
        body,
        templateName: campaignTemplateName.trim() || undefined,
        templateLang: "ru"
      });
      if (!created) {
        onToast?.("Не удалось создать кампанию", "error");
        return;
      }
      setCampaignName("");
      onToast?.("Кампания создана (черновик)", "success");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function launchCampaign(campaignId: string): Promise<void> {
    setBusy(true);
    try {
      const started = await startMarketingCampaign(authToken, campaignId);
      if (!started) {
        onToast?.("Не удалось запустить: пустой сегмент или неверный статус", "error");
        return;
      }
      onToast?.(`Рассылка запущена · ${started.recipients_total || 0} получателей`, "success");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function submitPost(): Promise<void> {
    const title = postTitle.trim();
    const body = postBody.trim();
    if (!title || !body) {
      onToast?.("Укажите заголовок и текст поста", "error");
      return;
    }
    if (postAutoBroadcast && !postSegmentId) {
      onToast?.("Для авторассылки выберите сегмент", "error");
      return;
    }
    setBusy(true);
    try {
      const created = await createMarketingPost(authToken, {
        title,
        body,
        channel: postChannel,
        status: postStatus,
        plannedAt: fromLocalInputValue(postPlannedLocal),
        segmentId: postSegmentId || null,
        autoBroadcast: postAutoBroadcast,
        autoPublishSocial: postAutoSocial,
        imageUrl: postImageUrl.trim() || null
      });
      if (!created) {
        onToast?.("Не удалось сохранить пост", "error");
        return;
      }
      setPostTitle("");
      setPostBody("");
      setPostImageUrl("");
      setPostPlannedLocal("");
      setPostStatus("ready");
      onToast?.("Пост добавлен в контент-план", "success");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function changePostStatus(
    postId: string,
    status: MarketingContentPost["status"]
  ): Promise<void> {
    setBusy(true);
    try {
      const updated = await updateMarketingPost(authToken, postId, { status });
      if (!updated) {
        onToast?.("Не удалось обновить статус", "error");
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removePost(postId: string): Promise<void> {
    setBusy(true);
    try {
      const ok = await deleteMarketingPost(authToken, postId);
      if (!ok) {
        onToast?.("Не удалось удалить пост", "error");
        return;
      }
      onToast?.("Пост удалён", "success");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function retrySchedule(postId: string): Promise<void> {
    setBusy(true);
    try {
      const updated = await updateMarketingPost(authToken, postId, {
        status: "ready",
        clearScheduleProcessed: true
      });
      if (!updated) {
        onToast?.("Не удалось сбросить расписание", "error");
        return;
      }
      onToast?.("Пост снова в очереди автозапуска", "success");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function publishSocialNow(postId: string): Promise<void> {
    setBusy(true);
    try {
      const published = await publishMarketingPostSocial(authToken, postId);
      if (!published) {
        onToast?.("Публикация не удалась — проверьте канал и настройки", "error");
        await refresh();
        return;
      }
      onToast?.("Опубликовано в соцсеть", "success");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function makeCampaignFromPost(post: MarketingContentPost, start: boolean): Promise<void> {
    const segmentId = post.segment_id || campaignSegmentId || postSegmentId;
    if (!segmentId) {
      onToast?.("Сначала создайте и выберите сегмент", "error");
      return;
    }
    setBusy(true);
    try {
      const channel =
        post.channel === "telegram" ? "telegram" : ("whatsapp" as "whatsapp" | "telegram");
      const result = await postToMarketingCampaign(authToken, post.id, {
        segmentId,
        channel,
        start
      });
      if (!result) {
        onToast?.("Не удалось создать рассылку из поста", "error");
        return;
      }
      onToast?.(
        start
          ? `Рассылка запущена · ${result.campaign.recipients_total || 0} получателей`
          : "Черновик кампании создан из поста",
        "success"
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveSocial(): Promise<void> {
    setBusy(true);
    try {
      const saved = await saveMarketingSocialSettings(authToken, {
        telegramChannelId: telegramChannelDraft.trim()
      });
      if (!saved) {
        onToast?.("Не удалось сохранить настройки соцсетей", "error");
        return;
      }
      setSocialSettings(saved);
      onToast?.("Настройки автопубликации сохранены", "success");
    } finally {
      setBusy(false);
    }
  }

  async function runGenerateText(): Promise<void> {
    if (!genTopic.trim()) {
      onToast?.("Укажите тему для генерации", "error");
      return;
    }
    setGenerating(true);
    try {
      const draft = await generateMarketingText(authToken, {
        topic: genTopic.trim(),
        channel: postChannel,
        tone: genTone.trim() || undefined,
        offer: genOffer.trim() || undefined
      });
      if (!draft) {
        onToast?.(
          aiConfigured
            ? "Не удалось сгенерировать текст"
            : "OpenAI не настроен на сервере (OPENAI_API_KEY)",
          "error"
        );
        return;
      }
      setPostTitle(draft.title);
      setPostBody(draft.body);
      setImagePrompt(draft.imagePrompt || draft.title);
      if (postStatus === "idea") {
        setPostStatus("draft");
      }
      onToast?.("Текст сгенерирован — можно править и сохранить", "success");
    } finally {
      setGenerating(false);
    }
  }

  async function runGenerateImage(): Promise<void> {
    const prompt = (imagePrompt || postTitle || genTopic).trim();
    if (!prompt) {
      onToast?.("Нужен промпт картинки или тема", "error");
      return;
    }
    setGenerating(true);
    try {
      const result = await generateMarketingImage(authToken, {
        prompt,
        title: postTitle || genTopic
      });
      if (!result) {
        onToast?.(
          aiConfigured
            ? "Не удалось сгенерировать картинку"
            : "OpenAI не настроен на сервере (OPENAI_API_KEY)",
          "error"
        );
        return;
      }
      setPostImageUrl(result.imageUrl);
      onToast?.("Картинка готова", "success");
    } finally {
      setGenerating(false);
    }
  }

  async function runGenerateWeek(): Promise<void> {
    if (!genTopic.trim()) {
      onToast?.("Укажите тему недели / продукт", "error");
      return;
    }
    setGenerating(true);
    try {
      const result = await generateMarketingWeek(authToken, {
        topic: genTopic.trim(),
        channel: postChannel,
        tone: genTone.trim() || undefined,
        offer: genOffer.trim() || undefined,
        days: weekDays,
        status: "draft",
        autoPublishSocial: weekAutoSocial,
        autoBroadcast: false,
        segmentId: postSegmentId || null,
        withImages: weekWithImages
      });
      if (!result) {
        onToast?.(
          aiConfigured
            ? "Не удалось собрать контент на неделю"
            : "OpenAI не настроен на сервере (OPENAI_API_KEY)",
          "error"
        );
        return;
      }
      onToast?.(`В план добавлено постов: ${result.count}`, "success");
      await refresh();
    } finally {
      setGenerating(false);
    }
  }

  async function approvePost(postId: string): Promise<void> {
    setBusy(true);
    try {
      const updated = await approveMarketingPost(authToken, postId);
      if (!updated) {
        onToast?.("Не удалось утвердить", "error");
        return;
      }
      onToast?.("Пост утверждён (Готов)", "success");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function rewritePost(postId: string): Promise<void> {
    setBusy(true);
    try {
      const updated = await rewriteMarketingPost(authToken, postId);
      if (!updated) {
        onToast?.("Не удалось переписать", "error");
        return;
      }
      onToast?.("Текст переписан ИИ", "success");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function submitSequence(): Promise<void> {
    if (!postSegmentId || !seqName.trim()) {
      onToast?.("Нужны название и сегмент", "error");
      return;
    }
    setBusy(true);
    try {
      const created = await createMarketingSequence(authToken, {
        name: seqName.trim(),
        segmentId: postSegmentId,
        channel: campaignChannel,
        step0Body: seqStep0,
        step3Body: seqStep3,
        step7Body: seqStep7,
        templateName: seqTemplate.trim() || undefined,
        templateLang: "ru"
      });
      if (!created) {
        onToast?.("Не удалось создать серию", "error");
        return;
      }
      onToast?.("Серия создана", "success");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function launchSequence(id: string): Promise<void> {
    setBusy(true);
    try {
      const started = await startMarketingSequence(authToken, id);
      if (!started) {
        onToast?.("Не удалось запустить серию", "error");
        return;
      }
      onToast?.(`Серия активна · pending ${started.pending_runs || 0}`, "success");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveAdsConnection(): Promise<void> {
    setBusy(true);
    try {
      const saved = await saveAdsSettings(authToken, {
        accessToken: adsTokenDraft.trim() || undefined,
        adAccountId: adsAccountDraft.trim() || undefined,
        pageId: adsPageDraft.trim() || undefined
      });
      if (!saved) {
        onToast?.("Не удалось сохранить настройки Ads", "error");
        return;
      }
      setAdsTokenDraft("");
      setAdsSettings(saved);
      onToast?.(saved.connected ? "Meta Ads подключены" : "Настройки сохранены", "success");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function syncAudience(): Promise<void> {
    if (!adsSyncSegmentId) {
      onToast?.("Выберите сегмент", "error");
      return;
    }
    setBusy(true);
    try {
      const synced = await syncAdsAudience(authToken, { segmentId: adsSyncSegmentId });
      if (!synced) {
        onToast?.("Синхронизация не удалась: проверьте Ads token и сегмент", "error");
        return;
      }
      setAdsAudienceId(synced.id);
      onToast?.(
        `Аудитория «${synced.name}» · ${synced.size} · ${synced.status}`,
        synced.status === "failed" ? "error" : "success"
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function launchAdsCampaign(): Promise<void> {
    const name = adsCampaignName.trim();
    const budget = Number(adsDailyBudget);
    if (!name || !adsAudienceId || !Number.isFinite(budget) || budget <= 0) {
      onToast?.("Укажите название, аудиторию и дневной бюджет", "error");
      return;
    }
    setBusy(true);
    try {
      const created = await createAdsCampaign(authToken, {
        audienceId: adsAudienceId,
        postId: adsPostId || undefined,
        name,
        dailyBudget: budget,
        currency: adsCurrency,
        activate: true,
        linkUrl: adsLinkUrl.trim() || undefined
      });
      if (!created) {
        onToast?.("Не удалось создать кампанию Ads", "error");
        return;
      }
      setAdsCampaignName("");
      onToast?.(
        `Кампания «${created.name}» · ${created.status}`,
        created.status === "failed" ? "error" : "success"
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function toggleAdsCampaign(campaign: AdsCampaign): Promise<void> {
    setBusy(true);
    try {
      const next =
        campaign.status === "active" || campaign.status === "pending_review"
          ? await pauseAdsCampaign(authToken, campaign.id)
          : await activateAdsCampaign(authToken, campaign.id);
      if (!next) {
        onToast?.("Не удалось изменить статус кампании", "error");
        return;
      }
      onToast?.(`Статус: ${next.status}`, "success");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function refreshAdsMetrics(campaignId: string): Promise<void> {
    setBusy(true);
    try {
      const updated = await refreshAdsCampaignMetrics(authToken, campaignId);
      if (!updated) {
        onToast?.("Не удалось обновить метрики", "error");
        return;
      }
      onToast?.("Метрики обновлены", "success");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  function localDateKey(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function weekCalendarDays(): Array<{ key: string; label: string; items: MarketingContentPost[] }> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const dayNames = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
    return Array.from({ length: 7 }).map((_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      // Use local calendar date — toISOString() shifts the day in UTC+ timezones.
      const key = localDateKey(day);
      const items = posts.filter((post) => {
        if (!post.planned_at) return false;
        return localDateKey(new Date(post.planned_at)) === key;
      });
      return {
        key,
        label: `${dayNames[day.getDay()]} ${day.getDate()}.${day.getMonth() + 1}`,
        items
      };
    });
  }

  return (
    <section className="knowledgePage card">
      <div className="railHeader">
        <div>
          <div className="sidebarTitle">Маркетинг</div>
          <div className="sidebarHint">
            Контент-план, лендинги, ИИ, серии 0/3/7, отчёты, таргет Meta Ads и автопубликация.
            {aiConfigured ? " · ИИ доступен" : " · ИИ: задайте OPENAI_API_KEY на backend"}
          </div>
        </div>
      </div>

      <div className="pipelineFilterButtons" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        {(
          [
            ["plan", "План"],
            ["landings", "Лендинг"],
            ["calendar", "Календарь"],
            ["series", "Серии 0/3/7"],
            ["reports", "Отчёты"],
            ["ads", "Таргет"]
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`leftMenuButton ${marketingTab === id ? "active" : ""}`}
            onClick={() => setMarketingTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {marketingTab === "landings" ? (
        <LandingPagesPanel
          authToken={authToken}
          onToast={onToast}
          onUseInAds={(publicUrl, meta) => {
            setAdsLinkUrl(publicUrl);
            if (meta?.title) {
              setAdsCampaignName((prev) => prev.trim() || meta.title || "");
            }
            setMarketingTab("ads");
            void (async () => {
              const saved = await saveAdsSettings(authToken, { defaultLinkUrl: publicUrl });
              if (saved) {
                setAdsSettings(saved);
                onToast?.("Ссылка с UTM вставлена в Ads", "success");
                return;
              }
              onToast?.("Ссылка с UTM вставлена в форму Ads", "success");
            })();
          }}
        />
      ) : null}

      {marketingTab === "ads" ? (
        <div style={{ marginBottom: 24 }}>
          <div className="knowledgeFormCard" style={{ marginBottom: 20 }}>
            <div className="scriptPanelTitle">Meta Ads — подключение</div>
            <div className="sidebarHint" style={{ marginBottom: 10 }}>
              Нужен Marketing API token с правами ads_management / ads_read (отдельно от WhatsApp/Instagram).
              {adsSettings?.connected
                ? ` · подключено${adsSettings.connectedAt ? ` · ${new Date(adsSettings.connectedAt).toLocaleString("ru-RU")}` : ""}`
                : " · не подключено"}
            </div>
            <div className="scriptForm">
              <input
                className="filterInput"
                type="password"
                placeholder={
                  adsSettings?.hasToken
                    ? "Access token (оставьте пустым, чтобы не менять)"
                    : "Access token Marketing API"
                }
                value={adsTokenDraft}
                onChange={(event) => setAdsTokenDraft(event.target.value)}
              />
              <input
                className="filterInput"
                placeholder="Ad Account ID (act_…)"
                value={adsAccountDraft}
                onChange={(event) => setAdsAccountDraft(event.target.value)}
              />
              <input
                className="filterInput"
                placeholder="Page ID (для креатива)"
                value={adsPageDraft}
                onChange={(event) => setAdsPageDraft(event.target.value)}
              />
              <button
                type="button"
                className="primaryButton"
                disabled={busy}
                onClick={() => void saveAdsConnection()}
              >
                Сохранить Ads
              </button>
            </div>
          </div>

          <div className="knowledgeFormCard" style={{ marginBottom: 20 }}>
            <div className="scriptPanelTitle">Custom Audience из сегмента</div>
            <div className="scriptForm">
              <select
                className="filterInput"
                value={adsSyncSegmentId}
                onChange={(event) => setAdsSyncSegmentId(event.target.value)}
              >
                <option value="">Сегмент CRM</option>
                {segments.map((segment) => (
                  <option key={segment.id} value={segment.id}>
                    {segment.name}
                    {typeof segment.contact_count === "number"
                      ? ` · ${segment.contact_count}`
                      : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="dialogActionBtn primary"
                disabled={busy || !adsSyncSegmentId}
                onClick={() => void syncAudience()}
              >
                Синхронизировать сегмент
              </button>
            </div>
            {adsAudiences.length ? (
              adsAudiences.map((audience) => (
                <div key={audience.id} className="taskCard" style={{ marginTop: 10 }}>
                  <div className="taskCardTitle">{audience.name}</div>
                  <div className="taskCardMeta">
                    {audience.status} · size {audience.size}
                    {audience.last_sync_at
                      ? ` · sync ${new Date(audience.last_sync_at).toLocaleString("ru-RU")}`
                      : ""}
                    {audience.last_error ? ` · ${audience.last_error}` : ""}
                  </div>
                </div>
              ))
            ) : (
              <div className="emptyScriptState" style={{ marginTop: 10 }}>
                Аудиторий пока нет
              </div>
            )}
          </div>

          <div className="knowledgeFormCard" style={{ marginBottom: 20 }}>
            <div className="scriptPanelTitle">Запустить кампанию</div>
            <div className="scriptForm">
              <input
                className="filterInput"
                placeholder="Название кампании"
                value={adsCampaignName}
                onChange={(event) => setAdsCampaignName(event.target.value)}
              />
              <select
                className="filterInput"
                value={adsAudienceId}
                onChange={(event) => setAdsAudienceId(event.target.value)}
              >
                <option value="">Аудитория</option>
                {adsAudiences.map((audience) => (
                  <option key={audience.id} value={audience.id}>
                    {audience.name} · {audience.size}
                  </option>
                ))}
              </select>
              <select
                className="filterInput"
                value={adsPostId}
                onChange={(event) => setAdsPostId(event.target.value)}
              >
                <option value="">Креатив из контент-плана (опционально)</option>
                {posts.map((post) => (
                  <option key={post.id} value={post.id}>
                    {post.title || post.body.slice(0, 40)}
                    {post.image_url ? " · img" : ""}
                  </option>
                ))}
              </select>
              <input
                className="filterInput"
                placeholder="Дневной бюджет (в валюте кабинета)"
                value={adsDailyBudget}
                onChange={(event) => setAdsDailyBudget(event.target.value)}
              />
              <select
                className="filterInput"
                value={adsCurrency}
                onChange={(event) => setAdsCurrency(event.target.value)}
              >
                <option value="KZT">KZT</option>
                <option value="USD">USD</option>
              </select>
              <input
                className="filterInput"
                placeholder="Ссылка объявления (с UTM из лендинга)"
                value={adsLinkUrl}
                onChange={(event) => setAdsLinkUrl(event.target.value)}
              />
              {adsLinkUrl ? (
                <div className="sidebarHint">
                  Для атрибуции в CRM ссылка должна содержать utm_source / utm_campaign
                </div>
              ) : null}
              <button
                type="button"
                className="primaryButton"
                disabled={busy}
                onClick={() => void launchAdsCampaign()}
              >
                Запустить в Meta
              </button>
            </div>
          </div>

          <div className="scriptPanelTitle">Кампании Ads</div>
          {adsCampaigns.length ? (
            adsCampaigns.map((campaign) => {
              const metrics = campaign.metrics_json || {};
              const spend = Number(metrics.spend || 0);
              const clicks = Number(metrics.clicks || 0);
              const ctr = Number(metrics.ctr || 0);
              return (
                <div key={campaign.id} className="taskCard" style={{ marginTop: 10 }}>
                  <div className="taskCardTitle">{campaign.name}</div>
                  <div className="taskCardMeta">
                    {campaign.status} · {campaign.audience_name || "без аудитории"} ·{" "}
                    {(campaign.daily_budget_cents / 100).toLocaleString("ru-RU")}{" "}
                    {campaign.currency}/день
                    {campaign.last_error ? ` · ${campaign.last_error}` : ""}
                  </div>
                  <div className="taskCardMeta">
                    spend {spend} · clicks {clicks} · CTR {ctr}%
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="dialogActionBtn"
                      disabled={busy}
                      onClick={() => void toggleAdsCampaign(campaign)}
                    >
                      {campaign.status === "active" || campaign.status === "pending_review"
                        ? "Пауза"
                        : "Активировать"}
                    </button>
                    <button
                      type="button"
                      className="dialogActionBtn"
                      disabled={busy}
                      onClick={() => void refreshAdsMetrics(campaign.id)}
                    >
                      Обновить метрики
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="emptyScriptState">Кампаний Ads пока нет</div>
          )}
        </div>
      ) : null}

      {marketingTab === "calendar" ? (
        <div style={{ marginBottom: 24 }}>
          <div className="scriptPanelTitle">Календарь на 7 дней</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 10,
              marginTop: 12
            }}
          >
            {weekCalendarDays().map((day) => (
              <div key={day.key} className="taskCard" style={{ minHeight: 120 }}>
                <div className="taskCardTitle">{day.label}</div>
                {day.items.length ? (
                  day.items.map((post) => (
                    <div key={post.id} className="sidebarHint" style={{ marginTop: 6 }}>
                      {postStatusLabel[post.status]} · {post.title}
                      {post.planned_at ? (
                        <div style={{ opacity: 0.75 }}>
                          {new Date(post.planned_at).toLocaleTimeString("ru-RU", {
                            hour: "2-digit",
                            minute: "2-digit"
                          })}
                          {post.auto_publish_social ? " · авто IG" : ""}
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="sidebarHint" style={{ marginTop: 8 }}>
                    Нет постов
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {marketingTab === "series" ? (
        <div style={{ marginBottom: 24 }}>
          <div className="knowledgeFormCard" style={{ marginBottom: 16 }}>
            <div className="scriptPanelTitle">Серия follow-up (день 0 / 3 / 7)</div>
            <div className="scriptForm">
              <input className="filterInput" value={seqName} onChange={(e) => setSeqName(e.target.value)} />
              <textarea className="filterInput" rows={2} value={seqStep0} onChange={(e) => setSeqStep0(e.target.value)} />
              <textarea className="filterInput" rows={2} value={seqStep3} onChange={(e) => setSeqStep3(e.target.value)} />
              <textarea className="filterInput" rows={2} value={seqStep7} onChange={(e) => setSeqStep7(e.target.value)} />
              <input
                className="filterInput"
                placeholder="WhatsApp HSM template name (опционально для дня 0)"
                value={seqTemplate}
                onChange={(e) => setSeqTemplate(e.target.value)}
              />
              <button type="button" className="primaryButton" disabled={busy} onClick={() => void submitSequence()}>
                Создать серию
              </button>
            </div>
          </div>
          {sequences.map((sequence) => (
            <div key={sequence.id} className="taskCard">
              <div className="taskCardTitle">{sequence.name}</div>
              <div className="taskCardMeta">
                {sequence.status} · {sequence.channel} · pending {sequence.pending_runs || 0}
                {sequence.template_name ? ` · HSM ${sequence.template_name}` : ""}
              </div>
              {sequence.status === "draft" || sequence.status === "paused" ? (
                <button
                  type="button"
                  className="dialogActionBtn primary"
                  style={{ marginTop: 10 }}
                  disabled={busy}
                  onClick={() => void launchSequence(sequence.id)}
                >
                  Запустить серию
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {marketingTab === "reports" ? (
        <div style={{ marginBottom: 24 }}>
          <div className="scriptPanelTitle">Воронка контента → демо</div>
          <div className="sidebarHint" style={{ marginBottom: 10 }}>
            За {inboundReport.periodDays} дн.: посты Instagram, входящие диалоги и заявки «ДЕМО / пилот»
          </div>
          <div className="ownerKpiGrid" style={{ marginBottom: 14 }}>
            <div className="ownerKpiCard">
              <div className="analyticsValue">{inboundReport.posts.published}</div>
              <div className="analyticsLabel">IG опубликовано</div>
            </div>
            <div className="ownerKpiCard">
              <div className="analyticsValue">{inboundReport.posts.ready}</div>
              <div className="analyticsLabel">IG в очереди</div>
            </div>
            <div className="ownerKpiCard">
              <div className="analyticsValue">{inboundReport.inbound.demoRequests}</div>
              <div className="analyticsLabel">Заявки ДЕМО</div>
            </div>
            <div className="ownerKpiCard">
              <div className="analyticsValue">
                {inboundReport.inbound.instagramDialogs}/{inboundReport.inbound.whatsappDialogs}/
                {inboundReport.inbound.telegramDialogs}
              </div>
              <div className="analyticsLabel">Диалоги IG / WA / TG</div>
            </div>
            <div className="ownerKpiCard">
              <div className="analyticsValue">{inboundReport.inbound.dealsWon}</div>
              <div className="analyticsLabel">Won по демо</div>
            </div>
            <div className="ownerKpiCard">
              <div className="analyticsValue">
                {new Intl.NumberFormat("ru-KZ").format(inboundReport.inbound.revenueWon)} ₸
              </div>
              <div className="analyticsLabel">Выручка по демо</div>
            </div>
          </div>

          {inboundReport.posts.withError ? (
            <div className="integrationsError" style={{ marginBottom: 12 }}>
              Ошибки публикации IG: {inboundReport.posts.withError}
            </div>
          ) : null}

          <div className="analyticsManagersTable" style={{ marginBottom: 18 }}>
            <div className="analyticsManagersHead" style={{ gridTemplateColumns: "1.6fr 0.7fr 1fr 1.2fr" }}>
              <span>Пост IG</span>
              <span>Статус</span>
              <span>План / публикация</span>
              <span>Ошибка</span>
            </div>
            {inboundReport.posts.items.map((row) => (
              <div
                key={row.id}
                className="analyticsManagersRow"
                style={{ gridTemplateColumns: "1.6fr 0.7fr 1fr 1.2fr" }}
              >
                <span>{row.title}</span>
                <strong>{postStatusLabel[row.status as MarketingContentPost["status"]] || row.status}</strong>
                <span>
                  {row.published_at
                    ? new Date(row.published_at).toLocaleString()
                    : row.planned_at
                      ? new Date(row.planned_at).toLocaleString()
                      : "—"}
                </span>
                <span>{row.publish_error || "—"}</span>
              </div>
            ))}
            {inboundReport.posts.items.length ? null : (
              <div className="analyticsManagersEmpty">Нет Instagram-постов</div>
            )}
          </div>

          <div className="scriptPanelTitle">Заявки ДЕМО</div>
          <div className="analyticsManagersTable" style={{ marginBottom: 18 }}>
            <div className="analyticsManagersHead" style={{ gridTemplateColumns: "1fr 0.6fr 1.4fr 0.7fr" }}>
              <span>Контакт</span>
              <span>Канал</span>
              <span>Сообщение</span>
              <span>Сделка</span>
            </div>
            {inboundReport.demos.map((row) => (
              <div
                key={`${row.conversation_id}-${row.created_at}`}
                className="analyticsManagersRow"
                style={{ gridTemplateColumns: "1fr 0.6fr 1.4fr 0.7fr" }}
              >
                <span>{row.contact_name}</span>
                <strong>{row.channel}</strong>
                <span>{row.preview || "—"}</span>
                <span>
                  {row.deal_stage
                    ? `${row.deal_stage}${row.deal_outcome && row.deal_outcome !== "open" ? ` (${row.deal_outcome})` : ""}`
                    : "—"}
                </span>
              </div>
            ))}
            {inboundReport.demos.length ? null : (
              <div className="analyticsManagersEmpty">
                Пока нет входящих с текстом «демо / пилот / записаться»
              </div>
            )}
          </div>

          <div className="scriptPanelTitle">Реклама → деньги</div>
          <div className="sidebarHint" style={{ marginBottom: 10 }}>
            Сквозная связка: Meta spend / лендинги → лиды → won → CPA / ROAS
          </div>
          <div className="analyticsManagersTable" style={{ marginBottom: 18 }}>
            <div className="analyticsManagersHead" style={{ gridTemplateColumns: "1.4fr repeat(6, 0.7fr)" }}>
              <span>Ads кампания</span>
              <span>Spend</span>
              <span>Clicks</span>
              <span>Лиды</span>
              <span>Won</span>
              <span>Revenue</span>
              <span>ROAS</span>
            </div>
            {roiReport.ads.map((row) => (
              <div
                key={row.campaign_id}
                className="analyticsManagersRow"
                style={{ gridTemplateColumns: "1.4fr repeat(6, 0.7fr)" }}
              >
                <span>{row.name}</span>
                <strong>{row.spend}</strong>
                <strong>{row.clicks}</strong>
                <strong>{row.leads}</strong>
                <strong>{row.won_deals}</strong>
                <strong>{row.revenue}</strong>
                <strong>{row.roas != null ? row.roas : "—"}</strong>
              </div>
            ))}
            {roiReport.ads.length ? null : (
              <div className="analyticsManagersEmpty">Нет Ads кампаний</div>
            )}
          </div>

          <div className="analyticsManagersTable" style={{ marginBottom: 18 }}>
            <div className="analyticsManagersHead" style={{ gridTemplateColumns: "1.4fr repeat(4, 0.7fr)" }}>
              <span>Лендинг</span>
              <span>Клики</span>
              <span>Лиды</span>
              <span>Won</span>
              <span>Revenue</span>
            </div>
            {roiReport.landings.map((row) => (
              <div
                key={row.landing_id}
                className="analyticsManagersRow"
                style={{ gridTemplateColumns: "1.4fr repeat(4, 0.7fr)" }}
              >
                <span>{row.title}</span>
                <strong>{row.clicks}</strong>
                <strong>{row.leads}</strong>
                <strong>{row.won_deals}</strong>
                <strong>{row.revenue}</strong>
              </div>
            ))}
            {roiReport.landings.length ? null : (
              <div className="analyticsManagersEmpty">Нет лендингов</div>
            )}
          </div>

          <div className="scriptPanelTitle">Отчёты кампаний (broadcast)</div>
          {reports.length ? (
            reports.map((report) => (
              <div key={report.campaign_id} className="taskCard">
                <div className="taskCardTitle">{report.name}</div>
                <div className="taskCardMeta">
                  {report.status} · {report.channel} · sent {report.sent} · replies {report.replied} (
                  {report.reply_rate}%) · deals {report.deals_touched} · won {report.deals_won}
                </div>
              </div>
            ))
          ) : (
            <div className="emptyScriptState">Отчётов broadcast пока нет</div>
          )}
        </div>
      ) : null}

      {marketingTab === "plan" ? (
        <>
      <div className="knowledgeFormCard" style={{ marginBottom: 20 }}>
        <div className="scriptPanelTitle">ИИ — сгенерировать пост</div>
        <div className="scriptForm">
          <input
            className="filterInput"
            placeholder="Тема (например: акция на пилот CRM 14 дней)"
            value={genTopic}
            onChange={(event) => setGenTopic(event.target.value)}
          />
          <input
            className="filterInput"
            placeholder="Оффер / детали (необязательно)"
            value={genOffer}
            onChange={(event) => setGenOffer(event.target.value)}
          />
          <input
            className="filterInput"
            placeholder="Тон"
            value={genTone}
            onChange={(event) => setGenTone(event.target.value)}
          />
          <button
            type="button"
            className="primaryButton"
            disabled={busy || generating}
            onClick={() => void runGenerateText()}
          >
            {generating ? "Генерация…" : "Сгенерировать текст"}
          </button>
          <input
            className="filterInput"
            placeholder="Промпт для картинки (англ./рус.)"
            value={imagePrompt}
            onChange={(event) => setImagePrompt(event.target.value)}
          />
          <button
            type="button"
            className="dialogActionBtn primary"
            disabled={busy || generating}
            onClick={() => void runGenerateImage()}
          >
            Сгенерировать картинку
          </button>
          <div className="sidebarHint" style={{ marginTop: 8 }}>
            Контент на неделю — сразу в план (черновики с датами с завтра 11:00 Алматы):
          </div>
          <select
            className="filterInput"
            value={weekDays}
            onChange={(event) => setWeekDays(Number(event.target.value) || 7)}
          >
            <option value={3}>3 дня</option>
            <option value={5}>5 дней</option>
            <option value={7}>7 дней</option>
          </select>
          <label className="sidebarHint" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={weekWithImages}
              onChange={(event) => setWeekWithImages(event.target.checked)}
            />
            Сразу сгенерировать картинки (дольше и дороже)
          </label>
          <label className="sidebarHint" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={weekAutoSocial}
              onChange={(event) => setWeekAutoSocial(event.target.checked)}
            />
            Включить автопубликацию по дате (после проверки статусом «Готов»)
          </label>
          <button
            type="button"
            className="primaryButton"
            disabled={busy || generating}
            onClick={() => void runGenerateWeek()}
          >
            {generating ? "Генерация недели…" : "Контент на неделю"}
          </button>
        </div>
        {postImageUrl ? (
          <div style={{ marginTop: 12 }}>
            <img
              src={postImageUrl}
              alt="Сгенерированная картинка"
              style={{ maxWidth: "100%", maxHeight: 240, borderRadius: 12, objectFit: "cover" }}
            />
          </div>
        ) : null}
      </div>

      <div className="knowledgeFormCard" style={{ marginBottom: 20 }}>
        <div className="scriptPanelTitle">Автопубликация в соцсети</div>
        <div className="sidebarHint" style={{ marginBottom: 10 }}>
          Telegram: {socialSettings.telegramConnected ? "бот подключён" : "бот не подключён"} ·
          Instagram: {socialSettings.instagramConnected ? "подключён" : "не подключён"}
        </div>
        <div className="scriptForm">
          <input
            className="filterInput"
            placeholder="ID Telegram-канала (@channel или -100...)"
            value={telegramChannelDraft}
            onChange={(event) => setTelegramChannelDraft(event.target.value)}
          />
          <button type="button" className="primaryButton" disabled={busy} onClick={() => void saveSocial()}>
            Сохранить
          </button>
        </div>
        <div className="sidebarHint" style={{ marginTop: 8 }}>
          Бот должен быть админом канала. Instagram: публичный URL картинки + право content_publish
          (переподключите Instagram в Интеграциях).
        </div>
      </div>

      <div className="knowledgeFormCard" style={{ marginBottom: 20 }}>
        <div className="scriptPanelTitle">Контент-план — новый пост</div>
        <div className="scriptForm">
          <input
            className="filterInput"
            placeholder="Заголовок / тема"
            value={postTitle}
            onChange={(event) => setPostTitle(event.target.value)}
          />
          <select
            className="filterInput"
            value={postChannel}
            onChange={(event) =>
              setPostChannel(event.target.value as MarketingContentPost["channel"])
            }
          >
            <option value="telegram">Telegram-канал</option>
            <option value="instagram">Instagram</option>
            <option value="whatsapp">WhatsApp (рассылка)</option>
            <option value="web">Сайт</option>
            <option value="other">Другое / TG</option>
          </select>
          <select
            className="filterInput"
            value={postStatus}
            onChange={(event) =>
              setPostStatus(event.target.value as MarketingContentPost["status"])
            }
          >
            <option value="idea">Идея</option>
            <option value="draft">Черновик</option>
            <option value="ready">Готов (для автозапуска)</option>
            <option value="published">Опубликован</option>
          </select>
          <input
            className="filterInput"
            type="datetime-local"
            value={postPlannedLocal}
            onChange={(event) => setPostPlannedLocal(event.target.value)}
          />
          <select
            className="filterInput"
            value={postSegmentId}
            onChange={(event) => setPostSegmentId(event.target.value)}
          >
            <option value="">Сегмент для авторассылки</option>
            {segments.map((segment) => (
              <option key={segment.id} value={segment.id}>
                {segment.name} ({segment.contact_count ?? 0})
              </option>
            ))}
          </select>
          <input
            className="filterInput"
            placeholder="URL картинки (обязательно для Instagram)"
            value={postImageUrl}
            onChange={(event) => setPostImageUrl(event.target.value)}
          />
          <textarea
            className="filterInput"
            rows={5}
            placeholder="Текст поста или рассылки"
            value={postBody}
            onChange={(event) => setPostBody(event.target.value)}
          />
          <label className="sidebarHint" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={postAutoSocial}
              onChange={(event) => setPostAutoSocial(event.target.checked)}
            />
            Автопубликация в соцсеть по дате (Telegram / Instagram)
          </label>
          <label className="sidebarHint" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={postAutoBroadcast}
              onChange={(event) => setPostAutoBroadcast(event.target.checked)}
            />
            Авторассылка клиентам по дате (WhatsApp / Telegram DM)
          </label>
          <button type="button" className="primaryButton" disabled={busy} onClick={() => void submitPost()}>
            Добавить в план
          </button>
        </div>
        <div className="sidebarHint" style={{ marginTop: 8 }}>
          Автозапуск: статус «Готов» + дата/время. После успешной отправки статус станет
          «Опубликован».
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div className="scriptPanelTitle">Посты и тексты</div>
        {posts.length ? (
          posts.map((post) => (
            <div key={post.id} className="taskCard">
              <div className="taskCardTitle">{post.title}</div>
              <div className="taskCardMeta">
                {postStatusLabel[post.status]} · {postChannelLabel[post.channel]}
                {post.planned_at
                  ? ` · план ${new Date(post.planned_at).toLocaleString()}`
                  : ""}
                {post.auto_publish_social ? " · авто-соцсеть" : ""}
                {post.auto_broadcast ? " · авто-рассылка" : ""}
                {post.campaign_id ? " · есть кампания" : ""}
                {post.social_external_id ? " · опубликовано" : ""}
              </div>
              {post.publish_error ? (
                <div className="sidebarHint" style={{ marginTop: 8, color: "#b91c1c" }}>
                  Ошибка: {post.publish_error}
                </div>
              ) : null}
              <div className="sidebarHint" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
                {post.body}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <select
                  className="filterInput"
                  style={{ maxWidth: 160 }}
                  value={post.status}
                  disabled={busy}
                  onChange={(event) =>
                    void changePostStatus(
                      post.id,
                      event.target.value as MarketingContentPost["status"]
                    )
                  }
                >
                  <option value="idea">Идея</option>
                  <option value="draft">Черновик</option>
                  <option value="ready">Готов</option>
                  <option value="published">Опубликован</option>
                  <option value="cancelled">Отменён</option>
                </select>
                <button
                  type="button"
                  className="dialogActionBtn primary"
                  disabled={busy}
                  onClick={() => void publishSocialNow(post.id)}
                >
                  В соцсеть сейчас
                </button>
                {post.status === "draft" || post.status === "idea" ? (
                  <>
                    <button
                      type="button"
                      className="dialogActionBtn primary"
                      disabled={busy}
                      onClick={() => void approvePost(post.id)}
                    >
                      Утвердить
                    </button>
                    <button
                      type="button"
                      className="dialogActionBtn"
                      disabled={busy}
                      onClick={() => void rewritePost(post.id)}
                    >
                      Переписать ИИ
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className="dialogActionBtn primary"
                  disabled={busy || !(post.segment_id || campaignSegmentId || postSegmentId)}
                  onClick={() => void makeCampaignFromPost(post, false)}
                >
                  Сделать рассылку
                </button>
                <button
                  type="button"
                  className="dialogActionBtn primary"
                  disabled={busy || !(post.segment_id || campaignSegmentId || postSegmentId)}
                  onClick={() => void makeCampaignFromPost(post, true)}
                >
                  Рассылка сейчас
                </button>
                {post.schedule_processed_at || post.publish_error ? (
                  <button
                    type="button"
                    className="dialogActionBtn"
                    disabled={busy}
                    onClick={() => void retrySchedule(post.id)}
                  >
                    Повторить автозапуск
                  </button>
                ) : null}
                <button
                  type="button"
                  className="dialogActionBtn"
                  disabled={busy}
                  onClick={() => void removePost(post.id)}
                >
                  Удалить
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="emptyScriptState">Постов в плане пока нет</div>
        )}
      </div>

      <div className="knowledgeFormCard" style={{ marginBottom: 20 }}>
        <div className="scriptPanelTitle">Новый сегмент</div>
        <div className="scriptForm">
          <input
            className="filterInput"
            placeholder="Название сегмента"
            value={segmentName}
            onChange={(event) => setSegmentName(event.target.value)}
          />
          <input
            className="filterInput"
            placeholder="Город"
            value={filter.city || ""}
            onChange={(event) => setFilter((prev) => ({ ...prev, city: event.target.value }))}
          />
          <input
            className="filterInput"
            placeholder="Тип клиента"
            value={filter.client_type || ""}
            onChange={(event) => setFilter((prev) => ({ ...prev, client_type: event.target.value }))}
          />
          <input
            className="filterInput"
            placeholder="Категория"
            value={filter.category || ""}
            onChange={(event) => setFilter((prev) => ({ ...prev, category: event.target.value }))}
          />
          <input
            className="filterInput"
            placeholder="Канал контакта (whatsapp / telegram)"
            value={filter.channel || ""}
            onChange={(event) => setFilter((prev) => ({ ...prev, channel: event.target.value }))}
          />
          <input
            className="filterInput"
            placeholder="Этап сделки"
            value={filter.deal_stage || ""}
            onChange={(event) => setFilter((prev) => ({ ...prev, deal_stage: event.target.value }))}
          />
          <button type="button" className="primaryButton" disabled={busy} onClick={() => void submitSegment()}>
            Создать сегмент
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div className="scriptPanelTitle">Сегменты</div>
        {segments.length ? (
          segments.map((segment) => (
            <div key={segment.id} className="taskCard">
              <div className="taskCardTitle">{segment.name}</div>
              <div className="taskCardMeta">
                {segment.contact_count ?? 0} контактов
                {Object.keys(segment.filter_json || {}).length
                  ? ` · ${Object.entries(segment.filter_json)
                      .filter(([, v]) => v)
                      .map(([k, v]) => `${k}=${v}`)
                      .join(", ")}`
                  : " · без фильтров"}
              </div>
              <button
                type="button"
                className={`dialogActionBtn ${
                  campaignSegmentId === segment.id || postSegmentId === segment.id ? "primary" : ""
                }`}
                style={{ marginTop: 10 }}
                disabled={busy}
                onClick={() => {
                  setCampaignSegmentId(segment.id);
                  setPostSegmentId(segment.id);
                }}
              >
                Выбрать
              </button>
              <button
                type="button"
                className="dialogActionBtn"
                style={{ marginTop: 10, marginLeft: 8 }}
                disabled={busy}
                onClick={() => void removeSegment(segment.id)}
              >
                Удалить
              </button>
            </div>
          ))
        ) : (
          <div className="emptyScriptState">Сегментов пока нет</div>
        )}
      </div>

      <div className="knowledgeFormCard" style={{ marginBottom: 20 }}>
        <div className="scriptPanelTitle">Новая кампания</div>
        <div className="scriptForm">
          <input
            className="filterInput"
            placeholder="Название кампании"
            value={campaignName}
            onChange={(event) => setCampaignName(event.target.value)}
          />
          <select
            className="filterInput"
            value={campaignSegmentId}
            onChange={(event) => setCampaignSegmentId(event.target.value)}
          >
            <option value="">Выберите сегмент</option>
            {segments.map((segment) => (
              <option key={segment.id} value={segment.id}>
                {segment.name} ({segment.contact_count ?? 0})
              </option>
            ))}
          </select>
          <select
            className="filterInput"
            value={campaignChannel}
            onChange={(event) => setCampaignChannel(event.target.value as "whatsapp" | "telegram")}
          >
            <option value="whatsapp">WhatsApp</option>
            <option value="telegram">Telegram</option>
          </select>
          <input
            className="filterInput"
            placeholder="WhatsApp HSM template (опционально)"
            value={campaignTemplateName}
            onChange={(event) => setCampaignTemplateName(event.target.value)}
          />
          <textarea
            className="filterInput"
            rows={4}
            placeholder="Текст рассылки"
            value={campaignBody}
            onChange={(event) => setCampaignBody(event.target.value)}
          />
          <button type="button" className="primaryButton" disabled={busy} onClick={() => void submitCampaign()}>
            Создать черновик
          </button>
        </div>
      </div>

      <div>
        <div className="scriptPanelTitle">Кампании</div>
        {campaigns.length ? (
          campaigns.map((campaign) => (
            <div key={campaign.id} className="taskCard">
              <div className="taskCardTitle">{campaign.name}</div>
              <div className="taskCardMeta">
                {campaignStatusLabel[campaign.status]} · {campaign.channel}
                {campaign.segment_name ? ` · ${campaign.segment_name}` : ""}
                {` · отправлено ${campaign.recipients_sent || 0}/${campaign.recipients_total || 0}`}
              </div>
              <div className="sidebarHint" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
                {campaign.body}
              </div>
              {campaign.status === "draft" || campaign.status === "failed" ? (
                <button
                  type="button"
                  className="dialogActionBtn primary"
                  style={{ marginTop: 10 }}
                  disabled={busy}
                  onClick={() => void launchCampaign(campaign.id)}
                >
                  Запустить рассылку
                </button>
              ) : null}
            </div>
          ))
        ) : (
          <div className="emptyScriptState">Кампаний пока нет</div>
        )}
      </div>
        </>
      ) : null}
    </section>
  );
}
