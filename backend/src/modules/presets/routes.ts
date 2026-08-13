import { Router } from "express";
import { AuthRequest, requireWorkspaceAdminMiddleware } from "../../auth";
import { applyRealEstateKzPreset, REAL_ESTATE_KZ_PRESET_ID } from "./real-estate-kz";

export function createPresetsRouter(): Router {
  const router = Router();

  router.get("/", (_req: AuthRequest, res) => {
    res.json({
      presets: [
        {
          id: REAL_ESTATE_KZ_PRESET_ID,
          name: "Недвижимость KZ",
          description:
            "Воронка: Новый → Квалификация → Показ → Договор → Выиграно/Отказ. Скрипты, обязательные город и повод, черновик лендинга."
        }
      ]
    });
  });

  router.post(
    "/:presetId/apply",
    requireWorkspaceAdminMiddleware,
    async (req: AuthRequest, res) => {
      const presetId = String(req.params.presetId || "").trim();
      if (presetId !== REAL_ESTATE_KZ_PRESET_ID) {
        res.status(404).json({ error: "preset_not_found" });
        return;
      }
      const workspaceId = req.user?.workspaceId || "";
      const userId = req.user?.id || null;
      const createLanding =
        (req.body as { createLanding?: boolean } | undefined)?.createLanding !== false;

      try {
        const result = await applyRealEstateKzPreset({
          workspaceId,
          userId,
          createLanding
        });
        res.json({ ok: true, ...result });
      } catch (error) {
        const message = error instanceof Error ? error.message : "apply_preset_failed";
        res.status(400).json({ ok: false, error: message });
      }
    }
  );

  return router;
}
