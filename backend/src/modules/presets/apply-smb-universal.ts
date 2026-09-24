import { query } from "../../db";
import { setContactRequiredFields } from "../contacts/required-fields";
import { createLandingPage } from "../marketing/landings";
import type { StageOutcome } from "../pipeline/stages";
import {
  SMB_UNIVERSAL_LANDING,
  SMB_UNIVERSAL_PRESET_ID,
  SMB_UNIVERSAL_SCRIPTS,
  SMB_UNIVERSAL_STAGES
} from "./smb-universal";

async function upsertStage(
  workspaceId: string,
  stage: { name: string; position: number; outcome: StageOutcome }
): Promise<void> {
  const existing = await query<{ id: string }>(
    `SELECT id FROM pipeline_stages
     WHERE workspace_id = $1 AND lower(name) = lower($2)
     LIMIT 1`,
    [workspaceId, stage.name]
  );
  if (existing[0]) {
    await query(
      `UPDATE pipeline_stages
       SET name = $3, position = $4, outcome = $5
       WHERE id = $1 AND workspace_id = $2`,
      [existing[0].id, workspaceId, stage.name, stage.position, stage.outcome]
    );
    return;
  }
  await query(
    `INSERT INTO pipeline_stages (workspace_id, name, position, outcome)
     VALUES ($1, $2, $3, $4)`,
    [workspaceId, stage.name, stage.position, stage.outcome]
  );
}

async function upsertScripts(workspaceId: string, userId: string | null): Promise<number> {
  let created = 0;
  for (const script of SMB_UNIVERSAL_SCRIPTS) {
    const existing = await query<{ id: string }>(
      `SELECT id FROM message_scripts
       WHERE workspace_id = $1 AND title = $2
       LIMIT 1`,
      [workspaceId, script.title]
    );
    if (existing[0]) {
      await query(
        `UPDATE message_scripts
         SET category = $3, body = $4
         WHERE id = $1 AND workspace_id = $2`,
        [existing[0].id, workspaceId, script.category, script.body]
      );
      continue;
    }
    await query(
      `INSERT INTO message_scripts (workspace_id, title, category, body, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [workspaceId, script.title, script.category, script.body, userId]
    );
    created += 1;
  }
  return created;
}

async function ensureLanding(
  workspaceId: string,
  userId: string | null
): Promise<{ created: boolean; landingId: string | null }> {
  const existing = await query<{ id: string }>(
    `SELECT id FROM marketing_landing_pages
     WHERE workspace_id = $1 AND title = $2
     LIMIT 1`,
    [workspaceId, SMB_UNIVERSAL_LANDING.title]
  );
  if (existing[0]) {
    return { created: false, landingId: existing[0].id };
  }
  const created = await createLandingPage(workspaceId, userId, {
    ...SMB_UNIVERSAL_LANDING,
    status: "draft"
  });
  if ("error" in created) {
    return { created: false, landingId: null };
  }
  return { created: true, landingId: created.id };
}

export async function applySmbUniversalPreset(input: {
  workspaceId: string;
  userId?: string | null;
  createLanding?: boolean;
}): Promise<{
  presetId: typeof SMB_UNIVERSAL_PRESET_ID;
  stagesUpserted: number;
  scriptsCreated: number;
  requiredFields: string[];
  landingCreated: boolean;
  landingId: string | null;
}> {
  const workspaceId = input.workspaceId;
  const userId = input.userId ?? null;

  for (const stage of SMB_UNIVERSAL_STAGES) {
    await upsertStage(workspaceId, stage);
  }
  const scriptsCreated = await upsertScripts(workspaceId, userId);
  const requiredFields = await setContactRequiredFields(workspaceId, []);

  let landingCreated = false;
  let landingId: string | null = null;
  if (input.createLanding !== false) {
    const landing = await ensureLanding(workspaceId, userId);
    landingCreated = landing.created;
    landingId = landing.landingId;
  }

  return {
    presetId: SMB_UNIVERSAL_PRESET_ID,
    stagesUpserted: SMB_UNIVERSAL_STAGES.length,
    scriptsCreated,
    requiredFields,
    landingCreated,
    landingId
  };
}
