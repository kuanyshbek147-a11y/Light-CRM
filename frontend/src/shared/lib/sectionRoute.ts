// Раздел кабинета живёт в адресе как «#/tasks»: обновление страницы и ссылка коллеге открывают тот же экран.
// Якоря лендинга вроде «#workspace-login» сюда не попадают — у них нет «/».

export const APP_SECTIONS = [
  "dialogs",
  "pipeline",
  "tasks",
  "staff",
  "contacts",
  "profile",
  "analytics",
  "knowledge",
  "marketing",
  "ops",
  "integrations",
  "platform",
  "settings"
] as const;

export type AppSection = (typeof APP_SECTIONS)[number];

const ADMIN_ONLY: ReadonlySet<AppSection> = new Set<AppSection>(["ops", "integrations"]);

export function parseSectionHash(hash: string): AppSection | null {
  const match = /^#\/([a-z]+)\/?$/.exec(hash.trim());
  if (!match) {
    return null;
  }
  const section = match[1] as AppSection;
  return APP_SECTIONS.includes(section) ? section : null;
}

export function sectionHash(section: AppSection): string {
  return `#/${section}`;
}

/** Можно ли открыть раздел из адреса с этой ролью — иначе остаёмся в «Диалогах». */
export function canOpenSection(section: AppSection, role: string | null | undefined): boolean {
  if (role === "superadmin") {
    return section === "platform";
  }
  if (section === "platform") {
    return false;
  }
  if (ADMIN_ONLY.has(section)) {
    return role === "admin";
  }
  return true;
}
