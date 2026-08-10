import { Router } from "express";
import { AuthRequest } from "./auth";
import { query } from "./db";

export const searchRouter = Router();

searchRouter.get("/", async (req: AuthRequest, res) => {
  const q = String((req.query.q as string) || "").trim();
  if (q.length < 2) {
    res.json({ conversations: [], contacts: [], deals: [], tasks: [] });
    return;
  }
  const needle = `%${q.toLowerCase()}%`;
  const workspaceId = req.user?.workspaceId;

  const [conversations, contacts, deals, tasks] = await Promise.all([
    query<{
      id: string;
      contact_name: string;
      phone: string | null;
      channel: string;
      status: string;
    }>(
      `SELECT c.id, ct.name AS contact_name, ct.phone, c.channel, c.status
       FROM conversations c
       JOIN contacts ct ON ct.id = c.contact_id
       WHERE c.workspace_id = $1
         AND (lower(ct.name) LIKE $2 OR lower(COALESCE(ct.phone, '')) LIKE $2 OR lower(c.channel) LIKE $2)
       ORDER BY c.updated_at DESC
       LIMIT 12`,
      [workspaceId, needle]
    ),
    query<{ id: string; name: string; phone: string; city: string | null }>(
      `SELECT id, name, phone, city
       FROM contacts
       WHERE workspace_id = $1
         AND (lower(name) LIKE $2 OR lower(COALESCE(phone, '')) LIKE $2 OR lower(COALESCE(city, '')) LIKE $2)
       ORDER BY created_at DESC
       LIMIT 12`,
      [workspaceId, needle]
    ),
    query<{
      id: string;
      conversation_id: string;
      stage: string;
      amount: string;
      contact_name: string;
    }>(
      `SELECT d.id, d.conversation_id, d.stage, d.amount::text, ct.name AS contact_name
       FROM deals d
       JOIN conversations c ON c.id = d.conversation_id
       JOIN contacts ct ON ct.id = c.contact_id
       WHERE d.workspace_id = $1
         AND (lower(ct.name) LIKE $2 OR lower(d.stage) LIKE $2 OR d.amount::text LIKE $2)
       ORDER BY d.updated_at DESC
       LIMIT 12`,
      [workspaceId, needle]
    ),
    query<{
      id: string;
      title: string;
      status: string;
      due_at: string | null;
      conversation_id: string | null;
      contact_name: string | null;
    }>(
      `SELECT t.id, t.title, t.status, t.due_at, t.conversation_id, ct.name AS contact_name
       FROM tasks t
       LEFT JOIN conversations c ON c.id = t.conversation_id
       LEFT JOIN contacts ct ON ct.id = c.contact_id
       WHERE t.workspace_id = $1
         AND (lower(t.title) LIKE $2 OR lower(COALESCE(ct.name, '')) LIKE $2)
       ORDER BY t.updated_at DESC
       LIMIT 12`,
      [workspaceId, needle]
    )
  ]);

  res.json({ conversations, contacts, deals, tasks });
});
