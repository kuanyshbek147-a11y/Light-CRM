import { query } from "../../db";

export const CONTACT_REQUIRED_FIELD_KEYS = [
  "city",
  "inquiry_reason",
  "client_type",
  "category"
] as const;

export type ContactRequiredFieldKey = (typeof CONTACT_REQUIRED_FIELD_KEYS)[number];

export type ContactFieldValues = {
  name?: string | null;
  phone?: string | null;
  city?: string | null;
  inquiry_reason?: string | null;
  client_type?: string | null;
  category?: string | null;
};

const SETTING_KEY = "contact_required_fields";

async function getSetting(workspaceId: string): Promise<string> {
  const rows = await query<{ value: string }>(
    `SELECT value FROM workspace_settings WHERE workspace_id = $1 AND key = $2 LIMIT 1`,
    [workspaceId, SETTING_KEY]
  );
  return rows[0]?.value || "[]";
}

async function setSetting(workspaceId: string, value: string): Promise<void> {
  await query(
    `INSERT INTO workspace_settings (workspace_id, key, value)
     VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [workspaceId, SETTING_KEY, value]
  );
}

export function normalizeRequiredFields(input: unknown): ContactRequiredFieldKey[] {
  const allowed = new Set<string>(CONTACT_REQUIRED_FIELD_KEYS);
  const source = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? (() => {
          try {
            return JSON.parse(input) as unknown;
          } catch {
            return [];
          }
        })()
      : [];
  if (!Array.isArray(source)) {
    return [];
  }
  const unique = new Set<ContactRequiredFieldKey>();
  for (const item of source) {
    const key = String(item || "").trim();
    if (allowed.has(key)) {
      unique.add(key as ContactRequiredFieldKey);
    }
  }
  return CONTACT_REQUIRED_FIELD_KEYS.filter((key) => unique.has(key));
}

export async function getContactRequiredFields(workspaceId: string): Promise<ContactRequiredFieldKey[]> {
  return normalizeRequiredFields(await getSetting(workspaceId));
}

export async function setContactRequiredFields(
  workspaceId: string,
  fields: unknown
): Promise<ContactRequiredFieldKey[]> {
  const next = normalizeRequiredFields(fields);
  await setSetting(workspaceId, JSON.stringify(next));
  return next;
}

export function findMissingContactFields(
  values: ContactFieldValues,
  required: ContactRequiredFieldKey[]
): string[] {
  const missing: string[] = [];
  if (!String(values.name || "").trim()) {
    missing.push("name");
  }
  if (!String(values.phone || "").trim()) {
    missing.push("phone");
  }
  for (const key of required) {
    if (!String(values[key] || "").trim()) {
      missing.push(key);
    }
  }
  return missing;
}

export async function assertConversationContactFields(
  workspaceId: string,
  conversationId: string
): Promise<{ ok: true } | { ok: false; missing: string[] }> {
  const required = await getContactRequiredFields(workspaceId);
  const rows = await query<ContactFieldValues>(
    `SELECT ct.name, ct.phone, ct.city, ct.inquiry_reason, ct.client_type, ct.category
     FROM conversations c
     JOIN contacts ct ON ct.id = c.contact_id
     WHERE c.id = $1 AND c.workspace_id = $2
     LIMIT 1`,
    [conversationId, workspaceId]
  );
  if (!rows[0]) {
    return { ok: false, missing: ["name", "phone"] };
  }
  const missing = findMissingContactFields(rows[0], required);
  if (missing.length) {
    return { ok: false, missing };
  }
  return { ok: true };
}
