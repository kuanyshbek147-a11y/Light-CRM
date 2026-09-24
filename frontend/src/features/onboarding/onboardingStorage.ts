export const ONBOARDING_STORAGE_KEY = "lightcrm.firstRunOnboarding.v1";

export type OnboardingStepId = "channel" | "lead" | "next";

export type OnboardingStatus = "pending" | "skipped" | "completed";

export type OnboardingSteps = Record<OnboardingStepId, boolean>;

export type OnboardingState = {
  status: OnboardingStatus;
  steps: OnboardingSteps;
};

export const ONBOARDING_STEP_IDS: readonly OnboardingStepId[] = ["channel", "lead", "next"];

/** Текст, который оператор отправляет администратору, чтобы подключили каналы. */
export const ADMIN_CHANNEL_REQUEST_TEXT =
  "Здравствуйте! Подключите, пожалуйста, в Light CRM каналы WhatsApp, Instagram и Telegram — раздел «Интеграции». Пока канал не подключён, в диалогах только учебные чаты, живые сообщения клиентов не приходят.";

export function onboardingStepsFinished(steps: OnboardingSteps): boolean {
  return ONBOARDING_STEP_IDS.every((id) => steps[id]);
}

export function withOnboardingStep(state: OnboardingState, stepId: OnboardingStepId): OnboardingState {
  if (state.steps[stepId]) return state;
  return {
    status: state.status,
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
    return { status: "completed", steps };
  }
  const finished = onboardingStepsFinished(steps);
  return {
    status: intent === "done" && finished ? "completed" : "skipped",
    steps
  };
}

const EMPTY_STEPS: OnboardingSteps = {
  channel: false,
  lead: false,
  next: false
};

export function emptyOnboardingState(): OnboardingState {
  return {
    status: "pending",
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
    steps: {
      channel: Boolean(steps?.channel),
      lead: Boolean(steps?.lead),
      next: Boolean(steps?.next)
    }
  };
}

function readStore(): Store {
  try {
    const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY);
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
  return normalize(readStore()[userKey]);
}

export function saveOnboarding(userKey: string, state: OnboardingState): void {
  if (!userKey) return;
  try {
    const store = readStore();
    store[userKey] = {
      status: state.status,
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
