import { query } from "../../db";
import { getRealtimeServer } from "../../realtime";

export type StaffMember = {
  id: string;
  full_name: string;
  role: string;
  color: string | null;
};

export type StaffMessage = {
  id: string;
  thread_id: string;
  workspace_id: string;
  author_user_id: string | null;
  author_name: string | null;
  author_color: string | null;
  body: string;
  task_id: string | null;
  conversation_id: string | null;
  is_system: boolean;
  created_at: string;
};

export type StaffThread = {
  id: string;
  workspace_id: string;
  kind: "channel" | "dm";
  title: string;
  dm_key: string | null;
  updated_at: string;
  created_at: string;
  last_message_body: string | null;
  last_message_at: string | null;
  unread_count: number;
  peer_user_id?: string | null;
  peer_name?: string | null;
};

function dmKeyFor(userA: string, userB: string): string {
  return [userA, userB].sort().join(":");
}

function emitStaffMessage(workspaceId: string, threadId: string, message: StaffMessage): void {
  getRealtimeServer()?.emit("staff:message", {
    workspaceId,
    threadId,
    message
  });
}

export async function listStaffMembers(workspaceId: string): Promise<StaffMember[]> {
  return query<StaffMember>(
    `SELECT id, full_name, role, color
     FROM users
     WHERE workspace_id = $1
       AND is_active = true
       AND role IN ('admin', 'manager', 'marketer')
     ORDER BY full_name ASC`,
    [workspaceId]
  );
}

async function ensureMember(threadId: string, userId: string): Promise<void> {
  await query(
    `INSERT INTO staff_thread_members (thread_id, user_id, last_read_at)
     VALUES ($1, $2, NULL)
     ON CONFLICT (thread_id, user_id) DO NOTHING`,
    [threadId, userId]
  );
}

async function syncChannelMembers(workspaceId: string, threadId: string): Promise<void> {
  const members = await listStaffMembers(workspaceId);
  for (const member of members) {
    await ensureMember(threadId, member.id);
  }
}

export async function ensureTeamChannel(workspaceId: string): Promise<{ id: string }> {
  const existing = await query<{ id: string }>(
    `SELECT id
     FROM staff_threads
     WHERE workspace_id = $1 AND kind = 'channel'
     LIMIT 1`,
    [workspaceId]
  );

  let threadId = existing[0]?.id;
  if (!threadId) {
    try {
      const inserted = await query<{ id: string }>(
        `INSERT INTO staff_threads (workspace_id, kind, title)
         VALUES ($1, 'channel', 'Команда')
         RETURNING id`,
        [workspaceId]
      );
      threadId = inserted[0].id;
    } catch {
      const again = await query<{ id: string }>(
        `SELECT id FROM staff_threads WHERE workspace_id = $1 AND kind = 'channel' LIMIT 1`,
        [workspaceId]
      );
      threadId = again[0]?.id;
    }
  }

  if (!threadId) {
    throw new Error("staff_channel_unavailable");
  }

  await syncChannelMembers(workspaceId, threadId);
  return { id: threadId };
}

export async function listStaffThreads(workspaceId: string, userId: string): Promise<StaffThread[]> {
  const channel = await ensureTeamChannel(workspaceId);
  await ensureMember(channel.id, userId);

  const rows = await query<StaffThread & { peer_user_id: string | null; peer_name: string | null }>(
    `SELECT t.id, t.workspace_id, t.kind, t.title, t.dm_key,
            t.updated_at::text, t.created_at::text,
            lm.body AS last_message_body,
            lm.created_at::text AS last_message_at,
            COALESCE(unread.cnt, 0)::int AS unread_count,
            peer.user_id AS peer_user_id,
            peer_user.full_name AS peer_name
     FROM staff_threads t
     INNER JOIN staff_thread_members m
       ON m.thread_id = t.id AND m.user_id = $2
     LEFT JOIN LATERAL (
       SELECT body, created_at
       FROM staff_messages
       WHERE thread_id = t.id
       ORDER BY created_at DESC
       LIMIT 1
     ) lm ON true
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS cnt
       FROM staff_messages sm
       WHERE sm.thread_id = t.id
         AND sm.created_at > COALESCE(m.last_read_at, '1970-01-01'::timestamp)
         AND (sm.author_user_id IS NULL OR sm.author_user_id <> $2)
     ) unread ON true
     LEFT JOIN LATERAL (
       SELECT stm.user_id
       FROM staff_thread_members stm
       WHERE stm.thread_id = t.id AND stm.user_id <> $2
       LIMIT 1
     ) peer ON t.kind = 'dm'
     LEFT JOIN users peer_user ON peer_user.id = peer.user_id
     WHERE t.workspace_id = $1
     ORDER BY COALESCE(lm.created_at, t.updated_at) DESC`,
    [workspaceId, userId]
  );

  return rows.map((row) => ({
    ...row,
    title:
      row.kind === "dm"
        ? row.peer_name || "Личный чат"
        : row.title || "Команда",
    unread_count: Number(row.unread_count || 0)
  }));
}

