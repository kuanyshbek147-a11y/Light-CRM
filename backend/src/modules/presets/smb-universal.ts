import type { StageOutcome } from "../pipeline/stages";

export const SMB_UNIVERSAL_PRESET_ID = "smb-universal" as const;

export const SMB_UNIVERSAL_PRESET_NAME = "Универсальный";

/** Этапы новой компании. Существующие воронки этим списком не переписываются. */
export const SMB_UNIVERSAL_STAGES: Array<{
  name: string;
  position: number;
  outcome: StageOutcome;
}> = [
  { name: "Новая заявка", position: 10, outcome: "open" },
  { name: "В работе", position: 20, outcome: "open" },
  { name: "Счёт или предложение", position: 30, outcome: "open" },
  { name: "Успешно", position: 40, outcome: "won" },
  { name: "Отказ", position: 50, outcome: "lost" }
];

export const SMB_UNIVERSAL_SCRIPTS: Array<{
  title: string;
  category: string;
  body: string;
}> = [
  {
    title: "Первый ответ",
    category: "Общее",
    body: "Здравствуйте! Спасибо за сообщение. Я {{name_manager}}. Коротко уточню задачу и напишу, как можем помочь."
  },
  {
    title: "Уточнение запроса",
    category: "Общее",
    body: "Чтобы ответить точнее: что именно нужно, к какому сроку и в каком городе? Если есть бюджет или пожелания — напишите, учтём сразу."
  },
  {
    title: "Счёт или предложение",
    category: "Общее",
    body: "Подготовил вариант под ваш запрос. Могу прислать счёт или короткое предложение в этот чат. Удобно посмотреть сегодня?"
  },
  {
    title: "Напоминание",
    category: "Общее",
    body: "Добрый день! Напоминаю о нашем предложении. Если задача ещё актуальна — напишите, продолжим. Если планы изменились, тоже дайте знать."
  },
  {
    title: "Отказ или пауза",
    category: "Общее",
    body: "Понял, спасибо что написали. Если вернётесь к задаче позже — отвечу здесь же и подскажу следующий шаг."
  }
];

export const SMB_UNIVERSAL_LANDING = {
  title: "Страница для клиентов",
  brandName: "Наша компания",
  headline: "Напишите нам — ответим и доведём заявку до результата",
  subheadline: "Коротко уточним задачу, пришлём предложение и останемся на связи в мессенджере.",
  body: [
    "Подходит магазину, услугам и небольшой команде: заявка, работа, счёт и итог в одной воронке.",
    "Напишите, что нужно и к какому сроку. Менеджер ответит в рабочее время."
  ].join("\n\n"),
  ctaLabel: "Написать в WhatsApp",
  ctaPrefill: "Здравствуйте! Хочу оставить заявку. Что нужно: … Срок: …"
};
