import assert from "node:assert/strict";
import test from "node:test";
import { inboxFiltersActive, resolveInboxEmptyKind } from "./src/features/inbox/inboxEmpty.ts";
import { canCreateDealFromPipeline, createDealHint } from "./src/features/crm/pipelineEmpty.ts";

test("пустой inbox без фильтров ведёт к подключению канала", () => {
  assert.equal(
    resolveInboxEmptyKind({
      loading: false,
      conversationCount: 0,
      visibleCount: 0,
      channelFilter: "all",
      search: "",
      filtersActive: false
    }),
    "activate"
  );
});

test("пустой результат поиска не маскируется под «подключите канал»", () => {
  assert.equal(
    resolveInboxEmptyKind({
      loading: false,
      conversationCount: 0,
      visibleCount: 0,
      channelFilter: "all",
      search: "иван",
      filtersActive: false
    }),
    "query"
  );
  assert.equal(inboxFiltersActive({ city: "Алматы", inquiryReason: "" }), true);
});

test("фильтр канала предлагает сбросить чип, если диалоги есть", () => {
  assert.equal(
    resolveInboxEmptyKind({
      loading: false,
      conversationCount: 3,
      visibleCount: 0,
      channelFilter: "telegram",
      search: "",
      filtersActive: false
    }),
    "channel-filter"
  );
});

test("сделку из воронки можно открыть только при наличии диалога", () => {
  assert.equal(canCreateDealFromPipeline(0), false);
  assert.equal(canCreateDealFromPipeline(2), true);
  assert.match(createDealHint(0), /подключите канал/i);
  assert.match(createDealHint(1), /диалог/i);
});