export async function openOrCreateDm(
  workspaceId: string,
  currentUserId: string,
  peerUserId: string
): Promise<StaffThread | { error: string }> {
  if (!peerUserId || peerUserId === currentUserId) {
    return { error: "invalid_peer" };
  }

  const peers = await query<{ id: string; full_name: string }>(
    `SELECT id, full_name FROM users
     WHERE id = $1 AND workspace_id = $2 AND is_active = true
       AND role IN ('admin', 'manager', 'marketer')
     LIMIT 1`,
    [peerUserId, workspaceId]
  );
  if (!peers[0]) {
    return { error: "peer_not_found" };
  }

  const key = dmKeyFor(currentUserId, peerUserId);
  const existing = await query<{ id: string }>(
    `SELECT id FROM staff_threads
     WHERE workspace_id = $1 AND kind = 'dm' AND dm_key = $2
     LIMIT 1`,
    [workspaceId, key]
  );

  let threadId = existing[0]?.id;
  if (!threadId) {
    const inserted = await query<{ id: string }>(
      `INSERT INTO staff_threads (workspace_id, kind, title, dm_key)
       VALUES ($1, 'dm', $2, $3)
       RETURNING id`,
      [workspaceId, peers[0].full_name, key]
    );
    threadId = inserted[0].id;
  }

  await ensureMember(threadId, currentUserId);
  await ensureMember(threadId, peerUserId);

  const threads = await listStaffThreads(workspaceId, currentUserId);
  const found = threads.find((t) => t.id === threadId);
  if (!found) {
    return { error: "thread_not_found" };
  }
  return found;
}

async function assertThreadMember(
  workspaceId: string,
  threadId: string,
  userId: string
): Promise<boolean> {
  const rows = await query<{ thread_id: string }>(
    `SELECT m.thread_id
     FROM staff_thread_members m
     JOIN staff_threads t ON t.id = m.thread_id
     WHERE m.thread_id = $1 AND m.user_id = $2 AND t.workspace_id = $3
     LIMIT 1`,
    [threadId, userId, workspaceId]
  );
  return Boolean(rows[0]);
}

export async function listStaffMessages(
  workspaceId: string,
  threadId: string,
  userId: string,
  limit = 100
): Promise<StaffMessage[] | { error: string }> {
  if (!(await assertThreadMember(workspaceId, threadId, userId))) {
    return { error: "forbidden" };
  }

  const rows = await query<StaffMessage>(
    `SELECT sm.id, sm.thread_id, sm.workspace_id, sm.author_user_id,
            u.full_name AS author_name, u.color AS author_color,
            sm.body, sm.task_id, sm.conversation_id, sm.is_system,
            sm.created_at::text
     FROM staff_messages sm
     LEFT JOIN users u ON u.id = sm.author_user_id
     WHERE sm.thread_id = $1 AND sm.workspace_id = $2
     ORDER BY sm.created_at ASC
     LIMIT $3`,
    [threadId, workspaceId, Math.min(Math.max(limit, 1), 300)]
  );
  return rows;
}

