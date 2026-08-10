import { query } from "../../db";

const KEYS = {
  enabled: "follow_up_enabled",
  onStageChange: "follow_up_on_stage_change",
  stageDueHours: "follow_up_stage_due_hours",
  onSilence: "follow_up_on_silence",
  silenceHours: "follow_up_silence_hours",
  skipClosedStages: "follow_up_skip_closed_stages"
} as const;

export type FollowUpSettings = {
  enabled: boolean;
  onStageChange: boolean;
  stageDueHours: number;
  onSilence: boolean;
  silenceHours: number;
  skipClosedStages: boolean;
};

const DEFAULTS: FollowUpSettings = {
  enabled: true,
  onStageChange: true,
  stageDueHours: 24,
  onSilence: true,
  silenceHours: 48,
  skipClosedStages: true
};

async function getSetting(workspaceId: string, key: string): Promise<string | null> {
  const rows = await query<{ value: string }>(
    `SELECT value FROM workspace_settings WHERE workspace_id = $1 AND key = $2 LIMIT 1`,
    [workspaceId, key]
  );
  return rows[0]?.value ?? null;
}

async function setSetting(workspaceId: string, key: string, value: string): Promise<void> {
  await query(
    `INSERT INTO workspace_settings (workspace_id, key, value)
     VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [workspaceId, key, value]
  );
}

function parseBool(value: string | null, fallback: boolean): boolean {
  if (value == null) {
    return fallback;
  }
  return value === "1" || value.toLowerCase() === "true";
}

function parseHours(value: string | null, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) {
    return fallback;
  }
  return Math.min(720, Math.round(n));
}

export async function getFollowUpSettings(workspaceId: string): Promise<FollowUpSettings> {
  const [enabled, onStageChange, stageDueHours, onSilence, silenceHours, skipClosedStages] =
    await Promise.all([
      getSetting(workspaceId, KEYS.enabled),
      getSetting(workspaceId, KEYS.onStageChange),
      getSetting(workspaceId, KEYS.stageDueHours),
      getSetting(workspaceId, KEYS.onSilence),
      getSetting(workspaceId, KEYS.silenceHours),
      getSetting(workspaceId, KEYS.skipClosedStages)
    ]);

  return {
    enabled: parseBool(enabled, DEFAULTS.enabled),
    onStageChange: parseBool(onStageChange, DEFAULTS.onStageChange),
    stageDueHours: parseHours(stageDueHours, DEFAULTS.stageDueHours),
    onSilence: parseBool(onSilence, DEFAULTS.onSilence),
    silenceHours: parseHours(silenceHours, DEFAULTS.silenceHours),
    skipClosedStages: parseBool(skipClosedStages, DEFAULTS.skipClosedStages)
  };
}

export async function setFollowUpSettings(
  workspaceId: string,
  input: Partial<FollowUpSettings>
): Promise<FollowUpSettings> {
  const current = await getFollowUpSettings(workspaceId);
  const next: FollowUpSettings = {
    enabled: input.enabled ?? current.enabled,
    onStageChange: input.onStageChange ?? current.onStageChange,
    stageDueHours: parseHours(
      input.stageDueHours != null ? String(input.stageDueHours) : null,
      current.stageDueHours
    ),
    onSilence: input.onSilence ?? current.onSilence,
    silenceHours: parseHours(
      input.silenceHours != null ? String(input.silenceHours) : null,
      current.silenceHours
    ),
    skipClosedStages: input.skipClosedStages ?? current.skipClosedStages
  };

  await Promise.all([
    setSetting(workspaceId, KEYS.enabled, next.enabled ? "true" : "false"),
    setSetting(workspaceId, KEYS.onStageChange, next.onStageChange ? "true" : "false"),
    setSetting(workspaceId, KEYS.stageDueHours, String(next.stageDueHours)),
    setSetting(workspaceId, KEYS.onSilence, next.onSilence ? "true" : "false"),
    setSetting(workspaceId, KEYS.silenceHours, String(next.silenceHours)),
    setSetting(workspaceId, KEYS.skipClosedStages, next.skipClosedStages ? "true" : "false")
  ]);

  return next;
}

function isClosedStage(stage: string): boolean {
  const s = stage.toLowerCase();
  return (
    s.includes("won") ||
    s.includes("lost") ||
    s.includes("выиг") ||
    s.includes("проиг") ||
    s.includes("отказ") ||
    s.includes("успех") ||
    s.includes("закрыт")
  );
}

async function hasOpenFollowUp(workspaceId: string, conversationId: string, titlePrefix: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `SELECT id
     FROM tasks
     WHERE workspace_id = $1
       AND conversation_id = $2
       AND status = 'open'
       AND title LIKE $3
     LIMIT 1`,
    [workspaceId, conversationId, `${titlePrefix}%`]
  );
  return Boolean(rows[0]);
}

async function createFollowUpTask(input: {
  workspaceId: string;
  conversationId: string;
  dealId?: string | null;
  ownerUserId?: string | null;
  title: string;
  dueHours: number;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const inserted = await query<{ id: string }>(
    `INSERT INTO tasks (workspace_id, conversation_id, deal_id, owner_user_id, title, due_at)
     VALUES ($1, $2, $3, $4, $5, now() + ($6::text || ' hours')::interval)
     RETURNING id`,
    [
      input.workspaceId,
      input.conversationId,
      input.dealId || null,
      input.ownerUserId || null,
      input.title,
      String(input.dueHours)
    ]
  );

  if (inserted[0]) {
    await query(
      `INSERT INTO activities (workspace_id, user_id, conversation_id, action, metadata)
       VALUES ($1, $2, $3, 'follow_up_created', $4::jsonb)`,
      [
        input.workspaceId,
        input.ownerUserId || null,
        input.conversationId,
        JSON.stringify({ task_id: inserted[0].id, title: input.title, ...input.metadata })
      ]
    );
  }
}

/** После смены этапа сделки — задача «связаться / дожать». */
export async function maybeCreateStageFollowUp(input: {
  workspaceId: string;
  conversationId: string;
  dealId: string;
  stage: string;
  previousStage?: string | null;
  ownerUserId?: string | null;
}): Promise<void> {
  if (input.previousStage && input.previousStage === input.stage) {
    return;
  }

  const settings = await getFollowUpSettings(input.workspaceId);
  if (!settings.enabled || !settings.onStageChange) {
    return;
  }
  if (settings.skipClosedStages && isClosedStage(input.stage)) {
    return;
  }

  const titlePrefix = "Follow-up: этап";
  if (await hasOpenFollowUp(input.workspaceId, input.conversationId, titlePrefix)) {
    return;
  }

  await createFollowUpTask({
    workspaceId: input.workspaceId,
    conversationId: input.conversationId,
    dealId: input.dealId,
    ownerUserId: input.ownerUserId,
    title: `Follow-up: этап «${input.stage}»`,
    dueHours: settings.stageDueHours,
    metadata: { kind: "stage_change", stage: input.stage, previous_stage: input.previousStage || null }
  });
}

/** Диалоги без сообщений дольше N часов — создать follow-up. */
export async function scanSilenceFollowUps(): Promise<number> {
  const workspaces = await query<{ workspace_id: string }>(
    `SELECT DISTINCT workspace_id FROM conversations WHERE status = 'open'`
  );

  let created = 0;
  for (const row of workspaces) {
    const workspaceId = row.workspace_id;
    const settings = await getFollowUpSettings(workspaceId);
    if (!settings.enabled || !settings.onSilence) {
      continue;
    }

    const candidates = await query<{
      conversation_id: string;
      deal_id: string | null;
      owner_user_id: string | null;
      stage: string | null;
      last_message_at: string | null;
    }>(
      `SELECT c.id AS conversation_id,
              d.id AS deal_id,
              COALESCE(c.assigned_manager_id, d.owner_user_id) AS owner_user_id,
              d.stage,
              (
                SELECT MAX(m.created_at)
                FROM messages m
                WHERE m.conversation_id = c.id
              ) AS last_message_at
       FROM conversations c
       LEFT JOIN deals d ON d.conversation_id = c.id
       WHERE c.workspace_id = $1
         AND c.status = 'open'
         AND (
           SELECT MAX(m.created_at)
           FROM messages m
           WHERE m.conversation_id = c.id
         ) < now() - ($2::text || ' hours')::interval`,
      [workspaceId, String(settings.silenceHours)]
    );

    for (const candidate of candidates) {
      if (settings.skipClosedStages && candidate.stage && isClosedStage(candidate.stage)) {
        continue;
      }
      const titlePrefix = "Follow-up: нет ответа";
      if (await hasOpenFollowUp(workspaceId, candidate.conversation_id, titlePrefix)) {
        continue;
      }
      await createFollowUpTask({
        workspaceId,
        conversationId: candidate.conversation_id,
        dealId: candidate.deal_id,
        ownerUserId: candidate.owner_user_id,
        title: "Follow-up: нет ответа",
        dueHours: 4,
        metadata: {
          kind: "silence",
          silence_hours: settings.silenceHours,
          last_message_at: candidate.last_message_at
        }
      });
      created += 1;
    }
  }

  return created;
}

let silenceTimer: NodeJS.Timeout | null = null;

export function startFollowUpScanner(): void {
  if (silenceTimer) {
    return;
  }
  const tick = async () => {
    try {
      const created = await scanSilenceFollowUps();
      if (created > 0) {
        console.log(`Follow-up scanner created ${created} task(s)`);
      }
    } catch (error) {
      console.error("Follow-up scanner failed:", error);
    }
  };
  // Не грузим БД в момент старта инстанса (cold start / free tier).
  silenceTimer = setInterval(() => void tick(), 15 * 60 * 1000);
  setTimeout(() => void tick(), 60_000);
}
