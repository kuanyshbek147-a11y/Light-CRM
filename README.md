# WhatsApp CRM MVP

Веб-MVP SaaS-сервиса для централизованной работы с клиентскими сообщениями, сделками и KPI менеджеров.

## Демо-учетные записи
- `manager@demo.local` / `demo123`
- `admin@demo.local` / `demo123`

## Локальный запуск без Docker
1. `npm install`
2. Поднимите PostgreSQL (`whatsapp_crm`, `postgres/postgres`)
3. Запустите seed: `npm run -w backend seed`
4. Запустите backend: `npm run -w backend dev`
5. Запустите frontend: `npm run -w frontend dev`

## Docker (рекомендуется)
- Файл: `infra/docker-compose.yml`
- Быстрый запуск: `npm run docker:up`
- Остановка: `npm run docker:down`
- Логи: `npm run docker:logs`
- Полный сброс данных БД: `npm run docker:reset`

### Пошаговый запуск через Docker на Windows
1. Установите Docker Desktop и проверьте команду `docker --version`.
2. Откройте проект `b:\\ИИ\\whatsapp-crm-mvp`.
3. Выполните `npm run docker:up`.
4. Дождитесь старта контейнеров `db`, `seed`, `backend`, `frontend`.
5. Откройте:
   - UI: `http://localhost:5173`
   - API health: `http://localhost:4000/health`

`seed` выполняется автоматически до старта `backend`, создает или обновляет демо-данные и безопасен для повторных запусков.

## Реализовано в MVP
- JWT login
- Единый inbox с поиском
- Просмотр диалога и отправка сообщений
- Симулятор входящих WhatsApp-событий
- Telegram Bot webhook и ответы из CRM обратно в Telegram
- Pipeline сделок и смена стадий
- KPI-дашборд (FRT, обработанные диалоги, исходящие сообщения)

## Архитектурные артефакты
- ERD v1: `docs/architecture/erd-v1.md`
- План спринтов: `docs/roadmap/crm-sprints.md`
- Целевая структура папок: `docs/architecture/folder-structure.md`
- План снижения рисков: `docs/architecture/risk-mitigation.md`

## Telegram интеграция
1. Создайте бота через `@BotFather` и получите токен.
2. Задайте переменные окружения:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_WEBHOOK_SECRET`
3. Поднимите проект через Docker.
4. Настройте webhook у Telegram:
   - `https://<your-domain>/api/integrations/telegram/webhook/<TELEGRAM_WEBHOOK_SECRET>`

Что работает:
- клиент пишет вашему Telegram-боту;
- сообщение попадает в CRM как новый или существующий диалог канала `telegram`;
- менеджер отвечает в CRM;
- ответ уходит обратно клиенту в Telegram.

Для локальной разработки webhook требует публичный HTTPS URL, например через `ngrok` или Cloudflare Tunnel.

