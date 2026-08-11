import { query } from "../../db";

export type QueueConversation = {
  id: string;
  contact_name: string;
  phone: string | null;
  channel: string;
  status: string;
  priority: string | null;
  first_response_due_at: string | null;
  updated_at: string;
  sla_overdue: boolean;
};

export async function listUnassignedQueue(workspaceId: string): Promise<QueueConversation[]> {
  const rows = await query<{
    id: string;
    contact_name: string;
    phone: string | null;
    channel: string;
    status: string;
    priority: string | null;
    first_response_due_at: string | null;
    updated_at: string;
  }>(
    `SELECT c.id, ct.name AS contact_name, ct.phone, c.channel, c.status,
            c.priority, c.first_response_due_at, c.updated_at
     FROM conversations c
     JOIN contacts ct ON ct.id = c.contact_id
     WHERE c.workspace_id = $1
       AND c.status = 'open'
       AND c.assigned_manager_id IS NULL
     ORDER BY
       CASE WHEN c.first_response_due_at IS NOT NULL AND c.first_response_due_at < now() THEN 0 ELSE 1 END,
       c.first_response_due_at ASC NULLS LAST,
       c.updated_at DESC
     LIMIT 100`,
    [workspaceId]
  );

  return rows.map((row) => ({
    ...row,
    sla_overdue: Boolean(
      row.first_response_due_at && new Date(row.first_response_due_at).getTime() < Date.now()
    )
  }));
}
