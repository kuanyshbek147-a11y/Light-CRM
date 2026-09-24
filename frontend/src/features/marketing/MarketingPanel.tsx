import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from "react";
import { RU_DATETIME_ERROR, formatRuDateTime, userTimeZone, zonedLocalInputToIso } from "../../shared/lib/dateTime";
import { RuDateTimeField } from "../../shared/ui/RuDateTimeField";
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
  onOpenIntegrations?: (target?: "telegram" | "instagram") => void;
};

function readDetailsOpen(event: SyntheticEvent<HTMLDetailsElement>): boolean | null {
  if (event.target !== event.currentTarget) {
    return null;
  }
  return event.currentTarget.open;
}

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
  ready: "Готов к публикации",
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

const sequenceStatusLabel: Record<string, string> = {
  draft: "Черновик",
  paused: "На паузе",
  active: "Идёт",
  running: "Идёт",
  done: "Завершена",
  cancelled: "Отменена",
  queued: "В очереди"
};

const audienceStatusLabel: Record<string, string> = {
  ready: "Готово",
  synced: "Обновлено",
  failed: "Ошибка",
  pending: "Ждёт",
  draft: "Черновик"
};

const AI_UNAVAILABLE = "ИИ пока не подключён. Напишите текст вручную.";

function fromLocalInputValue(value: string): string | null {
  return zonedLocalInputToIso(value, userTimeZone());
}