## WhatsApp: официальный Meta Cloud API (рекомендуется)
1. В [Meta for Developers](https://developers.facebook.com/) создайте приложение и подключите продукт **WhatsApp**.
2. В разделе WhatsApp → API Setup получите:
   - **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`
   - **Temporary access token** (или permanent system user token) → `WHATSAPP_ACCESS_TOKEN`
3. В App Settings → Basic скопируйте **App ID** и **App Secret**:
   - `WHATSAPP_APP_ID`
   - `WHATSAPP_APP_SECRET`
4. Придумайте строку для верификации webhook → `WHATSAPP_VERIFY_TOKEN`.
5. Пропишите переменные в `infra/.env` или Render:
   - `WHATSAPP_PROVIDER=meta`
   - `WHATSAPP_ACCESS_TOKEN=...`
   - `WHATSAPP_PHONE_NUMBER_ID=...`
   - `WHATSAPP_APP_ID=...`
   - `WHATSAPP_VERIFY_TOKEN=...`
   - `WHATSAPP_APP_SECRET=...`
   - `WHATSAPP_API_VERSION=v21.0` (опционально)
6. Поднимите backend с публичным HTTPS URL.
7. Автоподписка webhook (или вручную в Meta Console):
   - `npm run -w backend setup:whatsapp-meta -- https://<your-domain>`
   - Callback URL: `https://<your-domain>/api/integrations/whatsapp/webhook`
   - Verify token: то же значение, что `WHATSAPP_VERIFY_TOKEN`
   - Поле подписки: **messages**
8. Проверьте статус:
   - `GET https://<your-domain>/api/integrations/whatsapp/status`

Что работает:
- входящие текстовые сообщения и изображения/видео из WhatsApp;
- создание контакта и диалога канала `whatsapp`;
- ответ менеджера из CRM уходит клиенту через Graph API;
- webhook verify (`hub.challenge`) и проверка подписи `X-Hub-Signature-256`.

Для локальной разработки нужен публичный HTTPS туннель (`ngrok`, Cloudflare Tunnel).

## WhatsApp интеграция через ChatApp
1. Задайте `WHATSAPP_PROVIDER=chatapp` (или не задавайте Meta-переменные).
2. В кабинете [ChatApp](https://chatapp.online/) получите/задайте:
   - `CHATAPP_API_TOKEN`
   - `CHATAPP_SEND_MESSAGE_PATH` (по умолчанию `/v1/messages`)
   - `CHATAPP_WEBHOOK_SECRET` (ваша строка)
   - при необходимости `CHATAPP_CHANNEL_ID`
2. Пропишите переменные в `infra/.env`:
   - `CHATAPP_API_BASE_URL=https://api.chatapp.online`
   - `CHATAPP_API_TOKEN=...`
   - `CHATAPP_SEND_MESSAGE_PATH=/v1/messages`
   - `CHATAPP_CHANNEL_ID=` (опционально)
   - `CHATAPP_WEBHOOK_SECRET=...`
   - `CHATAPP_WEBHOOK_SECRET_HEADER=x-chatapp-secret`
3. Поднимите проект через Docker.
4. В ChatApp укажите webhook CRM:
   - URL: `https://<your-domain>/api/integrations/whatsapp/webhook`
   - Передавайте секрет в заголовке `x-chatapp-secret` (или вашем заголовке из `CHATAPP_WEBHOOK_SECRET_HEADER`).
5. Проверьте статус интеграции:
   - `GET http://localhost:4000/api/integrations/whatsapp/status`

Что работает:
- входящие текстовые сообщения из WhatsApp через ChatApp попадают в CRM;
- для новых номеров создаются контакт и диалог канала `whatsapp`;
- ответ менеджера из CRM отправляется клиенту в WhatsApp через ChatApp API.

## Публикация онлайн (любой девайс)
### 1) Backend + PostgreSQL на Render
1. Откройте Render Dashboard и создайте сервис из `render.yaml` (Blueprint).
2. Дождитесь статуса `Live`.
3. Проверьте health backend:
   - `https://<render-backend-domain>/health`
4. После первого запуска заполните в Render переменные WhatsApp/Telegram при необходимости:
   - `WHATSAPP_PROVIDER=meta`
   - `WHATSAPP_ACCESS_TOKEN`
   - `WHATSAPP_PHONE_NUMBER_ID`
   - `WHATSAPP_VERIFY_TOKEN`
   - `WHATSAPP_APP_SECRET`
   - `WHATSAPP_API_VERSION`
   - `CHATAPP_API_BASE_URL`
   - `CHATAPP_API_TOKEN`
   - `CHATAPP_SEND_MESSAGE_PATH`
   - `CHATAPP_CHANNEL_ID` (опционально)
   - `CHATAPP_WEBHOOK_SECRET`
   - `CHATAPP_WEBHOOK_SECRET_HEADER`
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_WEBHOOK_SECRET`
   - `TELEGRAM_DELIVERY_MODE=webhook`
   - `AUTO_ASSIGNMENT_STRATEGY=round_robin` (`least_open_load` для назначения по минимальной загрузке)

### 2) Frontend на Netlify
1. Откройте [Netlify](https://app.netlify.com/) и импортируйте GitHub-репозиторий.
2. Build settings уже готовы из `netlify.toml`:
   - Base directory: `frontend`
   - Build command: `npm run build`
   - Publish directory: `dist`
3. Добавьте env переменную:
   - `VITE_API_URL=https://<render-backend-domain>/api`
4. Запустите Deploy.

В проект уже добавлен SPA redirect (`frontend/public/_redirects`) для корректного открытия страниц по прямым ссылкам без белого экрана.
