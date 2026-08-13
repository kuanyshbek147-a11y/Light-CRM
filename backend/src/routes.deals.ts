import { Router } from "express";
import { AuthRequest } from "./auth";
import { query } from "./db";
import {
  assertConversationContactFields,
  getContactRequiredFields,
  setContactRequiredFields
} from "./modules/contacts/required-fields";
import { maybeCreateStageFollowUp } from "./modules/follow-up";
import {
  inferOutcomeFromName,
  listPipelineStages,
  normalizeOutcome,
  stageExists
} from "./modules/pipeline/stages";

export const dealsRouter = Router();

dealsRouter.get("/stages", async (req: AuthRequest, res) => {
  res.json(await listPipelineStages(req.user?.workspaceId || ""));
});

dealsRouter.get("/contact-required-fields", async (req: AuthRequest, res) => {
  const fields = await getContactRequiredFields(req.user?.workspaceId || "");
  res.json({ fields });
});

dealsRouter.put("/contact-required-fields", async (req: AuthRequest, res) => {
  const fields = await setContactRequiredFields(
    req.user?.workspaceId || "",
    (req.body as { fields?: unknown }).fields
  );
  res.json({ fields });
});

dealsRouter.post("/stages", async (req: AuthRequest, res) => {
  const { name, outcome } = req.body as { name: string; outcome?: string };
  const cleanName = (name || "").trim();
  if (!cleanName) {
    res.status(400).json({ error: "stage_name_required" });
    return;
  }

  const workspaceId = req.user?.workspaceId || "";
  const existing = await query<{ id: string }>(
    `SELECT id FROM pipeline_stages
     WHERE workspace_id = $1 AND lower(name) = lower($2)
     LIMIT 1`,
    [workspaceId, cleanName]
  );
  if (existing[0]) {
    res.status(409).json({ error: "stage_already_exists" });
    return;
  }

  const nextOutcome = normalizeOutcome(outcome) || inferOutcomeFromName(cleanName);
  const inserted = await query<{
    id: string;
    name: string;
    position: number;
    outcome: string;
  }>(
    `INSERT INTO pipeline_stages (workspace_id, name, position, outcome)
     VALUES (
       $1,
       $2,
       COALESCE((SELECT MAX(position) + 10 FROM pipeline_stages WHERE workspace_id = $1), 10),
       $3
     )
     RETURNING id, name, position, outcome`,
    [workspaceId, cleanName, nextOutcome]
  );
  res.status(201).json(inserted[0]);
});

dealsRouter.patch("/stages/reorder", async (req: AuthRequest, res) => {
  const { orderedStageIds } = req.body as { orderedStageIds?: string[] };
  if (!Array.isArray(orderedStageIds) || !orderedStageIds.length) {
    res.status(400).json({ error: "ordered_stage_ids_required" });
    return;
  }

  const workspaceId = req.user?.workspaceId || "";
  const existing = await query<{ id: string }>(
    `SELECT id FROM pipeline_stages WHERE workspace_id = $1`,
    [workspaceId]
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
      [(index + 1) * 10, orderedStageIds[index], workspaceId]
    );
  }

  res.json(await listPipelineStages(workspaceId));
});

