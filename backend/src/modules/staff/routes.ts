import { Router } from "express";
import { AuthRequest } from "../../auth";
import {
  countStaffUnread,
  createStaffTaskFromThread,
  listStaffMembers,
  listStaffMessages,
  listStaffThreads,
  markThreadRead,
  openOrCreateDm,
  postStaffMessage,
  shareConversationToStaff
} from "./service";

export function createStaffRouter(): Router {
  const router = Router();

  router.get("/members", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    res.json(await listStaffMembers(workspaceId));
  });

  router.post("/share-conversation", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    const userId = req.user?.id || "";
    const { conversationId, note, createTask, ownerUserId } = req.body as {
      conversationId?: string;
      note?: string;
      createTask?: boolean;
      ownerUserId?: string | null;
    };
    const result = await shareConversationToStaff({
      workspaceId,
      authorUserId: userId,
      conversationId: String(conversationId || ""),
      note,
      createTask,
      ownerUserId
    });
    if ("error" in result) {
      const status =
        result.error === "conversation_not_found"
          ? 404
          : result.error === "forbidden"
            ? 403
            : 400;
      res.status(status).json(result);
      return;
    }
    res.status(201).json(result);
  });

  router.get("/unread-count", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    const userId = req.user?.id || "";
    res.json({ count: await countStaffUnread(workspaceId, userId) });
  });

  router.get("/threads", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    const userId = req.user?.id || "";
    res.json(await listStaffThreads(workspaceId, userId));
  });

  router.post("/threads/dm", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    const userId = req.user?.id || "";
    const { userId: peerUserId } = req.body as { userId?: string };
    const result = await openOrCreateDm(workspaceId, userId, String(peerUserId || ""));
    if ("error" in result) {
      const status = result.error === "peer_not_found" ? 404 : 400;
      res.status(status).json(result);
      return;
    }
    res.status(201).json(result);
  });

  router.get("/threads/:threadId/messages", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    const userId = req.user?.id || "";
    const result = await listStaffMessages(workspaceId, req.params.threadId, userId);
    if ("error" in result) {
      res.status(result.error === "forbidden" ? 403 : 400).json(result);
      return;
    }
    res.json(result);
  });

  router.post("/threads/:threadId/messages", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    const userId = req.user?.id || "";
    const { body, conversationId } = req.body as {
      body?: string;
      conversationId?: string | null;
    };
    const result = await postStaffMessage({
      workspaceId,
      threadId: req.params.threadId,
      authorUserId: userId,
      body: String(body || ""),
      conversationId
    });
    if ("error" in result) {
      const status =
        result.error === "forbidden"
          ? 403
          : result.error === "conversation_not_found"
            ? 404
            : 400;
      res.status(status).json(result);
      return;
    }
    res.status(201).json(result);
  });

  router.post("/threads/:threadId/read", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    const userId = req.user?.id || "";
    const result = await markThreadRead(workspaceId, req.params.threadId, userId);
    if ("error" in result) {
      res.status(403).json(result);
      return;
    }
    res.json(result);
  });

  router.post("/threads/:threadId/tasks", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    const userId = req.user?.id || "";
    const { title, ownerUserId, dueAt, conversationId } = req.body as {
      title?: string;
      ownerUserId?: string;
      dueAt?: string | null;
      conversationId?: string | null;
    };
    const result = await createStaffTaskFromThread({
      workspaceId,
      threadId: req.params.threadId,
      authorUserId: userId,
      title: String(title || ""),
      ownerUserId: String(ownerUserId || ""),
      dueAt,
      conversationId
    });
    if ("error" in result) {
      const status =
        result.error === "forbidden"
          ? 403
          : result.error === "owner_not_found" || result.error === "conversation_not_found"
            ? 404
            : 400;
      res.status(status).json(result);
      return;
    }
    res.status(201).json(result);
  });

  return router;
}
