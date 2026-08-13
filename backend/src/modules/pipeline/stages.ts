import { query } from "../../db";

export type StageOutcome = "open" | "won" | "lost";

export type PipelineStageRow = {
  id: string;
  name: string;
  position: number;
  outcome: StageOutcome;
};

export function normalizeOutcome(value: unknown): StageOutcome | null {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (raw === "open" || raw === "won" || raw === "lost") {
    return raw;
  }
  return null;
}

export function inferOutcomeFromName(name: string): StageOutcome {
  const s = name.trim().toLowerCase();
  if (
    s === "won" ||
    s === "выиграно" ||
    s === "успех" ||
    s === "closed" ||
    s.includes("won") ||
    s.includes("выиг") ||
    s.includes("успех")
  ) {
    return "won";
  }
  if (
    s === "lost" ||
    s === "проиграно" ||
    s === "отказ" ||
    s.includes("lost") ||
    s.includes("проиг") ||
    s.includes("отказ")
  ) {
    return "lost";
  }
  return "open";
}

export async function listPipelineStages(workspaceId: string): Promise<PipelineStageRow[]> {
  return query<PipelineStageRow>(
    `SELECT id, name, position, outcome
     FROM pipeline_stages
     WHERE workspace_id = $1
     ORDER BY position ASC, created_at ASC`,
    [workspaceId]
  );
}

export async function getStageOutcome(workspaceId: string, stageName: string): Promise<StageOutcome> {
  const clean = String(stageName || "").trim();
  if (!clean) {
    return "open";
  }
  const rows = await query<{ outcome: StageOutcome }>(
    `SELECT outcome
     FROM pipeline_stages
     WHERE workspace_id = $1 AND lower(name) = lower($2)
     LIMIT 1`,
    [workspaceId, clean]
  );
  if (rows[0]?.outcome) {
    return rows[0].outcome;
  }
  return inferOutcomeFromName(clean);
}

export async function isClosedStage(workspaceId: string, stageName: string): Promise<boolean> {
  const outcome = await getStageOutcome(workspaceId, stageName);
  return outcome === "won" || outcome === "lost";
}

export async function listClosedStageNames(workspaceId: string): Promise<Set<string>> {
  const rows = await query<{ name: string }>(
    `SELECT name
     FROM pipeline_stages
     WHERE workspace_id = $1 AND outcome IN ('won', 'lost')`,
    [workspaceId]
  );
  return new Set(rows.map((row) => row.name.trim().toLowerCase()));
}

export async function stageExists(workspaceId: string, stageName: string): Promise<boolean> {
  const clean = String(stageName || "").trim();
  if (!clean) {
    return false;
  }
  const rows = await query<{ id: string }>(
    `SELECT id FROM pipeline_stages
     WHERE workspace_id = $1 AND lower(name) = lower($2)
     LIMIT 1`,
    [workspaceId, clean]
  );
  return Boolean(rows[0]);
}
