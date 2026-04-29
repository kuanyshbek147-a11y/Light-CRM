import { Router } from "express";
import { AuthRequest } from "./auth";
import { query } from "./db";

export const dealsRouter = Router();

dealsRouter.get("/stages", async (req: AuthRequest, res) => {
  const rows = await query<{ id: string; name: string; position: number }>(
    `SELECT id, name, position
     FROM pipeline_stages
     WHERE workspace_id = $1
     ORDER BY position ASC, created_at ASC`,
    [req.user?.workspaceId]
  );
  res.json(rows);
});

dealsRouter.post("/stages", async (req: AuthRequest, res) => {
  const { name } = req.body as { name: string };
  const cleanName = (name || "").trim();
  if (!cleanName) {
    res.status(400).json({ error: "stage_name_required" });
    return;
  }

  const existing = await query<{ id: string }>(
    `SELECT id FROM pipeline_stages
     WHERE workspace_id = $1 AND lower(name) = lower($2)
     LIMIT 1`,
    [req.user?.workspaceId, cleanName]
  );
  if (existing[0]) {
    res.status(409).json({ error: "stage_already_exists" });
    return;
  }

  const inserted = await query<{ id: string; name: string; position: number }>(
    `INSERT INTO pipeline_stages (workspace_id, name, position)
     VALUES (
       $1,
       $2,
       COALESCE((SELECT MAX(position) + 10 FROM pipeline_stages WHERE workspace_id = $1), 10)
     )
     RETURNING id, name, position`,
    [req.user?.workspaceId, cleanName]
  );
  res.status(201).json(inserted[0]);
});

dealsRouter.patch("/stages/:id", async (req: AuthRequest, res) => {
  const { name } = req.body as { name: string };
  const cleanName = (name || "").trim();
  if (!cleanName) {
    res.status(400).json({ error: "stage_name_required" });
    return;
  }

  const currentRows = await query<{ name: string }>(
    `SELECT name FROM pipeline_stages WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
    [req.params.id, req.user?.workspaceId]
  );
  const current = currentRows[0];
  if (!current) {
    res.status(404).json({ error: "stage_not_found" });
    return;
  }
  if (current.name.toLowerCase() === cleanName.toLowerCase()) {
    res.json({ ok: true });
    return;
  }

  const duplicate = await query<{ id: string }>(
    `SELECT id FROM pipeline_stages
     WHERE workspace_id = $1 AND lower(name) = lower($2) AND id <> $3
     LIMIT 1`,
    [req.user?.workspaceId, cleanName, req.params.id]
  );
  if (duplicate[0]) {
    res.status(409).json({ error: "stage_already_exists" });
    return;
  }

  await query(
    `UPDATE pipeline_stages
     SET name = $1
     WHERE id = $2 AND workspace_id = $3`,
    [cleanName, req.params.id, req.user?.workspaceId]
  );
  await query(
    `UPDATE deals
     SET stage = $1, updated_at = now()
     WHERE workspace_id = $2 AND stage = $3`,
    [cleanName, req.user?.workspaceId, current.name]
  );

  const rows = await query<{ id: string; name: string; position: number }>(
    `SELECT id, name, position
     FROM pipeline_stages
     WHERE workspace_id = $1
     ORDER BY position ASC, created_at ASC`,
    [req.user?.workspaceId]
  );
  res.json(rows);
});

dealsRouter.patch("/stages/reorder", async (req: AuthRequest, res) => {
  const { orderedStageIds } = req.body as { orderedStageIds?: string[] };
  if (!Array.isArray(orderedStageIds) || !orderedStageIds.length) {
    res.status(400).json({ error: "ordered_stage_ids_required" });
    return;
  }

  const existing = await query<{ id: string }>(
    `SELECT id FROM pipeline_stages WHERE workspace_id = $1`,
    [req.user?.workspaceId]
  );
  const existingIds = new Set(existing.map((row) => row.id));
  const hasUnknown = orderedStageIds.some((id) => !existingIds.has(id));
  if (hasUnknown || orderedStageIds.length !== existingIds.size) {
    res.status(400).json({ error: "invalid_stage_order" });
    return;
  }

  for (let index = 0; index < orderedStageIds.length; index += 1) {
    await query(
      `UPDATE pipeline_stages
       SET position = $1
       WHERE id = $2 AND workspace_id = $3`,
      [(index + 1) * 10, orderedStageIds[index], req.user?.workspaceId]
    );
  }

  const rows = await query<{ id: string; name: string; position: number }>(
    `SELECT id, name, position
     FROM pipeline_stages
     WHERE workspace_id = $1
     ORDER BY position ASC, created_at ASC`,
    [req.user?.workspaceId]
  );
  res.json(rows);
});

dealsRouter.delete("/stages/:id", async (req: AuthRequest, res) => {
  const stageRows = await query<{ name: string }>(
    `SELECT name FROM pipeline_stages WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
    [req.params.id, req.user?.workspaceId]
  );
  const stage = stageRows[0];
  if (!stage) {
    res.status(404).json({ error: "stage_not_found" });
    return;
  }

  const usedInDeals = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM deals WHERE workspace_id = $1 AND stage = $2`,
    [req.user?.workspaceId, stage.name]
  );
  if (Number(usedInDeals[0]?.count || 0) > 0) {
    res.status(409).json({ error: "stage_in_use" });
    return;
  }

  await query(`DELETE FROM pipeline_stages WHERE id = $1 AND workspace_id = $2`, [req.params.id, req.user?.workspaceId]);
  res.status(204).send();
});

dealsRouter.get("/", async (req: AuthRequest, res) => {
  const rows = await query(
    `SELECT d.id, d.conversation_id, d.stage, d.amount, d.next_step_at,
            ct.name AS contact_name, u.full_name AS manager_name
     FROM deals d
     JOIN conversations c ON c.id = d.conversation_id
     JOIN contacts ct ON ct.id = c.contact_id
     LEFT JOIN users u ON u.id = d.owner_user_id
     WHERE d.workspace_id = $1
     ORDER BY d.updated_at DESC`,
    [req.user?.workspaceId]
  );

  res.json(rows);
});

dealsRouter.put("/conversation/:conversationId/stage", async (req: AuthRequest, res) => {
  const { stage } = req.body as { stage: string };
  const cleanStage = (stage || "").trim();
  if (!cleanStage) {
    res.status(400).json({ error: "stage_required" });
    return;
  }

  const rows = await query<{ id: string; conversation_id: string; stage: string; updated_at: string }>(
    `INSERT INTO deals (workspace_id, conversation_id, owner_user_id, stage, amount)
     SELECT $1, $2, $3, $4, 0
     WHERE EXISTS (
       SELECT 1
       FROM conversations c
       WHERE c.id = $2 AND c.workspace_id = $1
     )
     ON CONFLICT (conversation_id) DO UPDATE
     SET stage = EXCLUDED.stage,
         updated_at = now()
     RETURNING id, conversation_id, stage, updated_at`,
    [req.user?.workspaceId, req.params.conversationId, req.user?.id, cleanStage]
  );

  if (!rows[0]) {
    res.status(404).json({ error: "conversation_not_found" });
    return;
  }

  res.json(rows[0]);
});

dealsRouter.patch("/:id/stage", async (req: AuthRequest, res) => {
  const { stage } = req.body as { stage: string };

  const rows = await query(
    `UPDATE deals
     SET stage = $1, updated_at = now()
     WHERE id = $2 AND workspace_id = $3
     RETURNING id, stage, updated_at`,
    [stage, req.params.id, req.user?.workspaceId]
  );

  res.json(rows[0]);
});
