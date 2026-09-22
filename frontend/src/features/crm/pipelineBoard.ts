export type BoardDeal = {
  id: string;
  stage: string;
  conversation_status?: string | null;
};

export type BoardColumnDef = {
  key: string;
  label: string;
};

export type BoardColumn<T> = {
  key: string;
  label: string;
  items: T[];
};

export function normalizeStageKey(stage: string): string {
  return stage.trim().toLowerCase();
}

export function ruDealCount(count: number): string {
  const n = Math.abs(Math.trunc(count));
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? "сделка"
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? "сделки"
        : "сделок";
  return `${count} ${word}`;
}

/**
 * Группирует сделки по этапам воронки.
 * Сравнение этапа без учёта регистра и пробелов по краям.
 * Сделка с этапом вне списка колонок остаётся видимой в своей колонке,
 * чтобы счётчик клиента не расходился с доской.
 */
export function groupDealsForBoard<T extends BoardDeal>(
  deals: T[],
  columns: BoardColumnDef[],
  statusFilter: "open" | "closed"
): { columns: BoardColumn<T>[]; hiddenCount: number; visibleCount: number } {
  const visible = deals.filter((deal) => (deal.conversation_status || "open") === statusFilter);
  const grouped: BoardColumn<T>[] = columns.map((column) => ({
    key: column.key,
    label: column.label,
    items: []
  }));
  const byKey = new Map(grouped.map((column) => [normalizeStageKey(column.key), column]));
  const extras: BoardColumn<T>[] = [];
  const extraByKey = new Map<string, BoardColumn<T>>();

  for (const deal of visible) {
    const key = normalizeStageKey(deal.stage || "");
    const known = key ? byKey.get(key) : undefined;
    if (known) {
      known.items.push(deal);
      continue;
    }
    const extraKey = key || "__empty__";
    let bucket = extraByKey.get(extraKey);
    if (!bucket) {
      const label = deal.stage.trim() || "Без этапа";
      bucket = { key: deal.stage.trim(), label, items: [] };
      extraByKey.set(extraKey, bucket);
      extras.push(bucket);
    }
    bucket.items.push(deal);
  }

  return {
    columns: [...grouped, ...extras],
    hiddenCount: deals.length - visible.length,
    visibleCount: visible.length
  };
}
