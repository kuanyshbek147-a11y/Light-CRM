import assert from "node:assert/strict";
import test from "node:test";
import {
  channelFilterIsEmpty,
  conversationsForChannel,
  inboxCenterConversation
} from "./src/features/inbox/lib/channelFilter.ts";

const chats = [
  { id: "1", channel: "whatsapp" },
  { id: "2", channel: "telegram" }
];

test("фильтр Email при живых чатах других каналов пустой", () => {
  assert.equal(channelFilterIsEmpty(chats, "email"), true);
  assert.deepEqual(conversationsForChannel(chats, "email"), []);
});

test("фильтр «Все» не считается пустым каналом, даже если чатов нет", () => {
  assert.equal(channelFilterIsEmpty([], "all"), false);
  assert.equal(channelFilterIsEmpty(chats, "all"), false);
});

test("пустой список не оставляет в центре чужой чат", () => {
  assert.equal(inboxCenterConversation([], "other-user-chat"), null);
  assert.equal(inboxCenterConversation(chats, "missing"), null);
  assert.equal(inboxCenterConversation(chats, "2")?.id, "2");
});

test("фильтр показывает только чаты выбранного канала", () => {
  assert.deepEqual(
    conversationsForChannel(chats, "whatsapp").map((item) => item.id),
    ["1"]
  );
  assert.equal(channelFilterIsEmpty(chats, "whatsapp"), false);
});
