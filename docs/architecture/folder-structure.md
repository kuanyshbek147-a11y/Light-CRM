# Целевая структура папок

## Backend

```text
backend/src/
  modules/
    auth/
    conversations/
    messages/
    deals/
    tasks/
    analytics/
    integrations/
      telegram/
      whatsapp/
  shared/
    db/
    errors/
    logger/
    types/
    utils/
  jobs/
  tests/
```

## Frontend

```text
frontend/src/
  app/
  features/
    inbox/
    deals/
    contacts/
    tasks/
    analytics/
  entities/
  shared/
    api/
    config/
    ui/
    lib/
  widgets/
```

## Принципы

- Модульная изоляция по домену.
- Общие утилиты и инфраструктура только в `shared`.
- UI-компоновки в `widgets`, бизнес-логика в `features`.
