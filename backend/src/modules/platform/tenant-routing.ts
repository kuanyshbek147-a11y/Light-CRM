import { query } from "../../db";

/**
 * Legacy single-tenant fallbacks (env tokens → first workspace) are only safe
 * when there is exactly one workspace, or when ALLOW_LEGACY_CHANNEL_FALLBACK=1.
 */
export function isLegacyChannelFallbackForced(): boolean {
  const raw = (process.env.ALLOW_LEGACY_CHANNEL_FALLBACK || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

export async function countWorkspaces(): Promise<number> {
  const rows = await query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM workspaces`);
  return Number(rows[0]?.count || 0);
}

export async function getOldestWorkspaceId(): Promise<string | null> {
  const rows = await query<{ id: string }>(`SELECT id FROM workspaces ORDER BY id ASC LIMIT 1`);
  return rows[0]?.id ?? null;
}

/** True when env/global channel credentials may still bind to a default workspace. */
export async function allowLegacyChannelFallback(): Promise<boolean> {
  if (isLegacyChannelFallbackForced()) {
    return true;
  }
  return (await countWorkspaces()) <= 1;
}

/**
 * Resolve default workspace for unmatched/legacy channel events.
 * Returns null when multiple tenants exist and legacy fallback is disabled —
 * callers must drop the event instead of routing to the wrong company.
 */
export async function resolveLegacyDefaultWorkspaceId(reason: string): Promise<string | null> {
  if (!(await allowLegacyChannelFallback())) {
    console.warn(`[tenant] drop channel event: no workspace match (${reason}); multi-tenant safe mode`);
    return null;
  }
  const workspaceId = await getOldestWorkspaceId();
  if (!workspaceId) {
    return null;
  }
  if ((await countWorkspaces()) > 1) {
    console.warn(`[tenant] legacy channel fallback → workspace ${workspaceId} (${reason})`);
  }
  return workspaceId;
}
