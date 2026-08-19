/**
 * Rewrite corrupted Aug 20–26 marketing posts with correct UTF-8 Russian copy.
 * Usage: node infra/scripts/fix-marketing-posts-utf8.mjs
 */
const API = "https://light-crm-backend.onrender.com/api";

const posts = [
  {
    id: "0a510f84-81f9-4450-82f3-f972af20e8d3",
    title: "Пилот 14 дней под ключ",
    body: `Не «бесплатно навсегда».
Пилот 14 дней:
• 1 канал (WA / IG / TG)
• до 3 менеджеров
• настройка в день 0
• разбор на день 7
• на день 14 — Kaspi 29 900 ₸/мес или стоп

Напишите «ДЕМО» — покажу на вашем сценарии.
WhatsApp: https://wa.me/77003131055`,
    imageUrl:
      "https://images.pexels.com/photos/3184339/pexels-photo-3184339.jpeg?auto=compress&cs=tinysrgb&w=1080&h=1080&fit=crop"
  },
  {
    id: "dba238f8-0a67-415c-95b4-660299557ddc",
    title: "WhatsApp Business ≠ система продаж",
    body: `«У нас уже есть WhatsApp Business» — ок.
WB — это канал.
Light CRM — это отдел: все чаты вместе, скорость ответа, воронка, кто отвечает.

Канал ≠ система продаж.
«ДЕМО» — разберём ваш сценарий за 20 минут.`,
    imageUrl:
      "https://images.pexels.com/photos/3184360/pexels-photo-3184360.jpeg?auto=compress&cs=tinysrgb&w=1080&h=1080&fit=crop"
  },
  {
    id: "ad5b680d-3e06-420b-a98a-cf65b6b76959",
    title: "ROI рекламы: spend → лиды → деньги",
    body: `Сколько потратили на рекламу — и сколько дошло до оплаты?

В Light CRM: клики → заявки → сделки → выручка в одном отчёте.
Пилот 14 дней. Напишите «ДЕМО» в Direct или WhatsApp: https://wa.me/77003131055`,
    imageUrl:
      "https://images.pexels.com/photos/590022/pexels-photo-590022.jpeg?auto=compress&cs=tinysrgb&w=1080&h=1080&fit=crop"
  },
  {
    id: "e1a55f56-8030-4c07-a2ec-30e56f0519cc",
    title: "3 правила дисциплины в мессенджерах",
    body: `1) Один inbox на команду
2) Назначение ответственного
3) SLA на первый ответ

Без этого отдел «теряет» лиды в личных чатах.
Light CRM — пилот 14 дней. Напишите «ДЕМО».
WhatsApp: https://wa.me/77003131055`,
    imageUrl:
      "https://images.pexels.com/photos/3184291/pexels-photo-3184291.jpeg?auto=compress&cs=tinysrgb&w=1080&h=1080&fit=crop"
  },
  {
    id: "ad5605fa-722d-4ee5-9513-4d21f8764715",
    title: "Кому подходит Light CRM",
    body: `Подходит: МСБ 2–15 человек, продажи каждый день в WA/IG/TG.
Не подходит: если ищете «ещё одну красивую воронку без дисциплины».

Пилот 14 дней под ключ → Kaspi 29 900 ₸/мес.
Напишите «ДЕМО» в Direct.`,
    imageUrl:
      "https://images.pexels.com/photos/3183197/pexels-photo-3183197.jpeg?auto=compress&cs=tinysrgb&w=1080&h=1080&fit=crop"
  },
  {
    id: "77c24112-3b9d-4125-a74c-f1f325f7102f",
    title: "Слоты на демо на этой неделе",
    body: `Откроем 5 слотов на демо 20 минут.
Покажу inbox, воронку и скорость ответа на вашем сценарии.

Напишите «ДЕМО» в Direct или WhatsApp: https://wa.me/77003131055
Пилот 14 дней. Оплата после — Kaspi.`,
    imageUrl:
      "https://images.pexels.com/photos/3182773/pexels-photo-3182773.jpeg?auto=compress&cs=tinysrgb&w=1080&h=1080&fit=crop"
  },
  {
    id: "15a9a3aa-4f53-49ae-9329-985b2e052161",
    title: "Цена честно: 29 900 ₸/мес",
    body: `После пилота 14 дней — 29 900 ₸/мес через Kaspi.
До 5 пользователей, inbox WA/IG/TG, воронка и KPI.

Без скрытых модулей. Напишите «ДЕМО» — разберём ваш отдел за 20 минут.
https://wa.me/77003131055`,
    imageUrl:
      "https://images.pexels.com/photos/4386370/pexels-photo-4386370.jpeg?auto=compress&cs=tinysrgb&w=1080&h=1080&fit=crop"
  }
];

async function main() {
  const loginRes = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ login: "admin", password: "demo123" })
  });
  if (!loginRes.ok) {
    throw new Error(`login failed: ${loginRes.status} ${await loginRes.text()}`);
  }
  const { token } = await loginRes.json();

  for (const post of posts) {
    const res = await fetch(`${API}/marketing/posts/${post.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify({
        title: post.title,
        body: post.body,
        imageUrl: post.imageUrl,
        status: "ready",
        autoPublishSocial: true
      })
    });
    const text = await res.text();
    if (!res.ok) {
      console.error("FAIL", post.id, res.status, text);
      continue;
    }
    const data = JSON.parse(text);
    console.log("OK", data.planned_at, data.title);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
