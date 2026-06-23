import { pool, query } from "./db";

type ManagerRow = { user_id: string };
type LoadManagerRow = { user_id: string };

export type AutoAssignmentStrategy = "round_robin" | "least_open_load";

const AUTO_ASSIGNMENT_STRATEGY = normalizeStrategy(process.env.AUTO_ASSIGNMENT_STRATEGY);

export async function resolveAutoAssignedManager(workspaceId: string): Promise<string | null> {
  const strategy = await getAutoAssignmentStrategy(workspaceId);
  if (strategy === "least_open_load") {
    return resolveLeastOpenLoadManager(workspaceId);
  }

  return resolveRoundRobinManager(workspaceId);
}

export async function getAutoAssignmentStrategy(workspaceId: string): Promise<AutoAssignmentStrategy> {
  const settings = await query<{ value: string }>(
    `SELECT value
     FROM workspace_settings
     WHERE workspace_id = $1 AND key = 'auto_assignment_strategy'
     LIMIT 1`,
    [workspaceId]
  );
  if (settings[0]?.value) {
    return normalizeStrategy(settings[0].value);
  }
  return AUTO_ASSIGNMENT_STRATEGY;
}

export async function setAutoAssignmentStrategy(
  workspaceId: string,
  strategy: AutoAssignmentStrategy
): Promise<void> {
  await query(
    `INSERT INTO workspace_settings (workspace_id, key, value)
     VALUES ($1, 'auto_assignment_strategy', $2)
     ON CONFLICT (workspace_id, key)
     DO UPDATE SET value = EXCLUDED.value`,
    [workspaceId, strategy]
  );
}

async function resolveRoundRobinManager(workspaceId: string): Promise<string | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const managersResult = await client.query<ManagerRow>(
      `SELECT m.user_id
       FROM managers m
       JOIN users u ON u.id = m.user_id
       WHERE m.workspace_id = $1
         AND m.is_active = true
         AND u.workspace_id = $1
         AND u.role = 'manager'
         AND u.is_active = true
       ORDER BY COALESCE(m.last_assigned_at, to_timestamp(0)) ASC, m.created_at ASC, m.user_id ASC
       LIMIT 1
       FOR UPDATE`,
      [workspaceId]
    );

    const managerId = managersResult.rows[0]?.user_id || null;
    if (managerId) {
      await client.query(
        `UPDATE managers
         SET last_assigned_at = now()
         WHERE workspace_id = $1 AND user_id = $2`,
        [workspaceId, managerId]
      );
      await client.query("COMMIT");
      return managerId;
    }

    await client.query("ROLLBACK");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const fallbackManagers = await query<{ id: string }>(
    `SELECT id
     FROM users
     WHERE workspace_id = $1
       AND role = 'manager'
       AND is_active = true
     ORDER BY created_at ASC NULLS LAST, id ASC
     LIMIT 1`,
    [workspaceId]
  );
  return fallbackManagers[0]?.id || null;
}

async function resolveLeastOpenLoadManager(workspaceId: string): Promise<string | null> {
  const managers = await query<LoadManagerRow>(
    `SELECT
       m.user_id,
       COUNT(c.id)::text AS open_conversations
     FROM managers m
     JOIN users u ON u.id = m.user_id
     LEFT JOIN conversations c
       ON c.workspace_id = m.workspace_id
      AND c.assigned_manager_id = m.user_id
      AND c.status = 'open'
     WHERE m.workspace_id = $1
       AND m.is_active = true
       AND u.workspace_id = $1
       AND u.role = 'manager'
       AND u.is_active = true
     GROUP BY m.user_id, m.created_at
     ORDER BY COUNT(c.id) ASC, m.created_at ASC, m.user_id ASC
     LIMIT 1`,
    [workspaceId]
  );

  if (managers[0]?.user_id) {
    return managers[0].user_id;
  }

  const fallbackManagers = await query<{ id: string }>(
    `SELECT id
     FROM users
     WHERE workspace_id = $1
       AND role = 'manager'
       AND is_active = true
     ORDER BY created_at ASC NULLS LAST, id ASC
     LIMIT 1`,
    [workspaceId]
  );
  return fallbackManagers[0]?.id || null;
}

export function normalizeStrategy(value: string | undefined): AutoAssignmentStrategy {
  if (value === "least_open_load") {
    return "least_open_load";
  }
  return "round_robin";
}
