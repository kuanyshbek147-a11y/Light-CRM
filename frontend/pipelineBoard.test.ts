import assert from "node:assert/strict";
import test from "node:test";
import { groupDealsForBoard, ruDealCount } from "./src/features/crm/pipelineBoard.ts";

const stages = [
  { key: "Новый", label: "Новый" },
  { key: "Квалификация", label: "Квалификация" }
];

test("сделка с тем же этапом в другом регистре попадает в колонку", () => {
  const board = groupDealsForBoard(
    [{ id: "1", stage: " квалификация ", conversation_status: "open" }],
    stages,
    "open"
  );
  assert.equal(board.columns[1]?.items.length, 1);
  assert.equal(board.visibleCount, 1);
  assert.equal(board.hiddenCount, 0);
});

test("этап вне воронки остаётся карточкой, а не пропадает", () => {
  const board = groupDealsForBoard(
    [{ id: "1", stage: "qualified", conversation_status: "open" }],
    stages,
    "open"
  );
  const extra = board.columns.find((column) => column.label === "qualified");
  assert.ok(extra);
  assert.equal(extra?.items.length, 1);
  assert.equal(
    board.columns.reduce((sum, column) => sum + column.items.length, 0),
    1
  );
});

test("открытые и закрытые вкладки вместе равны числу сделок", () => {
  const deals = [
    { id: "1", stage: "Новый", conversation_status: "open" },
    { id: "2", stage: "qualified", conversation_status: "closed" }
  ];
  const open = groupDealsForBoard(deals, stages, "open");
  const closed = groupDealsForBoard(deals, stages, "closed");
  assert.equal(open.visibleCount + open.hiddenCount, deals.length);
  assert.equal(closed.visibleCount, 1);
  assert.equal(open.visibleCount + closed.visibleCount, deals.length);
});

test("склонение сделок", () => {
  assert.equal(ruDealCount(1), "1 сделка");
  assert.equal(ruDealCount(2), "2 сделки");
  assert.equal(ruDealCount(5), "5 сделок");
  assert.equal(ruDealCount(11), "11 сделок");
  assert.equal(ruDealCount(21), "21 сделка");
});
