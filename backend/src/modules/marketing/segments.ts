import { query } from "../../db";

export type SegmentFilter = {
  city?: string;
  client_type?: string;
  category?: string;
  channel?: string;
  deal_stage?: string;
};

export type SegmentContact = {
  id: string;
  name: string;
  phone: string | null;
  city: string | null;
  client_type: string | null;
  category: string | null;
  channel: string | null;
  external_id: string | null;
};

export type MarketingSegment = {
  id: string;
  name: string;
  filter_json: SegmentFilter;
  created_at: string;
  updated_at: string;
  contact_count?: number;
};

function cleanFilter(input: unknown): SegmentFilter {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const next: SegmentFilter = {};
  for (const key of ["city", "client_type", "category", "channel", "deal_stage"] as const) {
    const value = String(raw[key] ?? "").trim();
    if (value) {
      next[key] = value;
    }
  }
  return next;
}

export function normalizeSegmentFilter(input: unknown): SegmentFilter {
  return cleanFilter(input);
}

export async function listSegments(workspaceId: string): Promise<MarketingSegment[]> {
  const rows = await query<{
    id: string;
    name: string;
    filter_json: SegmentFilter;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT id, name, filter_json, created_at, updated_at
     FROM marketing_segments
     WHERE workspace_id = $1
     ORDER BY created_at DESC`,
    [workspaceId]
  );

  const withCounts: MarketingSegment[] = [];
  for (const row of rows) {
    const contacts = await resolveSegmentContacts(workspaceId, row.filter_json || {});
    withCounts.push({
      ...row,
      filter_json: row.filter_json || {},
      contact_count: contacts.length
    });
  }
  return withCounts;
}

export async function createSegment(input: {
  workspaceId: string;
  userId: string;
  name: string;
  filter: unknown;
}): Promise<MarketingSegment> {
  const name = input.name.trim();
  const filter = cleanFilter(input.filter);
  const rows = await query<MarketingSegment>(
    `INSERT INTO marketing_segments (workspace_id, name, filter_json, created_by_user_id)
     VALUES ($1, $2, $3::jsonb, $4)
     RETURNING id, name, filter_json, created_at, updated_at`,
    [input.workspaceId, name, JSON.stringify(filter), input.userId]
  );
  const segment = rows[0];
  const contacts = await resolveSegmentContacts(input.workspaceId, filter);
  return { ...segment, contact_count: contacts.length };
}

export async function updateSegment(input: {
  workspaceId: string;
  segmentId: string;
  name?: string;
  filter?: unknown;
}): Promise<MarketingSegment | null> {
  const existing = await query<{ id: string }>(
    `SELECT id FROM marketing_segments WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
    [input.segmentId, input.workspaceId]
  );
  if (!existing[0]) {
    return null;
  }

  const name = input.name !== undefined ? input.name.trim() : undefined;
  const filter = input.filter !== undefined ? cleanFilter(input.filter) : undefined;

  const rows = await query<MarketingSegment>(
    `UPDATE marketing_segments
     SET name = COALESCE(NULLIF($1, ''), name),
         filter_json = COALESCE($2::jsonb, filter_json),
         updated_at = now()
     WHERE id = $3 AND workspace_id = $4
     RETURNING id, name, filter_json, created_at, updated_at`,
    [
      name ?? "",
      filter ? JSON.stringify(filter) : null,
      input.segmentId,
      input.workspaceId
    ]
  );
  const segment = rows[0];
  if (!segment) {
    return null;
  }
  const contacts = await resolveSegmentContacts(input.workspaceId, segment.filter_json || {});
  return { ...segment, contact_count: contacts.length };
}

export async function deleteSegment(workspaceId: string, segmentId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `DELETE FROM marketing_segments
     WHERE id = $1 AND workspace_id = $2
     RETURNING id`,
    [segmentId, workspaceId]
  );
  return Boolean(rows[0]);
}

export async function getSegment(
  workspaceId: string,
  segmentId: string
): Promise<MarketingSegment | null> {
  const rows = await query<MarketingSegment>(
    `SELECT id, name, filter_json, created_at, updated_at
     FROM marketing_segments
     WHERE id = $1 AND workspace_id = $2
     LIMIT 1`,
    [segmentId, workspaceId]
  );
  const segment = rows[0];
  if (!segment) {
    return null;
  }
  const contacts = await resolveSegmentContacts(workspaceId, segment.filter_json || {});
  return { ...segment, contact_count: contacts.length };
}

export async function resolveSegmentContacts(
  workspaceId: string,
  filterInput: unknown,
  limit = 2000
): Promise<SegmentContact[]> {
  const filter = cleanFilter(filterInput);
  const params: unknown[] = [workspaceId];
  const conditions: string[] = ["ct.workspace_id = $1", "COALESCE(ct.is_group, false) = false"];

  if (filter.city) {
    params.push(filter.city.toLowerCase());
    conditions.push(`LOWER(TRIM(COALESCE(ct.city, ''))) = $${params.length}`);
  }
  if (filter.client_type) {
    params.push(filter.client_type.toLowerCase());
    conditions.push(`LOWER(TRIM(COALESCE(ct.client_type, ''))) = $${params.length}`);
  }
  if (filter.category) {
    params.push(filter.category.toLowerCase());
    conditions.push(`LOWER(TRIM(COALESCE(ct.category, ''))) = $${params.length}`);
  }
  if (filter.channel) {
    params.push(filter.channel.toLowerCase());
    conditions.push(`LOWER(TRIM(COALESCE(ct.channel, ''))) = $${params.length}`);
  }

  let joinDeal = "";
  if (filter.deal_stage) {
    params.push(filter.deal_stage.toLowerCase());
    joinDeal = `
      INNER JOIN conversations c ON c.contact_id = ct.id AND c.workspace_id = ct.workspace_id
      INNER JOIN deals d ON d.conversation_id = c.id AND d.workspace_id = ct.workspace_id
    `;
    conditions.push(`LOWER(TRIM(COALESCE(d.stage, ''))) = $${params.length}`);
  }

  params.push(limit);
  return query<SegmentContact>(
    `SELECT DISTINCT ON (ct.id)
            ct.id, ct.name, ct.phone, ct.city, ct.client_type, ct.category, ct.channel, ct.external_id
     FROM contacts ct
     ${joinDeal}
     WHERE ${conditions.join(" AND ")}
     ORDER BY ct.id, ct.name ASC
     LIMIT $${params.length}`,
    params
  );
}