dealsRouter.patch("/stages/:id", async (req: AuthRequest, res) => {
  const { name, outcome } = req.body as { name?: string; outcome?: string };
  const workspaceId = req.user?.workspaceId || "";
  const hasName = name !== undefined;
  const hasOutcome = outcome !== undefined;
  if (!hasName && !hasOutcome) {
    res.status(400).json({ error: "nothing_to_update" });
    return;
  }

  const currentRows = await query<{ name: string; outcome: string }>(
    `SELECT name, outcome FROM pipeline_stages WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
    [req.params.id, workspaceId]
  );
  const current = currentRows[0];
  if (!current) {
    res.status(404).json({ error: "stage_not_found" });
    return;
  }

  const cleanName = hasName ? String(name || "").trim() : current.name;
  if (!cleanName) {
    res.status(400).json({ error: "stage_name_required" });
    return;
  }

  let nextOutcome = current.outcome;
  if (hasOutcome) {
    const normalized = normalizeOutcome(outcome);
    if (!normalized) {
      res.status(400).json({ error: "invalid_outcome" });
      return;
    }
    nextOutcome = normalized;
  }

  if (cleanName.toLowerCase() !== current.name.toLowerCase()) {
    const duplicate = await query<{ id: string }>(
      `SELECT id FROM pipeline_stages
       WHERE workspace_id = $1 AND lower(name) = lower($2) AND id <> $3
       LIMIT 1`,
      [workspaceId, cleanName, req.params.id]
    );
    if (duplicate[0]) {
      res.status(409).json({ error: "stage_already_exists" });
      return;
    }
  }

  await query(
    `UPDATE pipeline_stages
     SET name = $1, outcome = $2
     WHERE id = $3 AND workspace_id = $4`,
    [cleanName, nextOutcome, req.params.id, workspaceId]
  );

  if (cleanName !== current.name) {
    await query(
      `UPDATE deals
       SET stage = $1, updated_at = now()
       WHERE workspace_id = $2 AND stage = $3`,
      [cleanName, workspaceId, current.name]
    );
  }

  res.json(await listPipelineStages(workspaceId));
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

  await query(`DELETE FROM pipeline_stages WHERE id = $1 AND workspace_id = $2`, [
    req.params.id,
    req.user?.workspaceId
  ]);
  res.status(204).send();
});

dealsRouter.get("/", async (req: AuthRequest, res) => {
  const rows = await query(
    `SELECT d.id, d.conversation_id, d.stage, d.amount, d.next_step_at,
            ct.name AS contact_name, u.full_name AS manager_name, c.contact_id
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

async function ensureStageAndContactReady(
  workspaceId: string,
  conversationId: string,
  stage: string
): Promise<{ error?: string; missing?: string[] }> {
  if (!(await stageExists(workspaceId, stage))) {
    return { error: "stage_not_found" };
  }
  const check = await assertConversationContactFields(workspaceId, conversationId);
  if (!check.ok) {
    return { error: "contact_fields_required", missing: check.missing };
  }
  return {};
}

dealsRouter.put("/conversation/:conversationId/stage", async (req: AuthRequest, res) => {
  const { stage } = req.body as { stage: string };
  const cleanStage = (stage || "").trim();
  if (!cleanStage) {
    res.status(400).json({ error: "stage_required" });
    return;
  }

  const workspaceId = req.user?.workspaceId || "";
  const ready = await ensureStageAndContactReady(workspaceId, req.params.conversationId, cleanStage);
  if (ready.error) {
    res.status(ready.error === "stage_not_found" ? 404 : 400).json(ready);
    return;
  }

  const previous = await query<{ id: string; stage: string }>(
    `SELECT id, stage FROM deals WHERE conversation_id = $1 AND workspace_id = $2 LIMIT 1`,
    [req.params.conversationId, workspaceId]
  );

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
    [workspaceId, req.params.conversationId, req.user?.id, cleanStage]
  );

  if (!rows[0]) {
    res.status(404).json({ error: "conversation_not_found" });
    return;
  }

  await maybeCreateStageFollowUp({
    workspaceId,
    conversationId: rows[0].conversation_id,
    dealId: rows[0].id,
    stage: rows[0].stage,
    previousStage: previous[0]?.stage || null,
    ownerUserId: req.user?.id || null
  });

  res.json(rows[0]);
});

dealsRouter.patch("/:id/stage", async (req: AuthRequest, res) => {
  const { stage } = req.body as { stage: string };
  const cleanStage = (stage || "").trim();
  const workspaceId = req.user?.workspaceId || "";

  const previous = await query<{ stage: string; conversation_id: string }>(
    `SELECT stage, conversation_id FROM deals WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
    [req.params.id, workspaceId]
  );
  if (!previous[0]) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  if (cleanStage) {
    const ready = await ensureStageAndContactReady(
      workspaceId,
      previous[0].conversation_id,
      cleanStage
    );
    if (ready.error) {
      res.status(ready.error === "stage_not_found" ? 404 : 400).json(ready);
      return;
    }
  }

  const rows = await query<{ id: string; stage: string; conversation_id: string; updated_at: string }>(
    `UPDATE deals
     SET stage = $1, updated_at = now()
     WHERE id = $2 AND workspace_id = $3
     RETURNING id, stage, conversation_id, updated_at`,
    [cleanStage, req.params.id, workspaceId]
  );

  if (rows[0]) {
    await maybeCreateStageFollowUp({
      workspaceId,
      conversationId: rows[0].conversation_id,
      dealId: rows[0].id,
      stage: rows[0].stage,
      previousStage: previous[0]?.stage || null,
      ownerUserId: req.user?.id || null
    });
  }

  res.json(rows[0]);
});

dealsRouter.patch("/:id", async (req: AuthRequest, res) => {
  const { stage, amount, next_step_at } = req.body as {
    stage?: string;
    amount?: number | string;
    next_step_at?: string | null;
  };

  const workspaceId = req.user?.workspaceId || "";
  const previous = await query<{ stage: string; conversation_id: string }>(
    `SELECT stage, conversation_id FROM deals WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
    [req.params.id, workspaceId]
  );

  const cleanStage = stage !== undefined ? String(stage).trim() : undefined;
  if (cleanStage) {
    const ready = await ensureStageAndContactReady(
      workspaceId,
      previous[0]?.conversation_id || "",
      cleanStage
    );
    if (ready.error) {
      res.status(ready.error === "stage_not_found" ? 404 : 400).json(ready);
      return;
    }
  }

  let cleanAmount: number | undefined;
  if (amount !== undefined && amount !== null && amount !== "") {
    cleanAmount = Number(amount);
    if (Number.isNaN(cleanAmount) || cleanAmount < 0) {
      res.status(400).json({ error: "invalid_amount" });
      return;
    }
  }

  const nextStep =
    next_step_at === null
      ? null
      : next_step_at !== undefined && String(next_step_at).trim()
        ? String(next_step_at).trim()
        : undefined;

  const rows = await query<{
    id: string;
    conversation_id: string;
    stage: string;
    amount: string;
    next_step_at: string | null;
    updated_at: string;
  }>(
    `UPDATE deals
     SET stage = COALESCE(NULLIF($1, ''), stage),
         amount = COALESCE($2, amount),
         next_step_at = CASE
           WHEN $3::text = '__CLEAR__' THEN NULL
           WHEN NULLIF($3, '') IS NULL THEN next_step_at
           ELSE NULLIF($3, '')::timestamp
         END,
         updated_at = now()
     WHERE id = $4 AND workspace_id = $5
     RETURNING id, conversation_id, stage, amount, next_step_at, updated_at`,
    [
      cleanStage ?? "",
      cleanAmount ?? null,
      nextStep === null ? "__CLEAR__" : nextStep || "",
      req.params.id,
      workspaceId
    ]
  );

  if (!rows[0]) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  if (cleanStage) {
    await maybeCreateStageFollowUp({
      workspaceId,
      conversationId: rows[0].conversation_id,
      dealId: rows[0].id,
      stage: rows[0].stage,
      previousStage: previous[0]?.stage || null,
      ownerUserId: req.user?.id || null
    });
  }

  res.json(rows[0]);
});
