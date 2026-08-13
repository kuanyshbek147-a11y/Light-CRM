import { Router } from "express";
import type { Server } from "socket.io";
import { AuthRequest, authMiddleware, requireWorkspaceMiddleware } from "../../../auth";
import { query } from "../../../db";
import { upsertCallEvent, type CallDirection, type CallStatus } from "./calls";
import {
  deleteTelephonyExtension,
  getTelephonySettings,
  getUserTelephonySession,
  listTelephonyExtensions,
  saveTelephonySettings,
  upsertTelephonyExtension,
  type IceServerConfig
} from "./credentials";

const CALL_STATUSES = new Set<CallStatus>([
  "ringing",
  "started",
  "answered",
  "ended",
  "missed",
  "failed"
]);

export function createTelephonyRouter(io: Server): Router {
  const router = Router();
  router.use(authMiddleware, requireWorkspaceMiddleware);

  router.get("/status", async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId || "";
    const settings = await getTelephonySettings(workspaceId);
    const extensions = await listTelephonyExtensions(workspaceId);
    res.json({
      enabled: settings.enabled,
      configured: Boolean(settings.enabled && settings.wssUrl && settings.domain),
      wssUrl: settings.wssUrl || null,
      domain: settings.domain || null,
      extensionCount: extensions.length,
      activeExtensionCount: extensions.filter((item) => item.is_active).length
    });
  });

  router.get("/settings", async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    res.json(await getTelephonySettings(req.user.workspaceId || ""));
  });

  router.put("/settings", async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    try {
      const body = (req.body || {}) as {
        enabled?: boolean;
        wssUrl?: string;
        domain?: string;
        iceServers?: IceServerConfig[];
        outboundPrefix?: string;
      };
      const settings = await saveTelephonySettings(req.user.workspaceId || "", body);
      res.json(settings);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "invalid_settings"
      });
    }
  });

  router.get("/extensions", async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const workspaceId = req.user.workspaceId || "";
    const [extensions, users] = await Promise.all([
      listTelephonyExtensions(workspaceId),
      query<{ id: string; full_name: string; role: string }>(
        `SELECT id, full_name, role
         FROM users
         WHERE workspace_id = $1 AND is_active = true AND role IN ('admin', 'manager', 'marketer')
         ORDER BY full_name ASC`,
        [workspaceId]
      )
    ]);
    res.json({ extensions, users });
  });

  router.put("/extensions", async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    try {
      const body = (req.body || {}) as {
        userId?: string;
        sipUsername?: string;
        sipPassword?: string;
        displayName?: string;
        isActive?: boolean;
      };
      const extension = await upsertTelephonyExtension({
        workspaceId: req.user.workspaceId || "",
        userId: String(body.userId || ""),
        sipUsername: String(body.sipUsername || ""),
        sipPassword: body.sipPassword,
        displayName: body.displayName,
        isActive: body.isActive
      });
      res.json(extension);
    } catch (error) {
      const message = error instanceof Error ? error.message : "extension_error";
      const status =
        message === "user_not_found"
          ? 404
          : message === "sip_username_required" || message === "sip_password_required"
            ? 400
            : 400;
      res.status(status).json({ error: message });
    }
  });

  router.delete("/extensions/:id", async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const ok = await deleteTelephonyExtension(req.user.workspaceId || "", req.params.id);
    if (!ok) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.status(204).send();
  });

  router.get("/session", async (req: AuthRequest, res) => {
    const session = await getUserTelephonySession(
      req.user?.workspaceId || "",
      req.user?.id || ""
    );
    res.json(session);
  });

  router.post("/calls", async (req: AuthRequest, res) => {
    try {
      const body = (req.body || {}) as {
        direction?: string;
        remoteNumber?: string;
        status?: string;
        sipCallId?: string;
        callLogId?: string;
        durationSec?: number;
      };
      const direction = String(body.direction || "").trim() as CallDirection;
      const status = String(body.status || "").trim() as CallStatus;
      if (direction !== "in" && direction !== "out") {
        res.status(400).json({ error: "invalid_direction" });
        return;
      }
      if (!CALL_STATUSES.has(status)) {
        res.status(400).json({ error: "invalid_status" });
        return;
      }
      const call = await upsertCallEvent({
        workspaceId: req.user?.workspaceId || "",
        userId: req.user?.id || "",
        direction,
        remoteNumber: String(body.remoteNumber || ""),
        status,
        sipCallId: body.sipCallId,
        callLogId: body.callLogId,
        durationSec: body.durationSec,
        io
      });
      res.status(201).json(call);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : "call_error"
      });
    }
  });

  return router;
}
