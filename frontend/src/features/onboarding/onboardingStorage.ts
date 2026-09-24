export const ONBOARDING_STORAGE_KEY = "lightcrm.firstRunOnboarding.v2";
const ONBOARDING_STORAGE_KEY_V1 = "lightcrm.firstRunOnboarding.v1";

export type OnboardingStepId = "channel" | "lead" | "next";

export type OnboardingStatus = "pending" | "skipped" | "completed";

export type OnboardingSteps = Record<OnboardingStepId, boolean>;

export type OnboardingState = {
  status: OnboardingStatus;
  /** Оверлей уже закрывали. Пока флага нет — оператору и админу показываем мастер один раз. */
  seen: boolean;
  steps: OnboardingSteps;
};

export const ONBOARDING_STEP_IDS: readonly OnboardingStepId[] = ["channel", "lead", "next"];

/** Текст, который оператор отправляет администратору, чтобы подключили каналы. */
export const ADMIN_CHANNEL_REQUEST_TEXT =
  "Здравствуйте, подключите WhatsApp, Instagram или Telegram в разделе «Интеграции» Light CRM. Пока канала нет, в диалогах только учебные примеры.";

export function onboardingStepsFinished(steps: OnboardingSteps): boolean {
  return ONBOARDING_STEP_IDS.every((id) => steps[id]);
}

export function withOnboardingStep(state: OnboardingState, stepId: OnboardingStepId): OnboardingState {
  if (state.steps[stepId]) return state;
  return {
    status: state.status,
    seen: state.seen,
    steps: { ...state.steps, [stepId]: true }
  };
}

/**
 * «Готово» и «Пропустить» закрывают мастер и не отмечают несделанные шаги.
 * Статус completed ставится только когда все три шага уже отмечены действиями.
 */
export function closeOnboarding(state: OnboardingState, intent: "skip" | "done"): OnboardingState {
  const steps = { ...state.steps };
  if (state.status === "completed" && onboardingStepsFinished(steps)) {
    return { status: "completed", seen: true, steps };
  }
  const finished = onboardingStepsFinished(steps);
  return {
    status: intent === "done" && finished ? "completed" : "skipped",
    seen: true,
    steps
  };
}

export function markOnboardingSeen(state: OnboardingState): OnboardingState {
  if (state.seen) return state;
  return { ...state, seen: true };
}

/**
 * Автопоказ только при первом заходе, если мастер ещё не закрывали.
 * Суперадмин не видит кабинет компании. Повторный вход не открывает оверлей.
 */
export function shouldAutoOpenFirstRun(
  state: OnboardingState,
  role: string | null | undefined
): boolean {
  if (state.seen) return false;
  if (!role || role === "superadmin") return false;
  return true;
}

/** Старые галочки не переносим: их ставили за клик по кнопке, а не за действие. */
export function migrateLegacyOnboarding(record: Partial<OnboardingState> | undefined): OnboardingState {
  const status = record?.status;
  return {
    status: status === "skipped" || status === "completed" ? status : "pending",
    seen: true,
    steps: { channel: false, lead: false, next: false }
  };
}

/**
 * Канал засчитан, только если WhatsApp, Instagram или Telegram подключены в этом кабинете.
 * Общая настройка сервера (env) и скопированная просьба администратору канал не закрывают.
 */
export function workspaceMessagingChannelConnected(input: {
  whatsappConnected?: boolean;
  instagramConnected?: boolean;
  instagramSource?: string | null;
  telegramConnected?: boolean;
  telegramSource?: string | null;
}): boolean {
  const instagram = input.instagramSource === "workspace" && Boolean(input.instagramConnected);
  const telegram = input.telegramSource === "workspace" && Boolean(input.telegramConnected);
  return Boolean(input.whatsappConnected) || instagram || telegram;
}

const EMPTY_STEPS: OnboardingSteps = {
  channel: false,
  lead: false,
  next: false
};

export function emptyOnboardingState(): OnboardingState {
  return {
    status: "pending",
    seen: false,
    steps: { ...EMPTY_STEPS }
  };
}

export function onboardingUserKey(user: { id?: string; email?: string; login?: string | null } | null | undefined): string {
  const key = user?.id || user?.email || user?.login || "";
  return key.trim();
}

type Store = Record<string, Partial<OnboardingState> | undefined>;

function normalize(record: Partial<OnboardingState> | undefined): OnboardingState {
  const status = record?.status;
  const steps = record?.steps;
  return {
    status: status === "skipped" || status === "completed" ? status : "pending",
    seen: record?.seen === true,
    steps: {
      channel: Boolean(steps?.channel),
      lead: Boolean(steps?.lead),
      next: Boolean(steps?.next)
    }
  };
}

function readStore(key: string): Store {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Store;
  } catch {
    return {};
  }
}

export function readOnboarding(userKey: string): OnboardingState {
  if (!userKey) return emptyOnboardingState();
  const current = readStore(ONBOARDING_STORAGE_KEY)[userKey];
  if (current) return normalize(current);
  const legacy = readStore(ONBOARDING_STORAGE_KEY_V1)[userKey];
  if (legacy) return migrateLegacyOnboarding(legacy);
  return emptyOnboardingState();
}

export function saveOnboarding(userKey: string, state: OnboardingState): void {
  if (!userKey) return;
  try {
    const store = readStore(ONBOARDING_STORAGE_KEY);
    store[userKey] = {
      status: state.status,
      seen: state.seen,
      steps: { ...state.steps }
    };
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Приватный режим или переполненное хранилище — мастер всё равно работает в этой сессии.
  }
}

const DEMO_NAME = "ип ромашка";

export function usesDemoSampleData(
  user: { email?: string } | null | undefined,
  conversations: Array<{ contact_name?: string | null; phone?: string | null }>
): boolean {
  const email = (user?.email || "").trim().toLowerCase();
  if (email.endsWith("@demo.local")) return true;
  return conversations.some((item) => {
    const phone = (item.phone || "").replace(/[^\d]/g, "");
    if (phone.endsWith("77000000001")) return true;
    return (item.contact_name || "").trim().toLowerCase() === DEMO_NAME;
  });
}

export function firstIncompleteStep(steps: OnboardingSteps): number {
  const index = ONBOARDING_STEP_IDS.findIndex((id) => !steps[id]);
  return index === -1 ? 0 : index;
}
