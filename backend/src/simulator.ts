import { Server } from "socket.io";
import { query } from "./db";

const sampleIncoming = [
  "\u0417\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435! \u041f\u043e\u0434\u0441\u043a\u0430\u0436\u0438\u0442\u0435, \u043f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430, \u043a\u0430\u043a\u0438\u0435 \u0443 \u0432\u0430\u0441 \u0442\u0430\u0440\u0438\u0444\u044b?",
  "\u0414\u043e\u0431\u0440\u044b\u0439 \u0434\u0435\u043d\u044c, \u043d\u0430\u043c \u043d\u0443\u0436\u043d\u0430 \u043a\u043e\u043d\u0441\u0443\u043b\u044c\u0442\u0430\u0446\u0438\u044f \u043f\u043e \u0432\u043d\u0435\u0434\u0440\u0435\u043d\u0438\u044e CRM.",
  "\u042f \u043e\u0441\u0442\u0430\u0432\u0438\u043b \u0437\u0430\u044f\u0432\u043a\u0443 \u0438 \u0436\u0434\u0443 \u043e\u0431\u0440\u0430\u0442\u043d\u0443\u044e \u0441\u0432\u044f\u0437\u044c.",
  "\u041c\u043e\u0436\u043d\u043e \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0438\u0442\u044c \u0434\u0432\u0443\u0445 \u043c\u0435\u043d\u0435\u0434\u0436\u0435\u0440\u043e\u0432 \u043a \u043e\u0434\u043d\u043e\u043c\u0443 \u0440\u0430\u0431\u043e\u0447\u0435\u043c\u0443 \u043f\u0440\u043e\u0441\u0442\u0440\u0430\u043d\u0441\u0442\u0432\u0443?"
];

export function startSimulator(io: Server): void {
  const intervalMs = Number(process.env.SIMULATOR_INTERVAL_MS || 15000);
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    return;
  }

  setInterval(async () => {
    const conversations = await query<{ id: string; workspace_id: string }>(
      "SELECT id, workspace_id FROM conversations WHERE channel = 'whatsapp' ORDER BY random() LIMIT 1"
    );

    const conversation = conversations[0];
    if (!conversation) {
      return;
    }

    const body = sampleIncoming[Math.floor(Math.random() * sampleIncoming.length)];

    const inserted = await query<{ id: string; created_at: string }>(
      `INSERT INTO messages (conversation_id, workspace_id, direction, body)
       VALUES ($1, $2, 'incoming', $3)
       RETURNING id, created_at`,
      [conversation.id, conversation.workspace_id, body]
    );

    await query(
      `UPDATE conversations
       SET updated_at = now(),
           first_response_due_at = now() + interval '15 minutes'
       WHERE id = $1`,
      [conversation.id]
    );

    io.emit("message:new", {
      conversationId: conversation.id,
      messageId: inserted[0].id,
      direction: "incoming",
      body,
      createdAt: inserted[0].created_at
    });
  }, intervalMs);
}
