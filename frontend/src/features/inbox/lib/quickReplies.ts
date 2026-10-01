// Быстрые ответы: «/» в начале поля ввода открывает список шаблонов,
// а выбранный шаблон вставляется целиком с подставленными именами.

export type QuickReplyScript = {
  id: string;
  title: string;
  category: string | null;
  body: string;
};

export type QuickReplyContext = {
  managerName?: string | null;
  contactName?: string | null;
  phone?: string | null;
  city?: string | null;
  clientType?: string | null;
  category?: string | null;
};

export const QUICK_REPLY_LIMIT = 8;

/** Текст после «/», если поле начинается с «/» и это ещё одна строка; иначе null. */
export function slashQuery(text: string): string | null {
  if (!text.startsWith("/") || text.includes("\n")) {
    return null;
  }
  return text.slice(1);
}

/** Шаблоны, у которых название (в первую очередь), категория или текст совпадают с запросом. */
export function matchQuickReplies<T extends QuickReplyScript>(
  scripts: T[],
  query: string,
  limit = QUICK_REPLY_LIMIT
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return scripts.slice(0, limit);
  }
  const byTitle: T[] = [];
  const byRest: T[] = [];
  for (const script of scripts) {
    if (script.title.toLowerCase().includes(needle)) {
      byTitle.push(script);
    } else if (
      [script.category, script.body].some((value) => (value || "").toLowerCase().includes(needle))
    ) {
      byRest.push(script);
    }
  }
  return [...byTitle, ...byRest].slice(0, limit);
}

/**
 * Подставляет {{name_manager}}, {{name}}, {{phone}}, {{city}}, {{client_type}}, {{category}}.
 * Неизвестные значения оставляют метку как есть, чтобы менеджер увидел и заполнил её сам.
 */
export function fillQuickReply(body: string, context: QuickReplyContext): string {
  const values: Record<string, string | null | undefined> = {
    name_manager: firstName(context.managerName),
    name: context.contactName,
    phone: context.phone,
    city: context.city,
    client_type: context.clientType,
    category: context.category
  };
  return body.replace(/\{\{([a-z_]+)\}\}/g, (token, key: string) => {
    const value = (values[key] || "").trim();
    return value || token;
  });
}

function firstName(fullName: string | null | undefined): string {
  return (fullName || "").trim().split(/\s+/)[0] || "";
}