export async function postStaffMessage(input: {
  workspaceId: string;
  threadId: string;
  authorUserId: string;
  body: string;
  conversationId?: string | null;
  taskId?: string | null;
  isSystem?: boolean;
}): Promise<StaffMessage | { error: string }> {
  const body = String(input.body || "").trim();
  if (!body) {
    return { error: "empty_body" };
  }
  if (!(await assertThreadMember(input.workspaceId, input.threadId, input.authorUserId))) {
    return { error: "forbidden" };
  }

  let conversationId: string | null = null;
  if (input.conversationId) {
    const conv = await query<{ id: string }>(
      `SELECT id FROM conversations WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
      [input.conversationId, input.workspaceId]
    );
    if (!conv[0]) {
      return { error: "conversation_not_found" };
    }
    conversationId = conv[0].id;
  }

  const inserted = await query<StaffMessage>(
    `INSERT INTO staff_messages
       (thread_id, workspace_id, author_user_id, body, task_id, conversation_id, is_system)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, thread_id, workspace_id, author_user_id, body, task_id, conversation_id,
               is_system, created_at::text`,
    [
      input.threadId,
      input.workspaceId,
      input.isSystem ? input.authorUserId : input.authorUserId,
      body.slice(0, 4000),
      input.taskId || null,
      conversationId,
      Boolean(input.isSystem)
    ]
  );

  const author = await query<{ full_name: string; color: string | null }>(
    `SELECT full_name, color FROM users WHERE id = $1 LIMIT 1`,
    [input.authorUserId]
  );

  const message: StaffMessage = {
    ...inserted[0],
    author_name: author[0]?.full_name || null,
    author_color: author[0]?.color || null
  };

  await query(`UPDATE staff_threads SET updated_at = now() WHERE id = $1`, [input.threadId]);
  await query(
    `UPDATE staff_thread_members SET last_read_at = now()
     WHERE thread_id = $1 AND user_id = $2`,
    [input.threadId, input.authorUserId]
  );

  emitStaffMessage(input.workspaceId, input.threadId, message);
  return message;
}

export async function markThreadRead(
  workspaceId: string,
  threadId: string,
  userId: string
): Promise<{ ok: true } | { error: string }> {
  if (!(await assertThreadMember(workspaceId, threadId, userId))) {
    return { error: "forbidden" };
  }
  await query(
    `UPDATE staff_thread_members SET last_read_at = now()
     WHERE thread_id = $1 AND user_id = $2`,
    [threadId, userId]
  );
  return { ok: true };
}

export async function createStaffTaskFromThread(input: {
  workspaceId: string;
  threadId: string;
  authorUserId: string;
  title: string;
  ownerUserId: string;
  dueAt?: string | null;
  conversationId?: string | null;
}): Promise<{ taskId: string; message: StaffMessage } | { error: string }> {
  const title = String(input.title || "").trim();
  if (!title) {
    return { error: "task_title_required" };
  }
  if (!(await assertThreadMember(input.workspaceId, input.threadId, input.authorUserId))) {
    return { error: "forbidden" };
  }

  const owner = await query<{ id: string; full_name: string }>(
    `SELECT id, full_name FROM users
     WHERE id = $1 AND workspace_id = $2 AND is_active = true
       AND role IN ('admin', 'manager', 'marketer')
     LIMIT 1`,
    [input.ownerUserId, input.workspaceId]
  );
  if (!owner[0]) {
    return { error: "owner_not_found" };
  }

  let conversationId: string | null = null;
  let dealId: string | null = null;
  if (input.conversationId) {
    const conv = await query<{ id: string; deal_id: string | null }>(
      `SELECT c.id, d.id AS deal_id
       FROM conversations c
       LEFT JOIN deals d ON d.conversation_id = c.id
       WHERE c.id = $1 AND c.workspace_id = $2
       LIMIT 1`,
      [input.conversationId, input.workspaceId]
    );
    if (!conv[0]) {
      return { error: "conversation_not_found" };
    }
    conversationId = conv[0].id;
    dealId = conv[0].deal_id;
  }

  const task = await query<{ id: string }>(
    `INSERT INTO tasks (workspace_id, conversation_id, deal_id, owner_user_id, title, due_at)
     VALUES ($1, $2, $3, $4, $5, NULLIF($6, '')::timestamp)
     RETURNING id`,
    [
      input.workspaceId,
      conversationId,
      dealId,
      owner[0].id,
      title.slice(0, 200),
      input.dueAt || ""
    ]
  );

  await ensureMember(input.threadId, owner[0].id);

  const author = await query<{ full_name: string }>(
    `SELECT full_name FROM users WHERE id = $1 LIMIT 1`,
    [input.authorUserId]
  );

  const systemBody = `${author[0]?.full_name || "Сотрудник"} создал(а) задачу для ${owner[0].full_name}: «${title}»`;
  const message = await postStaffMessage({
    workspaceId: input.workspaceId,
    threadId: input.threadId,
    authorUserId: input.authorUserId,
    body: systemBody,
    conversationId,
    taskId: task[0].id,
    isSystem: true
  });

  if ("error" in message) {
    return { error: message.error };
  }

  return { taskId: task[0].id, message };
}

export async function countStaffUnread(workspaceId: string, userId: string): Promise<number> {
  await ensureTeamChannel(workspaceId);
  const rows = await query<{ cnt: number }>(
    `SELECT COALESCE(SUM(unread.cnt), 0)::int AS cnt
     FROM staff_thread_members m
     JOIN staff_threads t ON t.id = m.thread_id
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS cnt
       FROM staff_messages sm
       WHERE sm.thread_id = m.thread_id
         AND sm.created_at > COALESCE(m.last_read_at, '1970-01-01'::timestamp)
         AND (sm.author_user_id IS NULL OR sm.author_user_id <> $2)
     ) unread ON true
     WHERE t.workspace_id = $1 AND m.user_id = $2`,
    [workspaceId, userId]
  );
  return Number(rows[0]?.cnt || 0);
}
