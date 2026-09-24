import assert from "node:assert/strict";
import test from "node:test";
import { inboxFiltersActive, resolveInboxEmptyKind } from "./src/features/inbox/inboxEmpty.ts";
import { canCreateDealFromPipeline, createDealHint } from "./src/features/crm/pipelineEmpty.ts";

test("ноль диалогов без фильтра — пустое состояние без сброса", () => {
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

test("активный поиск при нуле диалогов просит сбросить фильтр", () => {
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
  assert.equal(/API/i.test(createDealHint(0)), false);
  assert.match(createDealHint(0, false), /администратор/i);
  assert.equal(/подключите канал/i.test(createDealHint(0, false)), false);
  assert.match(createDealHint(1), /диалог/i);
  assert.equal(/API|недоступно/i.test(createDealHint(1)), false);
});