export function MarketingPanel({ authToken, onToast, onOpenIntegrations }: Props) {
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
  const [selectedCalendarDayKey, setSelectedCalendarDayKey] = useState<string | null>(null);
  const [calendarRangeDays, setCalendarRangeDays] = useState<7 | 30>(7);
  const [campaignTemplateName, setCampaignTemplateName] = useState("");
  const [seqName, setSeqName] = useState("Напоминания клиенту");
  const [seqStep0, setSeqStep0] = useState("Здравствуйте, {{name}}! Это первое сообщение.");
  const [seqStep3, setSeqStep3] = useState("{{name}}, напоминаем о нашем предложении.");
  const [seqStep7, setSeqStep7] = useState("{{name}}, последнее напоминание. Готовы обсудить?");
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
  const [postDateInvalid, setPostDateInvalid] = useState(false);
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
  const [adsDailyBudget, setAdsDailyBudget] = useState("5");
  const [adsCurrency, setAdsCurrency] = useState("USD");
  const [adsLinkUrl, setAdsLinkUrl] = useState("");
  const [adsWizardStep, setAdsWizardStep] = useState<1 | 2 | 3>(1);
  const [planOpenAi, setPlanOpenAi] = useState(false);
  const [planOpenPublish, setPlanOpenPublish] = useState(false);
  const [planOpenSegments, setPlanOpenSegments] = useState(false);
  const [planOpenPostExtra, setPlanOpenPostExtra] = useState(false);
  const [planOpenDraft, setPlanOpenDraft] = useState(false);
  const postTitleRef = useRef<HTMLInputElement>(null);
  const aiSectionRef = useRef<HTMLDetailsElement>(null);
  const postsListRef = useRef<HTMLDivElement>(null);

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
      onToast?.("Укажите название списка клиентов", "error");
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
        onToast?.("Не удалось создать список клиентов", "error");
        return;
      }
      setSegmentName("");
      setFilter(emptyFilter);
      setCampaignSegmentId(created.id);
      setPostSegmentId(created.id);
      onToast?.(`Список создан · ${created.contact_count || 0} контактов`, "success");
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
        onToast?.("Не удалось удалить список", "error");
        return;
      }
      if (campaignSegmentId === segmentId) setCampaignSegmentId("");
      if (postSegmentId === segmentId) setPostSegmentId("");
      onToast?.("Список удалён", "success");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function submitCampaign(): Promise<void> {
    const name = campaignName.trim();
    const body = campaignBody.trim();
    if (!name || !body || !campaignSegmentId) {
      onToast?.("Заполните название, список клиентов и текст", "error");
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
        onToast?.("Не удалось создать рассылку", "error");
        return;
      }
      setCampaignName("");
      onToast?.("Черновик рассылки создан", "success");
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
        onToast?.("Не удалось запустить: в списке никого нет или рассылка уже ушла", "error");
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
    if (postDateInvalid) {
      onToast?.(RU_DATETIME_ERROR, "error");
      return;
    }
    if (!title || !body) {
      onToast?.("Укажите заголовок и текст поста", "error");
      return;
    }
    if (postAutoBroadcast && !postSegmentId) {
      onToast?.("Для рассылки выберите список клиентов", "error");
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
      setPostDateInvalid(false);
      setPostStatus("ready");
      onToast?.("Пост добавлен в план", "success");
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
      onToast?.("Пост снова поставлен в очередь", "success");
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
      onToast?.("Сначала создайте список клиентов и выберите его", "error");
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
          : "Черновик рассылки создан из поста",
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
      onToast?.("Канал сохранён", "success");
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
            : AI_UNAVAILABLE,
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
      onToast?.("Черновик готов — поправьте текст и добавьте в план", "success");
      postTitleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      postTitleRef.current?.focus();
    } finally {
      setGenerating(false);
    }
  }

  async function runGenerateImage(): Promise<void> {
    const prompt = (imagePrompt || postTitle || genTopic).trim();
    if (!prompt) {
      onToast?.("Напишите, что нарисовать, или укажите тему поста", "error");
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
            : AI_UNAVAILABLE,
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
      onToast?.("Напишите, о чём посты на эти дни", "error");
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
            ? "Не удалось собрать посты на эти дни"
            : AI_UNAVAILABLE,
          "error"
        );
        return;
      }
      onToast?.(`В план добавлено постов: ${result.count}`, "success");
      postsListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
      onToast?.("Пост готов к публикации", "success");
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
      onToast?.("Текст переписан", "success");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function submitSequence(): Promise<void> {
    if (!postSegmentId || !seqName.trim()) {
      onToast?.("Нужны название и список клиентов", "error");
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
        onToast?.("Не удалось создать напоминания", "error");
        return;
      }
      onToast?.("Напоминания созданы", "success");
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
        onToast?.("Не удалось запустить напоминания", "error");
        return;
      }
      onToast?.(`Напоминания запущены · ждут отправки: ${started.pending_runs || 0}`, "success");
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
        onToast?.("Не удалось сохранить настройки рекламы", "error");
        return;
      }
      setAdsTokenDraft("");
      setAdsSettings(saved);
      onToast?.(saved.connected ? "Реклама подключена" : "Настройки сохранены", "success");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function syncAudience(): Promise<void> {
    if (!adsSyncSegmentId) {
      onToast?.("Выберите список клиентов", "error");
      return;
    }
    setBusy(true);
    try {
      const synced = await syncAdsAudience(authToken, { segmentId: adsSyncSegmentId });
      if (!synced) {
        onToast?.("Не получилось передать список. Проверьте ключ рекламы и клиентов.", "error");
        return;
      }
      setAdsAudienceId(synced.id);
      onToast?.(
        `Список «${synced.name}» передан · ${synced.size} человек`,
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
        // Create paused — activate explicitly to avoid accidental spend
        activate: false,
        linkUrl: adsLinkUrl.trim() || undefined
      });
      if (!created) {
        onToast?.("Не удалось создать объявление", "error");
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

  function buildCalendarDays(rangeDays: number): Array<{
    key: string;
    label: string;
    fullLabel: string;
    items: MarketingContentPost[];
  }> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const dayNames = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
    return Array.from({ length: rangeDays }).map((_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      // Use local calendar date — toISOString() shifts the day in UTC+ timezones.
      const key = localDateKey(day);
      const items = posts
        .filter((post) => {
          if (!post.planned_at) return false;
          return localDateKey(new Date(post.planned_at)) === key;
        })
        .sort((a, b) => {
          const aTime = a.planned_at ? new Date(a.planned_at).getTime() : 0;
          const bTime = b.planned_at ? new Date(b.planned_at).getTime() : 0;
          return aTime - bTime;
        });
      return {
        key,
        label: `${dayNames[day.getDay()]} ${day.getDate()}.${day.getMonth() + 1}`,
        fullLabel: day.toLocaleDateString("ru-RU", {
          weekday: "long",
          day: "numeric",
          month: "long"
        }),
        items
      };
    });
  }

  const calendarDays = buildCalendarDays(calendarRangeDays);
  const activeCalendarDayKey =
    selectedCalendarDayKey && calendarDays.some((day) => day.key === selectedCalendarDayKey)
      ? selectedCalendarDayKey
      : calendarDays[0]?.key || null;
  const selectedCalendarDay =
    calendarDays.find((day) => day.key === activeCalendarDayKey) || null;

  const channelReady = socialSettings.telegramConnected || socialSettings.instagramConnected;

  function focusNewPost(): void {
    postTitleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    postTitleRef.current?.focus();
  }

  function openAiDraft(): void {
    setPlanOpenAi(true);
    aiSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function planEditor() {
    return (
      <>
            <div className="knowledgeFormCard" style={{ marginBottom: 20 }}>
              <div className="scriptPanelTitle">Новый пост</div>
              <div className="sidebarHint">Заголовок, текст и дата. Остальное можно заполнить позже.</div>
              <div className="scriptForm">
                <label className="marketingFieldLabel">
                  <span>Заголовок</span>
                  <input
                    ref={postTitleRef}
                    className="filterInput"
                    placeholder="О чём пост"
                    value={postTitle}
                    onChange={(event) => setPostTitle(event.target.value)}
                  />
                </label>
                <label className="marketingFieldLabel">
                  <span>Текст</span>
                  <textarea
                    className="filterInput"
                    rows={5}
                    placeholder="Что увидит клиент"
                    value={postBody}
                    onChange={(event) => setPostBody(event.target.value)}
                  />
                </label>
                <label className="marketingFieldLabel">
                  <span>Куда публикуем</span>
                  <select
                    className="filterInput"
                    value={postChannel}
                    onChange={(event) =>
                      setPostChannel(event.target.value as MarketingContentPost["channel"])
                    }
                  >
                    <option value="telegram">Telegram-канал</option>
                    <option value="instagram">Instagram</option>
                    <option value="whatsapp">Рассылка в WhatsApp</option>
                    <option value="web">Сайт</option>
                    <option value="other">Другое</option>
                  </select>
                </label>
                <label className="marketingFieldLabel">
                  <span>Когда опубликовать</span>
                  <RuDateTimeField
                    className="filterInput"
                    ariaLabel="Когда опубликовать"
                    value={postPlannedLocal}
                    onChange={setPostPlannedLocal}
                    onInvalidChange={setPostDateInvalid}
                  />
                </label>
                {postChannel === "instagram" ? (
                  <label className="marketingFieldLabel">
                    <span>Ссылка на картинку</span>
                    <input
                      className="filterInput"
                      placeholder="https://… — для Instagram картинка обязательна"
                      value={postImageUrl}
                      onChange={(event) => setPostImageUrl(event.target.value)}
                    />
                  </label>
                ) : null}
                {postChannel === "whatsapp" ? (
                  <label className="marketingFieldLabel">
                    <span>Кому отправить</span>
                    <select
                      className="filterInput"
                      value={postSegmentId}
                      onChange={(event) => setPostSegmentId(event.target.value)}
                    >
                      <option value="">Выберите список клиентов</option>
                      {segments.map((segment) => (
                        <option key={segment.id} value={segment.id}>
                          {segment.name} ({segment.contact_count ?? 0})
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {postImageUrl ? (
                  <img
                    src={postImageUrl}
                    alt="Картинка поста"
                    style={{ maxWidth: "100%", maxHeight: 240, borderRadius: 12, objectFit: "cover" }}
                  />
                ) : null}
                <details
                  className="marketingAccordion"
                  open={planOpenPostExtra}
                  onToggle={(event) => {
                    const open = readDetailsOpen(event);
                    if (open === null) return;
                    setPlanOpenPostExtra(open);
                  }}
                >
                  <summary className="marketingAccordionSummary">Дополнительно</summary>
                  <div className="scriptForm" style={{ marginTop: 12 }}>
                    <label className="marketingFieldLabel">
                      <span>Статус</span>
                      <select
                        className="filterInput"
                        value={postStatus}
                        onChange={(event) =>
                          setPostStatus(event.target.value as MarketingContentPost["status"])
                        }
                      >
                        <option value="idea">Идея</option>
                        <option value="draft">Черновик</option>
                        <option value="ready">Готов к публикации</option>
                        <option value="published">Уже опубликован</option>
                      </select>
                    </label>
                    {postChannel === "instagram" ? null : (
                      <label className="marketingFieldLabel">
                        <span>Ссылка на картинку</span>
                        <input
                          className="filterInput"
                          placeholder="Необязательно. Для Instagram картинка нужна"
                          value={postImageUrl}
                          onChange={(event) => setPostImageUrl(event.target.value)}
                        />
                      </label>
                    )}
                    {postChannel === "whatsapp" ? null : (
                      <label className="marketingFieldLabel">
                        <span>Список клиентов для рассылки</span>
                        <select
                          className="filterInput"
                          value={postSegmentId}
                          onChange={(event) => setPostSegmentId(event.target.value)}
                        >
                          <option value="">Не отправлять клиентам</option>
                          {segments.map((segment) => (
                            <option key={segment.id} value={segment.id}>
                              {segment.name} ({segment.contact_count ?? 0})
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label className="sidebarHint marketingCheck">
                      <input
                        type="checkbox"
                        checked={postAutoSocial}
                        onChange={(event) => setPostAutoSocial(event.target.checked)}
                      />
                      Опубликовать в соцсеть в назначенный день
                    </label>
                    <label className="sidebarHint marketingCheck">
                      <input
                        type="checkbox"
                        checked={postAutoBroadcast}
                        onChange={(event) => setPostAutoBroadcast(event.target.checked)}
                      />
                      Отправить клиентам в назначенный день
                    </label>
                    <p className="sidebarHint" style={{ margin: 0 }}>
                      Чтобы пост ушёл сам, оставьте статус «Готов к публикации» и укажите дату.
                    </p>
                  </div>
                </details>
                <button type="button" className="primaryButton" disabled={busy} onClick={() => void submitPost()}>
                  Добавить в план
                </button>
              </div>
            </div>

            <div ref={postsListRef} style={{ marginBottom: 24 }}>
              <div className="scriptPanelTitle">План постов</div>
              {posts.length ? (
                posts.map((post) => (
                  <div key={post.id} className="taskCard">
                    <div className="taskCardTitle">{post.title}</div>
                    <div className="taskCardMeta">
                      {postStatusLabel[post.status]} · {postChannelLabel[post.channel]}
                      {post.planned_at ? ` · на ${formatRuDateTime(post.planned_at)}` : ""}
                      {post.auto_publish_social ? " · опубликуется сам" : ""}
                      {post.auto_broadcast ? " · уйдёт клиентам" : ""}
                      {post.campaign_id ? " · есть рассылка" : ""}
                      {post.social_external_id ? " · уже в соцсети" : ""}
                    </div>
                    {post.publish_error ? (
                      <div className="sidebarHint" style={{ marginTop: 8, color: "#b91c1c" }}>
                        Не опубликовалось: {post.publish_error}
                      </div>
                    ) : null}
                    <div className="sidebarHint" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
                      {post.body}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                      <select
                        className="filterInput"
                        style={{ maxWidth: 220 }}
                        value={post.status}
                        disabled={busy}
                        aria-label="Статус поста"
                        onChange={(event) =>
                          void changePostStatus(post.id, event.target.value as MarketingContentPost["status"])
                        }
                      >
                        <option value="idea">Идея</option>
                        <option value="draft">Черновик</option>
                        <option value="ready">Готов к публикации</option>
                        <option value="published">Опубликован</option>
                        <option value="cancelled">Отменён</option>
                      </select>
                      <button
                        type="button"
                        className="dialogActionBtn primary"
                        disabled={busy}
                        onClick={() => void publishSocialNow(post.id)}
                      >
                        Опубликовать сейчас
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
                            Переписать с помощью ИИ
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
                          Повторить публикацию
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
                <div className="marketingEmpty">
                  <p className="marketingEmptyTitle">Пока пусто</p>
                  <p className="marketingConnectStatus">Создайте первый пост — он появится здесь и в календаре.</p>
                  <button type="button" className="primaryButton" onClick={focusNewPost}>
                    Создать пост
                  </button>
                </div>
              )}
            </div>
      </>
    );
  }

  return (
    <section className="knowledgePage card marketingPage">
      <div className="railHeader">
        <div>
          <div className="sidebarTitle">Маркетинг</div>
          <div className="sidebarHint">
            {channelReady ? "Канал подключён. Добавьте пост в план." : "Сначала подключите канал."}
          </div>
        </div>
      </div>

      <div className="marketingPageBody">
      <div className="pipelineFilterButtons" style={{ marginBottom: 16, flexWrap: "wrap" }}>
        {(
          [
            ["plan", "План", channelReady ? "Посты и даты публикации" : "Сначала подключите канал"],
            ["landings", "Лендинг", "Страница, куда ведёт реклама"],
            ["calendar", "Календарь", "Посты по дням"],
            ["series", "Напоминания", "Три сообщения клиенту: в день обращения, через 3 дня и через 7 дней"],
            ["reports", "Отчёты", "Заявки, диалоги и окупаемость рекламы"],
            ["ads", "Реклама", "Реклама в Facebook и Instagram"]
          ] as const
        ).map(([id, label, hint]) => (
          <button
            key={id}
            type="button"
            className={`leftMenuButton ${marketingTab === id ? "active" : ""}`}
            title={hint}
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
                onToast?.("Ссылка добавлена в рекламу", "success");
                return;
              }
              onToast?.("Ссылка добавлена в форму рекламы", "success");
            })();
          }}
        />
      ) : null}

      {marketingTab === "ads" ? (
        <div style={{ marginBottom: 24 }}>
          <div className="adsWizardSteps" role="tablist" aria-label="Шаги настройки рекламы">
            {(
              [
                [1, "Подключение"],
                [2, "Кому показывать"],
                [3, "Объявление"]
              ] as const
            ).map(([step, label]) => (
              <button
                key={step}
                type="button"
                role="tab"
                aria-selected={adsWizardStep === step}
                className={`adsWizardStep ${adsWizardStep === step ? "active" : ""}`}
                onClick={() => setAdsWizardStep(step)}
              >
                <span className="adsWizardStepNum">{step}</span>
                {label}
              </button>
            ))}
          </div>

          {adsWizardStep === 1 ? (
          <div className="knowledgeFormCard" style={{ marginBottom: 20 }}>
            <div className="scriptPanelTitle">Подключение рекламы</div>
            <div className="sidebarHint" style={{ marginBottom: 10 }}>
              {adsSettings?.connected
                ? `Реклама подключена${adsSettings.connectedAt ? ` · ${formatRuDateTime(adsSettings.connectedAt)}` : ""}. Ключ можно заменить ниже.`
                : "Пока не подключено. Нужен ключ рекламного кабинета Facebook и Instagram — это отдельно от переписки в WhatsApp."}
            </div>
            <div className="scriptForm">
              <label className="marketingFieldLabel">
                <span>Ключ доступа</span>
                <input
                  className="filterInput"
                  type="password"
                  placeholder={
                    adsSettings?.hasToken
                      ? "Оставьте пустым, чтобы не менять"
                      : "Ключ из рекламного кабинета"
                  }
                  title="Секретный ключ рекламного кабинета. Его выдаёт Facebook для управления объявлениями."
                  value={adsTokenDraft}
                  onChange={(event) => setAdsTokenDraft(event.target.value)}
                />
              </label>
              <label className="marketingFieldLabel">
                <span>Номер кабинета</span>
                <input
                  className="filterInput"
                  placeholder="Начинается с act_"
                  title="Номер рекламного кабинета. Обычно начинается с act_."
                  value={adsAccountDraft}
                  onChange={(event) => setAdsAccountDraft(event.target.value)}
                />
              </label>
              <label className="marketingFieldLabel">
                <span>Страница Facebook</span>
                <input
                  className="filterInput"
                  placeholder="ID страницы, от имени которой пойдёт реклама"
                  title="Числовой идентификатор страницы Facebook, от имени которой пойдёт объявление."
                  value={adsPageDraft}
                  onChange={(event) => setAdsPageDraft(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="primaryButton"
                disabled={busy}
                onClick={() => {
                  void (async () => {
                    await saveAdsConnection();
                    setAdsWizardStep(2);
                  })();
                }}
              >
                Сохранить и далее
              </button>
            </div>
          </div>
          ) : null}

          {adsWizardStep === 2 ? (
          <div className="knowledgeFormCard" style={{ marginBottom: 20 }}>
            <div className="scriptPanelTitle">Кому показывать рекламу</div>
            <div className="sidebarHint" style={{ marginBottom: 10 }}>
              Выберите список клиентов — его можно передать в рекламный кабинет.
            </div>
            <div className="scriptForm">
              <select
                className="filterInput"
                value={adsSyncSegmentId}
                onChange={(event) => setAdsSyncSegmentId(event.target.value)}
              >
                <option value="">Список клиентов</option>
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
                Передать список в рекламу
              </button>
            </div>
            {adsAudiences.length ? (
              adsAudiences.map((audience) => (
                <div key={audience.id} className="taskCard" style={{ marginTop: 10 }}>
                  <div className="taskCardTitle">{audience.name}</div>
                  <div className="taskCardMeta">
                    {audienceStatusLabel[audience.status] || audience.status} · {audience.size} человек
                    {audience.last_sync_at
                      ? ` · обновлено ${formatRuDateTime(audience.last_sync_at)}`
                      : ""}
                    {audience.last_error ? ` · ${audience.last_error}` : ""}
                  </div>
                </div>
              ))
            ) : (
              <div className="emptyScriptState" style={{ marginTop: 10 }}>
                Списков пока нет. Выберите клиентов и передайте их в рекламу.
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button type="button" className="dialogActionBtn" onClick={() => setAdsWizardStep(1)}>
                Назад
              </button>
              <button
                type="button"
                className="primaryButton"
                disabled={!adsAudiences.length}
                onClick={() => setAdsWizardStep(3)}
              >
                Далее к кампании
              </button>
            </div>
          </div>
          ) : null}

          {adsWizardStep === 3 ? (
          <div className="knowledgeFormCard" style={{ marginBottom: 20 }}>
            <div className="scriptPanelTitle">Новое объявление</div>
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
                <option value="">Взять текст из плана (необязательно)</option>
                {posts.map((post) => (
                  <option key={post.id} value={post.id}>
                    {post.title || post.body.slice(0, 40)}
                    {post.image_url ? " · с картинкой" : ""}
                  </option>
                ))}
              </select>
              <input
                className="filterInput"
                placeholder="Бюджет в день, в валюте кабинета (например, 5)"
                title="Сколько тратить на рекламу за сутки. Валюта — как в рекламном кабинете."
                value={adsDailyBudget}
                onChange={(event) => setAdsDailyBudget(event.target.value)}
              />
              <select
                className="filterInput"
                value={adsCurrency}
                onChange={(event) => setAdsCurrency(event.target.value)}
              >
                <option value="USD">Доллары (валюта кабинета)</option>
                <option value="KZT">Тенге (пересчитаем в доллары)</option>
              </select>
              <div className="sidebarHint">
                Реклама показывается в Казахстане. Если в списке меньше 100 человек, охват не сужается.
                Объявление создаётся выключенным — включите его кнопкой «Активировать».
              </div>
              <input
                className="filterInput"
                placeholder="Ссылка в объявлении"
                value={adsLinkUrl}
                onChange={(event) => setAdsLinkUrl(event.target.value)}
              />
              {adsLinkUrl ? (
                <div className="sidebarHint">
                  Чтобы видеть, откуда пришёл клиент, в ссылке нужны метки utm_source и utm_campaign.
                </div>
              ) : null}
              <button
                type="button"
                className="dialogActionBtn"
                onClick={() => setAdsWizardStep(2)}
              >
                Назад
              </button>
              <button
                type="button"
                className="primaryButton"
                disabled={busy}
                onClick={() => void launchAdsCampaign()}
              >
                Создать объявление (пока выключено)
              </button>
            </div>
          </div>
          ) : null}

          <div className="scriptPanelTitle">Рекламные кампании</div>
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
                    расход {spend} · клики {clicks} · переходы {ctr}%
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
            <div className="emptyScriptState">Объявлений пока нет. Соберите список клиентов и создайте первое.</div>
          )}
        </div>
      ) : null}

      {marketingTab === "calendar" ? (
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 4
            }}
          >
            <div className="scriptPanelTitle" style={{ margin: 0 }}>
              Календарь контента
            </div>
            <div className="pipelineFilterButtons" style={{ margin: 0 }}>
              {(
                [
                  [7, "7 дней"],
                  [30, "Месяц"]
                ] as const
              ).map(([days, label]) => (
                <button
                  key={days}
                  type="button"
                  className={`leftMenuButton ${calendarRangeDays === days ? "active" : ""}`}
                  onClick={() => {
                    setCalendarRangeDays(days);
                    setSelectedCalendarDayKey(null);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="sidebarHint" style={{ marginTop: 4 }}>
            Период: {calendarRangeDays === 7 ? "ближайшие 7 дней" : "ближайшие 30 дней"}.
            Нажмите на день, чтобы открыть детали постов и действий.
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(auto-fill, minmax(${calendarRangeDays === 30 ? "108px" : "140px"}, 1fr))`,
              gap: 10,
              marginTop: 12
            }}
          >
            {calendarDays.map((day) => {
              const selected = day.key === activeCalendarDayKey;
              return (
                <button
                  key={day.key}
                  type="button"
                  className={`taskCard ${selected ? "active" : ""}`}
                  onClick={() => setSelectedCalendarDayKey(day.key)}
                  style={{
                    minHeight: 120,
                    textAlign: "left",
                    cursor: "pointer",
                    border: selected ? "1px solid #5b5ce9" : undefined,
                    background: selected ? "rgba(91, 92, 233, 0.06)" : undefined
                  }}
                >
                  <div className="taskCardTitle">{day.label}</div>
                  <div className="sidebarHint" style={{ marginTop: 4 }}>
                    {day.items.length
                      ? `${day.items.length} ${day.items.length === 1 ? "пост" : day.items.length < 5 ? "поста" : "постов"}`
                      : "Пусто"}
                  </div>
                  {day.items.length ? (
                    day.items.slice(0, 2).map((post) => (
                      <div key={post.id} className="sidebarHint" style={{ marginTop: 6 }}>
                        {postStatusLabel[post.status]} · {post.title}
                      </div>
                    ))
                  ) : (
                    <div className="sidebarHint" style={{ marginTop: 8 }}>
                      Нет постов
                    </div>
                  )}
                  {day.items.length > 2 ? (
                    <div className="sidebarHint" style={{ marginTop: 6, opacity: 0.75 }}>
                      + ещё {day.items.length - 2}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>

          {selectedCalendarDay ? (
            <div className="knowledgeFormCard marketingDayDetail" style={{ marginTop: 16 }}>
              <div className="scriptPanelTitle" style={{ textTransform: "capitalize" }}>
                {selectedCalendarDay.fullLabel}
              </div>
              <div className="sidebarHint" style={{ marginBottom: 12 }}>
                {selectedCalendarDay.items.length
                  ? `Запланировано: ${selectedCalendarDay.items.length}`
                  : "На этот день постов нет. Добавьте пост во вкладке «План»."}
              </div>

              {selectedCalendarDay.items.length ? (
                selectedCalendarDay.items.map((post) => (
                  <div key={post.id} className="taskCard marketingPostPreview" style={{ marginBottom: 16 }}>
                    <div className="taskCardTitle">{post.title}</div>
                    <div className="taskCardMeta">
                      {postStatusLabel[post.status]} · {postChannelLabel[post.channel]}
                      {post.planned_at
                        ? ` · ${formatRuDateTime(post.planned_at)}`
                        : ""}
                      {post.auto_publish_social ? " · авто-соцсеть" : ""}
                      {post.auto_broadcast ? " · авто-рассылка" : ""}
                      {post.social_external_id ? " · уже опубликовано" : ""}
                    </div>

                    <div className="marketingPostPreviewLayout">
                      {post.image_url ? (
                        <div className="marketingPostPreviewMedia">
                          <img src={post.image_url} alt={post.title} />
                        </div>
                      ) : (
                        <div className="marketingPostPreviewMedia marketingPostPreviewMediaEmpty">
                          Нет изображения
                        </div>
                      )}
                      <div className="marketingPostPreviewText">
                        <div className="sidebarHint" style={{ marginBottom: 6, fontWeight: 600 }}>
                          Как будет выглядеть текст
                        </div>
                        <div className="marketingPostPreviewBody">{post.body}</div>
                      </div>
                    </div>

                    {post.publish_error ? (
                      <div className="sidebarHint" style={{ marginTop: 8, color: "#b91c1c" }}>
                        Ошибка: {post.publish_error}
                      </div>
                    ) : null}

                    <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
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
                        Опубликовать сейчас
                      </button>
                      {post.status === "draft" || post.status === "idea" ? (
                        <button
                          type="button"
                          className="dialogActionBtn primary"
                          disabled={busy}
                          onClick={() => void approvePost(post.id)}
                        >
                          Утвердить
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="dialogActionBtn"
                        disabled={busy}
                        onClick={() => {
                          setMarketingTab("plan");
                        }}
                      >
                        Открыть в плане
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="emptyScriptState">
                  На этот день пусто. Откройте «План» и добавьте пост с этой датой.
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {marketingTab === "series" ? (
        <div style={{ marginBottom: 24 }}>
          <div className="knowledgeFormCard" style={{ marginBottom: 16 }}>
            <div className="scriptPanelTitle">Три напоминания клиенту</div>
            <div className="sidebarHint" style={{ marginBottom: 10 }}>
              Сообщение в день обращения, затем через 3 дня и через 7 дней. Уходит выбранному списку клиентов.
            </div>
            <div className="scriptForm">
              <label className="marketingFieldLabel">
                <span>Название</span>
                <input className="filterInput" value={seqName} onChange={(e) => setSeqName(e.target.value)} />
              </label>
              {segments.length ? (
                <label className="marketingFieldLabel">
                  <span>Кому отправить</span>
                  <select
                    className="filterInput"
                    value={postSegmentId}
                    onChange={(event) => setPostSegmentId(event.target.value)}
                  >
                    <option value="">Выберите список клиентов</option>
                    {segments.map((segment) => (
                      <option key={segment.id} value={segment.id}>
                        {segment.name} ({segment.contact_count ?? 0})
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="marketingConnectCard">
                  <p className="marketingConnectStatus">
                    Списка клиентов ещё нет. Соберите его — и напоминания будет кому отправить.
                  </p>
                  <button
                    type="button"
                    className="secondaryButton"
                    onClick={() => {
                      setMarketingTab("plan");
                      setPlanOpenSegments(true);
                    }}
                  >
                    Создать список клиентов
                  </button>
                </div>
              )}
              <label className="marketingFieldLabel">
                <span>Куда отправить</span>
                <select
                  className="filterInput"
                  value={campaignChannel}
                  onChange={(event) => setCampaignChannel(event.target.value as "whatsapp" | "telegram")}
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="telegram">Telegram</option>
                </select>
              </label>
              <label className="marketingFieldLabel">
                <span>В тот же день</span>
                <textarea className="filterInput" rows={2} value={seqStep0} onChange={(e) => setSeqStep0(e.target.value)} />
              </label>
              <label className="marketingFieldLabel">
                <span>Через 3 дня</span>
                <textarea className="filterInput" rows={2} value={seqStep3} onChange={(e) => setSeqStep3(e.target.value)} />
              </label>
              <label className="marketingFieldLabel">
                <span>Через 7 дней</span>
                <textarea className="filterInput" rows={2} value={seqStep7} onChange={(e) => setSeqStep7(e.target.value)} />
              </label>
              <label className="marketingFieldLabel">
                <span>
                  Шаблон WhatsApp <span className="marketingFieldOptional">необязательно</span>
                </span>
                <input
                  className="filterInput"
                  placeholder="Если первое сообщение уже согласовано как шаблон"
                  title="Имя готового шаблона WhatsApp. Нужно только если первое сообщение должно уйти шаблоном, а не обычным текстом."
                  value={seqTemplate}
                  onChange={(e) => setSeqTemplate(e.target.value)}
                />
              </label>
              <button type="button" className="primaryButton" disabled={busy} onClick={() => void submitSequence()}>
                Создать напоминания
              </button>
            </div>
          </div>
          {sequences.map((sequence) => (
            <div key={sequence.id} className="taskCard">
              <div className="taskCardTitle">{sequence.name}</div>
              <div className="taskCardMeta">
                {sequenceStatusLabel[sequence.status] || sequence.status} ·{" "}
                {sequence.channel === "telegram" ? "Telegram" : "WhatsApp"} · ждут отправки:{" "}
                {sequence.pending_runs || 0}
                {sequence.template_name ? ` · шаблон WhatsApp: ${sequence.template_name}` : ""}
              </div>
              {sequence.status === "draft" || sequence.status === "paused" ? (
                <button
                  type="button"
                  className="dialogActionBtn primary"
                  style={{ marginTop: 10 }}
                  disabled={busy}
                  onClick={() => void launchSequence(sequence.id)}
                >
                  Запустить напоминания
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {marketingTab === "reports" ? (
        <div style={{ marginBottom: 24 }}>
          <div className="scriptPanelTitle">От постов к заявкам</div>
          <div className="sidebarHint" style={{ marginBottom: 10 }}>
            За {inboundReport.periodDays} дн.: посты в Instagram, новые диалоги и заявки на демо.
          </div>
          <div className="ownerKpiGrid" style={{ marginBottom: 14 }}>
            <div className="ownerKpiCard">
              <div className="analyticsValue">{inboundReport.posts.published}</div>
              <div className="analyticsLabel">Опубликовано в Instagram</div>
            </div>
            <div className="ownerKpiCard">
              <div className="analyticsValue">{inboundReport.posts.ready}</div>
              <div className="analyticsLabel">Ждут публикации</div>
            </div>
            <div className="ownerKpiCard">
              <div className="analyticsValue">{inboundReport.inbound.demoRequests}</div>
              <div className="analyticsLabel">Заявки на демо</div>
            </div>
            <div className="ownerKpiCard">
              <div className="analyticsValue">
                {inboundReport.inbound.instagramDialogs}/{inboundReport.inbound.whatsappDialogs}/
                {inboundReport.inbound.telegramDialogs}
              </div>
              <div className="analyticsLabel" title="Instagram, WhatsApp и Telegram">
                Диалоги: IG / WA / TG
              </div>
            </div>
            <div className="ownerKpiCard">
              <div className="analyticsValue">{inboundReport.inbound.dealsWon}</div>
              <div className="analyticsLabel" title="Сделки, которые дошли до оплаты после заявки на демо">
                Сделки закрыты
              </div>
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
                    ? formatRuDateTime(row.published_at)
                    : row.planned_at
                      ? formatRuDateTime(row.planned_at)
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

          <div className="scriptPanelTitle">Реклама и деньги</div>
          <div className="sidebarHint" style={{ marginBottom: 10 }}>
            Сколько ушло на рекламу, сколько заявок пришло и сколько денег вернулось.
          </div>
          <div className="analyticsManagersTable" style={{ marginBottom: 18 }}>
            <div className="analyticsManagersHead" style={{ gridTemplateColumns: "1.4fr repeat(6, 0.7fr)" }}>
              <span>Реклама</span>
              <span>Расход</span>
              <span>Клики</span>
              <span>Лиды</span>
              <span>Выиграно</span>
              <span>Выручка</span>
              <span title="Окупаемость: выручка разделить на расходы на рекламу">Окупаемость</span>
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
              <div className="analyticsManagersEmpty">Рекламных кампаний пока нет</div>
            )}
          </div>

          <div className="analyticsManagersTable" style={{ marginBottom: 18 }}>
            <div className="analyticsManagersHead" style={{ gridTemplateColumns: "1.4fr repeat(4, 0.7fr)" }}>
              <span>Лендинг</span>
              <span>Клики</span>
              <span>Лиды</span>
              <span>Выиграно</span>
              <span>Выручка</span>
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

          <div className="scriptPanelTitle">Отчёты рассылок</div>
          {reports.length ? (
            reports.map((report) => (
              <div key={report.campaign_id} className="taskCard">
                <div className="taskCardTitle">{report.name}</div>
                <div className="taskCardMeta">
                  {campaignStatusLabel[report.status as MarketingCampaign["status"]] || report.status} ·{" "}
                  {report.channel === "telegram" ? "Telegram" : report.channel === "whatsapp" ? "WhatsApp" : report.channel}{" "}
                  · отправлено {report.sent} · ответили {report.replied} ({report.reply_rate}%) · сделок{" "}
                  {report.deals_touched} · закрыто {report.deals_won}
                </div>
              </div>
            ))
          ) : (
            <div className="emptyScriptState">Отчётов по рассылкам пока нет</div>
          )}
        </div>
      ) : null}

      {marketingTab === "plan" ? (
        <>
          {channelReady ? (
            <div className="marketingLead">
              <div>
                <p className="marketingLeadText">Напишите пост и поставьте дату — он попадёт в план.</p>
                <button type="button" className="textButton marketingLeadAlt" onClick={openAiDraft}>
                  Нужен черновик — попросить ИИ
                </button>
              </div>
              <button type="button" className="primaryButton" onClick={focusNewPost}>
                Создать пост
              </button>
            </div>
          ) : (
            <div className="marketingLead isSetup">
              <p className="marketingLeadText">Сначала подключите канал</p>
              <div className="marketingLeadActions">
                <button type="button" className="primaryButton" onClick={() => onOpenIntegrations?.("telegram")}>
                  Подключить Telegram
                </button>
                <button type="button" className="secondaryButton" onClick={() => onOpenIntegrations?.("instagram")}>
                  Подключить Instagram
                </button>
              </div>
            </div>
          )}

          {channelReady ? (
            planEditor()
          ) : (
            <div className="knowledgeFormCard" style={{ marginBottom: 20 }}>
              <details
                className="marketingAccordion"
                open={planOpenDraft}
                onToggle={(event) => {
                  const open = readDetailsOpen(event);
                  if (open === null) return;
                  setPlanOpenDraft(open);
                }}
              >
                <summary className="marketingAccordionSummary">
                  План постов
                  <span className="marketingSummaryMeta">
                    Можно набросать заранее. Публикация — после подключения канала.
                  </span>
                </summary>
                <div style={{ marginTop: 12 }}>{planEditor()}</div>
              </details>
            </div>
          )}


          <div className="knowledgeFormCard" style={{ marginBottom: 20 }}>
            <details
              ref={aiSectionRef}
              className="marketingAccordion"
              open={planOpenAi}
              onToggle={(event) => {
                const open = readDetailsOpen(event);
                if (open === null) return;
                setPlanOpenAi(open);
              }}
            >
              <summary className="marketingAccordionSummary">
                Написать черновик с помощью ИИ
                <span className="marketingSummaryMeta" title="ИИ предлагает текст по вашей теме. Его можно поправить перед публикацией.">
                  {aiConfigured ? "Помощник подключён" : "Пока не подключён — текст можно написать вручную"}
                </span>
              </summary>
              <div className="scriptForm" style={{ marginTop: 12 }}>
                <p className="sidebarHint" style={{ margin: 0 }}>
                  Опишите тему — помощник предложит текст. Потом его можно поправить и добавить в план.
                </p>
                <label className="marketingFieldLabel">
                  <span>О чём пост</span>
                  <input
                    className="filterInput"
                    placeholder="Например: скидка на первую неделю"
                    value={genTopic}
                    onChange={(event) => setGenTopic(event.target.value)}
                  />
                </label>
                <label className="marketingFieldLabel">
                  <span>
                    Что предложить клиенту <span className="marketingFieldOptional">необязательно</span>
                  </span>
                  <input
                    className="filterInput"
                    placeholder="Цена, срок, условие"
                    value={genOffer}
                    onChange={(event) => setGenOffer(event.target.value)}
                  />
                </label>
                <label className="marketingFieldLabel">
                  <span>Как звучать</span>
                  <input
                    className="filterInput"
                    placeholder="Например: дружелюбно и по делу"
                    value={genTone}
                    onChange={(event) => setGenTone(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="primaryButton"
                  disabled={busy || generating}
                  onClick={() => void runGenerateText()}
                >
                  {generating ? "Пишем текст…" : "Предложить текст"}
                </button>
                <label className="marketingFieldLabel">
                  <span>Что нарисовать</span>
                  <input
                    className="filterInput"
                    placeholder="Коротко: что должно быть на картинке"
                    value={imagePrompt}
                    onChange={(event) => setImagePrompt(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="dialogActionBtn primary"
                  disabled={busy || generating}
                  onClick={() => void runGenerateImage()}
                >
                  Сделать картинку
                </button>
                <div className="scriptPanelTitle" style={{ marginTop: 8 }}>
                  Сразу на несколько дней
                </div>
                <p className="sidebarHint" style={{ margin: 0 }}>
                  Черновики появятся в плане с завтрашнего дня, на 11:00 по Алматы.
                </p>
                <label className="marketingFieldLabel">
                  <span>На сколько дней</span>
                  <select
                    className="filterInput"
                    value={weekDays}
                    onChange={(event) => setWeekDays(Number(event.target.value) || 7)}
                  >
                    <option value={3}>3 дня</option>
                    <option value={5}>5 дней</option>
                    <option value={7}>7 дней</option>
                  </select>
                </label>
                <label className="sidebarHint marketingCheck">
                  <input
                    type="checkbox"
                    checked={weekWithImages}
                    onChange={(event) => setWeekWithImages(event.target.checked)}
                  />
                  Сразу сделать картинки (займёт больше времени)
                </label>
                <label className="sidebarHint marketingCheck">
                  <input
                    type="checkbox"
                    checked={weekAutoSocial}
                    onChange={(event) => setWeekAutoSocial(event.target.checked)}
                  />
                  Публиковать самим в назначенный день, когда отметите «Готов»
                </label>
                <button
                  type="button"
                  className="primaryButton"
                  disabled={busy || generating}
                  onClick={() => void runGenerateWeek()}
                >
                  {generating ? "Собираем план…" : "Заполнить план на эти дни"}
                </button>
              </div>
            </details>
          </div>

          {channelReady ? (
          <div className="knowledgeFormCard" style={{ marginBottom: 20 }}>
            <details
              className="marketingAccordion"
              open={planOpenPublish}
              onToggle={(event) => {
                const open = readDetailsOpen(event);
                if (open === null) return;
                setPlanOpenPublish(open);
              }}
            >
              <summary className="marketingAccordionSummary">
                Куда публиковать
                <span className="marketingSummaryMeta">
                  {socialSettings.telegramConnected
                    ? socialSettings.telegramChannelId
                      ? "Telegram подключён"
                      : "Telegram подключён, канал для постов не указан"
                    : "Telegram не подключён"}
                  {" · "}
                  {socialSettings.instagramConnected ? "Instagram подключён" : "Instagram не подключён"}
                </span>
              </summary>
              <div className="marketingConnectGrid">
                <div className={`marketingConnectCard ${socialSettings.telegramConnected ? "isOn" : ""}`}>
                  <div className="scriptPanelTitle">Telegram</div>
                  {socialSettings.telegramConnected ? (
                    <p className="marketingConnectStatus">
                      Telegram подключён. Готовые посты можно публиковать в назначенный день.
                    </p>
                  ) : (
                    <>
                      <p className="marketingConnectStatus">Telegram ещё не подключён.</p>
                      <button
                        type="button"
                        className="primaryButton"
                        onClick={() => onOpenIntegrations?.("telegram")}
                      >
                        Подключить Telegram
                      </button>
                    </>
                  )}
                  {socialSettings.telegramConnected ? (
                    <details className="marketingAccordion">
                      <summary className="marketingAccordionSummary">Дополнительно</summary>
                      <div className="scriptForm" style={{ marginTop: 12 }}>
                        <label className="marketingFieldLabel">
                          <span>Куда отправлять посты</span>
                          <input
                            className="filterInput"
                            placeholder="@канал"
                            value={telegramChannelDraft}
                            onChange={(event) => setTelegramChannelDraft(event.target.value)}
                          />
                        </label>
                        <button type="button" className="secondaryButton" disabled={busy} onClick={() => void saveSocial()}>
                          Сохранить
                        </button>
                        <p className="sidebarHint" style={{ margin: 0 }}>
                          Бот должен быть администратором канала. Для закрытого канала укажите его номер — обычно он начинается с -100.
                        </p>
                      </div>
                    </details>
                  ) : null}
                </div>
                <div className={`marketingConnectCard ${socialSettings.instagramConnected ? "isOn" : ""}`}>
                  <div className="scriptPanelTitle">Instagram</div>
                  {socialSettings.instagramConnected ? (
                    <p className="marketingConnectStatus">
                      Instagram подключён. Для поста нужна картинка.
                    </p>
                  ) : (
                    <>
                      <p className="marketingConnectStatus">Instagram ещё не подключён.</p>
                      <button
                        type="button"
                        className="primaryButton"
                        onClick={() => onOpenIntegrations?.("instagram")}
                      >
                        Подключить Instagram
                      </button>
                    </>
                  )}
                </div>
              </div>
            </details>
          </div>
          ) : null}

          <div className="knowledgeFormCard" style={{ marginBottom: 20 }}>
            <details
              className="marketingAccordion"
              open={planOpenSegments}
              onToggle={(event) => {
                const open = readDetailsOpen(event);
                if (open === null) return;
                setPlanOpenSegments(open);
              }}
            >
              <summary className="marketingAccordionSummary">
                Рассылки клиентам
                <span className="marketingSummaryMeta">Список клиентов и сообщение в WhatsApp или Telegram</span>
              </summary>
              <div style={{ marginTop: 12 }}>
                <div className="knowledgeFormCard" style={{ marginBottom: 20 }}>
                  <div className="scriptPanelTitle">Новый список клиентов</div>
                  <div className="scriptForm">
                    <input
                      className="filterInput"
                      placeholder="Название списка"
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
                      placeholder="Канал: WhatsApp или Telegram"
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
                      Создать список
                    </button>
                  </div>
                </div>

                <div style={{ marginBottom: 24 }}>
                  <div className="scriptPanelTitle">Списки клиентов</div>
                  {segments.length ? (
                    segments.map((segment) => (
                      <div key={segment.id} className="taskCard">
                        <div className="taskCardTitle">{segment.name}</div>
                        <div className="taskCardMeta">
                          {segment.contact_count ?? 0} контактов
                          {Object.keys(segment.filter_json || {}).length
                            ? ` · ${Object.entries(segment.filter_json)
                                .filter(([, value]) => value)
                                .map(([key, value]) => `${key}=${value}`)
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
                    <div className="emptyScriptState">Списков пока нет. Создайте список — и можно отправить рассылку.</div>
                  )}
                </div>

                <div className="knowledgeFormCard" style={{ marginBottom: 20 }}>
                  <div className="scriptPanelTitle">Новая рассылка</div>
                  <div className="scriptForm">
                    <input
                      className="filterInput"
                      placeholder="Название рассылки"
                      value={campaignName}
                      onChange={(event) => setCampaignName(event.target.value)}
                    />
                    <select
                      className="filterInput"
                      value={campaignSegmentId}
                      onChange={(event) => setCampaignSegmentId(event.target.value)}
                    >
                      <option value="">Выберите список клиентов</option>
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
                      placeholder="Название шаблона WhatsApp (необязательно)"
                      title="Имя готового шаблона WhatsApp, если сообщение должно уйти шаблоном."
                      value={campaignTemplateName}
                      onChange={(event) => setCampaignTemplateName(event.target.value)}
                    />
                    <textarea
                      className="filterInput"
                      rows={4}
                      placeholder="Текст сообщения"
                      value={campaignBody}
                      onChange={(event) => setCampaignBody(event.target.value)}
                    />
                    <button type="button" className="primaryButton" disabled={busy} onClick={() => void submitCampaign()}>
                      Создать черновик
                    </button>
                  </div>
                </div>

                <div>
                  <div className="scriptPanelTitle">Рассылки</div>
                  {campaigns.length ? (
                    campaigns.map((campaign) => (
                      <div key={campaign.id} className="taskCard">
                        <div className="taskCardTitle">{campaign.name}</div>
                        <div className="taskCardMeta">
                          {campaignStatusLabel[campaign.status]} ·{" "}
                          {campaign.channel === "telegram" ? "Telegram" : "WhatsApp"}
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
                    <div className="emptyScriptState">Рассылок пока нет</div>
                  )}
                </div>
              </div>
            </details>
          </div>
        </>
      ) : null}
      </div>
    </section>
  );
}
