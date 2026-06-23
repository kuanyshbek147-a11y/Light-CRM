# ERD v1 (рабочая версия)

Ниже зафиксирована целевая структура БД для текущего этапа CRM.

```mermaid
flowchart LR
  workspaces[workspaces]
  users[users]
  managers[managers]
  contacts[contacts]
  conversations[conversations]
  messages[messages]
  deals[deals]
  pipelineStages[pipeline_stages]
  tasks[tasks]
  activities[activities]
  metricSnapshots[metric_snapshots]

  workspaces --> users
  users --> managers
  workspaces --> contacts
  contacts --> conversations
  conversations --> messages
  conversations --> deals
  pipelineStages --> deals
  deals --> tasks
  conversations --> tasks
  users --> tasks
  users --> activities
  conversations --> activities
  users --> metricSnapshots
```

## Обязательные индексы

- `messages(conversation_id, created_at)`
- `conversations(status, assigned_manager_id, updated_at)`
- `deals(stage, amount)`
- `tasks(workspace_id, status, due_at)`
- уникальность снапшота: `(workspace_id, manager_user_id, metric_key, period_start, period_end)`
