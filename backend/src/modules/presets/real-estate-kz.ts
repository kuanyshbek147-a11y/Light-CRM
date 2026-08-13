import { query } from "../../db";
import { setContactRequiredFields } from "../contacts/required-fields";
import { createLandingPage } from "../marketing/landings";
import type { StageOutcome } from "../pipeline/stages";

export const REAL_ESTATE_KZ_PRESET_ID = "real-estate-kz" as const;

export const REAL_ESTATE_KZ_STAGES: Array<{
  name: string;
  position: number;
  outcome: StageOutcome;
}> = [
  { name: "Новый", position: 10, outcome: "open" },
  { name: "Квалификация", position: 20, outcome: "open" },
  { name: "Показ", position: 30, outcome: "open" },
  { name: "Договор", position: 40, outcome: "open" },
  { name: "Выиграно", position: 50, outcome: "won" },
  { name: "Отказ", position: 60, outcome: "lost" }
];

export const REAL_ESTATE_KZ_REQUIRED_FIELDS = ["city", "inquiry_reason"] as const;

export const REAL_ESTATE_KZ_SCRIPTS: Array<{
  title: string;
  category: string;
  body: string;
}> = [
  {
    title: "Первый ответ",
    category: "Недвижимость",
    body: "Здравствуйте! Меня зовут {{name_manager}}, агентство недвижимости. Подскажите, пожалуйста: вы ищете покупку, аренду или продажу? В каком городе и районе удобнее смотреть объекты?"
  },
  {
    title: "Уточнение бюджета",
    category: "Недвижимость",
    body: "Чтобы подобрать точные варианты: какой бюджет рассматриваете (₸) и нужна ли ипотека? Если есть предпочтения по комнатности и сроку заезда — напишите, учтём сразу."
  },
  {
    title: "Район и параметры",
    category: "Недвижимость",
    body: "Какие районы приоритетны? Нужны ли парковка, школа/садик рядом, готовый ремонт? Могу прислать 3–5 вариантов под ваши критерии уже сегодня."
  },
  {
    title: "Приглашение на показ",
    category: "Недвижимость",
    body: "Нашёл подходящие объекты. Могу организовать показ: сегодня после 18:00 или завтра в первой половине дня. Какой слот удобнее? Адрес и время подтвержу в этом чате."
  },
  {
    title: "Follow-up после показа",
    category: "Недвижимость",
    body: "Как впечатления после просмотра? Если объект не зашёл — подберу альтернативы по тем же параметрам. Если интересно — могу подготовить расчёт и черновик условий."
  },
  {
    title: "Договор / следующий шаг",
    category: "Недвижимость",
    body: "Отлично, фиксируем интерес. Следующий шаг: бронь / задаток и подготовка договора. Могу прислать список документов и ориентир по срокам сделки. Удобно обсудить сегодня?"
  },
  {
    title: "Мягкий follow-up",
    category: "Недвижимость",
    body: "Добрый день! Коротко напомню: варианты по вашему запросу ещё актуальны. Если приоритеты изменились (бюджет, район, сроки) — напишите, обновлю подборку."
  },
  {
    title: "Отказ / пауза",
    category: "Недвижимость",
    body: "Понял, спасибо что сообщили. Оставляю контакты — если вернётесь к поиску, помогу быстро. Могу раз в месяц присылать свежие объекты по вашим параметрам?"
  }
];

export const REAL_ESTATE_KZ_LANDING = {
  title: "Недвижимость KZ — лендинг",
  brandName: "Агентство недвижимости",
  headline: "Квартиры и дома под ваш бюджет — ответ в WhatsApp",
  subheadline:
    "Алматы, Астана и регионы. Подберём 3–5 вариантов, организуем показ и проведём до договора.",
  body: [
    "Работаем с покупкой, продажей и арендой. Сразу уточняем бюджет, район и срок — без лишних звонков.",
    "Что получаете: короткая квалификация в чате, подборка объектов, показ и сопровождение сделки.",
    "Напишите в WhatsApp город и что ищете — менеджер ответит в рабочее время и предложит ближайшие варианты."
  ].join("\n\n"),
  ctaLabel: "Написать в WhatsApp",
  ctaPrefill: "Здравствуйте! Ищу недвижимость. Город: … Цель: покупка/аренда/продажа. Бюджет: …"
};

const LEGACY_DEFAULT_STAGE_NAMES = ["new", "qualified", "proposal", "won", "lost"];

