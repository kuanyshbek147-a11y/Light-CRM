# Онбординг новой компании (tenant)

Как подключить второго (и следующих) клиентов Light CRM без смешивания WhatsApp / Instagram / сайта.

## Что уже есть

- Superadmin → раздел **Компании** (`PlatformPanel`)
- У каждой компании свой `workspace_id`, свои пользователи, чаты, сделки, маркетинг
- Каналы хранятся в `workspace_settings` (не в общем env Render)

## Подготовка платформы (один раз)

1. Meta App + Embedded Signup + webhook на прод backend.
2. В Render оставить **только платформенные** секреты:
   - `WHATSAPP_APP_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`
   - `WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID`
   - Instagram App id/secret (OAuth)
3. **Не** держать в env токены конкретного клиента:
   - `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`
   - `INSTAGRAM_PAGE_ACCESS_TOKEN`, `TELEGRAM_BOT_TOKEN`
4. При 2+ компаниях fallback на «первый workspace» **отключён**.  
   Принудительно включить только для аварийного single-tenant:  
   `ALLOW_LEGACY_CHANNEL_FALLBACK=1` (не рекомендуется на проде с несколькими клиентами).

## Чеклист новой компании

1. Войти как **superadmin**.
2. **Компании → Новая компания**: название + admin (руководитель).
3. Добавить операторов (`manager`) в той же панели.
4. Руководитель логинится → **Интеграции**:
   - WhatsApp (Embedded Signup) — свой номер / WABA
   - Instagram — свой Business аккаунт
   - Telegram — свой бот (если нужен)
   - Email / Webchat / лендинг — по необходимости
5. Тест: сообщение на **их** WhatsApp/Instagram → диалог только в **их** кабинете.
6. Сменить временные пароли.

## Важно

| Можно | Нельзя |
|--------|--------|
| Подключать каналы через UI Интеграции | Прописывать токен клиента №2 в Render env |
| Уникальные login/email на всю платформу | Один email в двух компаниях |
| Свой лендинг/slug в Маркетинге | Использовать `bootstrap-whatsapp-workspace` для клиента №2 |

## Если входящие не приходят

1. В Platform → карточка компании: есть ли WABA / phone / Instagram ids.
2. Логи Render: `[tenant] drop channel event` = событие без match (правильно при чужом/неподключённом канале).
3. Проверить, что webhook Meta указывает на прод URL Light CRM.

## Роли

- `admin` — руководитель компании (интеграции, настройки)
- `manager` — оператор (диалоги, задачи)
- `superadmin` — только вы (создание компаний)
