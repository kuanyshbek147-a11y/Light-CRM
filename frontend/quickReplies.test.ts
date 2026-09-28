import assert from "node:assert/strict";
import test from "node:test";
import { fillQuickReply, matchQuickReplies, slashQuery } from "./src/features/inbox/lib/quickReplies.ts";

const scripts = [
  { id: "1", title: "Первый ответ", category: "Общее", body: "Здравствуйте! Я {{name_manager}}." },
  { id: "2", title: "Цена", category: "Продажи", body: "Стоимость зависит от объёма, уточню ответ." },
  { id: "3", title: "Доставка", category: "Логистика", body: "Доставим завтра, {{name}}." }
];

test("список открывается только на «/» в начале однострочного текста", () => {
  assert.equal(slashQuery("/"), "");
  assert.equal(slashQuery("/цен"), "цен");
  assert.equal(slashQuery("привет /цен"), null);
  assert.equal(slashQuery("/цен\nещё строка"), null);
  assert.equal(slashQuery(""), null);
});

test("совпадения по названию идут раньше совпадений по тексту", () => {
  const found = matchQuickReplies(scripts, "ответ");
  assert.deepEqual(found.map((s) => s.id), ["1", "2"]);
});

test("пустой запрос показывает первые шаблоны с ограничением", () => {
  assert.equal(matchQuickReplies(scripts, "", 2).length, 2);
  assert.equal(matchQuickReplies(scripts, "  ").length, 3);
});

test("поиск без учёта регистра и по категории", () => {
  assert.deepEqual(matchQuickReplies(scripts, "ЛОГИСТ").map((s) => s.id), ["3"]);
});

test("подставляет имя менеджера и клиента", () => {
  assert.equal(
    fillQuickReply(scripts[0].body, { managerName: "Айгерим Садыкова" }),
    "Здравствуйте! Я Айгерим."
  );
  assert.equal(fillQuickReply(scripts[2].body, { contactName: "Ерлан" }), "Доставим завтра, Ерлан.");
});

test("неизвестные или пустые значения оставляют метку для ручного заполнения", () => {
  assert.equal(fillQuickReply("Город: {{city}}", { city: "  " }), "Город: {{city}}");
  assert.equal(fillQuickReply("{{unknown}}", {}), "{{unknown}}");
});