async function upsertStage(
  workspaceId: string,
  stage: { name: string; position: number; outcome: StageOutcome }
): Promise<void> {
  const existing = await query<{ id: string }>(
    `SELECT id FROM pipeline_stages
     WHERE workspace_id = $1 AND lower(name) = lower($2)
     LIMIT 1`,
    [workspaceId, stage.name]
  );
  if (existing[0]) {
    await query(
      `UPDATE pipeline_stages
       SET name = $3, position = $4, outcome = $5
       WHERE id = $1 AND workspace_id = $2`,
      [existing[0].id, workspaceId, stage.name, stage.position, stage.outcome]
    );
    return;
  }
  await query(
    `INSERT INTO pipeline_stages (workspace_id, name, position, outcome)
     VALUES ($1, $2, $3, $4)`,
    [workspaceId, stage.name, stage.position, stage.outcome]
  );
}

async function cleanupUnusedLegacyStages(workspaceId: string): Promise<number> {
  let removed = 0;
  for (const name of LEGACY_DEFAULT_STAGE_NAMES) {
    const inUse = await query<{ id: string }>(
      `SELECT id FROM conversations
       WHERE workspace_id = $1 AND lower(COALESCE(stage, '')) = lower($2)
       LIMIT 1`,
      [workspaceId, name]
    );
    const dealsInUse = await query<{ id: string }>(
      `SELECT id FROM deals
       WHERE workspace_id = $1 AND lower(COALESCE(stage, '')) = lower($2)
       LIMIT 1`,
      [workspaceId, name]
    );
    if (inUse[0] || dealsInUse[0]) {
      continue;
    }
    const deleted = await query<{ id: string }>(
      `DELETE FROM pipeline_stages
       WHERE workspace_id = $1 AND lower(name) = lower($2)
       RETURNING id`,
      [workspaceId, name]
    );
    if (deleted[0]) {
      removed += 1;
    }
  }
  return removed;
}

async function upsertScripts(workspaceId: string, userId: string | null): Promise<number> {
  let created = 0;
  for (const script of REAL_ESTATE_KZ_SCRIPTS) {
    const existing = await query<{ id: string }>(
      `SELECT id FROM message_scripts
       WHERE workspace_id = $1 AND title = $2
       LIMIT 1`,
      [workspaceId, script.title]
    );
    if (existing[0]) {
      await query(
        `UPDATE message_scripts
         SET category = $3, body = $4
         WHERE id = $1 AND workspace_id = $2`,
        [existing[0].id, workspaceId, script.category, script.body]
      );
      continue;
    }
    await query(
      `INSERT INTO message_scripts (workspace_id, title, category, body, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [workspaceId, script.title, script.category, script.body, userId]
    );
    created += 1;
  }
  return created;
}

async function ensureLanding(
  workspaceId: string,
  userId: string | null
): Promise<{ created: boolean; landingId: string | null }> {
  const existing = await query<{ id: string }>(
    `SELECT id FROM marketing_landing_pages
     WHERE workspace_id = $1 AND title = $2
     LIMIT 1`,
    [workspaceId, REAL_ESTATE_KZ_LANDING.title]
  );
  if (existing[0]) {
    return { created: false, landingId: existing[0].id };
  }
  const created = await createLandingPage(workspaceId, userId, {
    ...REAL_ESTATE_KZ_LANDING,
    status: "draft"
  });
  if ("error" in created) {
    return { created: false, landingId: null };
  }
  return { created: true, landingId: created.id };
}

export type ApplyRealEstateKzResult = {
  presetId: typeof REAL_ESTATE_KZ_PRESET_ID;
  stagesUpserted: number;
  legacyStagesRemoved: number;
  scriptsCreated: number;
  requiredFields: string[];
  landingCreated: boolean;
  landingId: string | null;
};

export async function applyRealEstateKzPreset(input: {
  workspaceId: string;
  userId?: string | null;
  createLanding?: boolean;
}): Promise<ApplyRealEstateKzResult> {
  const workspaceId = input.workspaceId;
  const userId = input.userId ?? null;

  for (const stage of REAL_ESTATE_KZ_STAGES) {
    await upsertStage(workspaceId, stage);
  }
  const legacyStagesRemoved = await cleanupUnusedLegacyStages(workspaceId);
  const scriptsCreated = await upsertScripts(workspaceId, userId);
  const requiredFields = await setContactRequiredFields(
    workspaceId,
    [...REAL_ESTATE_KZ_REQUIRED_FIELDS]
  );

  let landingCreated = false;
  let landingId: string | null = null;
  if (input.createLanding !== false) {
    const landing = await ensureLanding(workspaceId, userId);
    landingCreated = landing.created;
    landingId = landing.landingId;
  }

  return {
    presetId: REAL_ESTATE_KZ_PRESET_ID,
    stagesUpserted: REAL_ESTATE_KZ_STAGES.length,
    legacyStagesRemoved,
    scriptsCreated,
    requiredFields,
    landingCreated,
    landingId
  };
}
