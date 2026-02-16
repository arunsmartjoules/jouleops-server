import express from "express";
import pmInstancesController from "../controllers/pmInstancesController.ts";
import {
  verifyToken,
  verifyApiKey,
  verifyAnyAuth,
  requireRole,
} from "../middleware/auth.ts";

const router = express.Router();

/**
 * PM Instances Routes
 * Base path: /api/pm-instances
 */

router.get("/", verifyAnyAuth, pmInstancesController.getAll);
router.post("/", verifyApiKey, pmInstancesController.create);
router.get("/site/:siteId", verifyAnyAuth, pmInstancesController.getBySite);
router.get(
  "/site/:siteId/pending",
  verifyAnyAuth,
  pmInstancesController.getPending,
);
router.get(
  "/site/:siteId/overdue",
  verifyAnyAuth,
  pmInstancesController.getOverdue,
);
router.get(
  "/site/:siteId/stats",
  verifyAnyAuth,
  pmInstancesController.getStats,
);
router.get("/asset/:assetId", verifyAnyAuth, pmInstancesController.getByAsset);
router.get("/:instanceId", verifyAnyAuth, pmInstancesController.getById);
router.put(
  "/:instanceId",
  verifyAnyAuth,
  requireRole(["admin", "superadmin"]),
  pmInstancesController.update,
);
router.patch(
  "/:instanceId/status",
  verifyAnyAuth,
  pmInstancesController.updateStatus,
);
router.patch(
  "/:instanceId/progress",
  verifyAnyAuth,
  pmInstancesController.updateProgress,
);
router.delete(
  "/:instanceId",
  verifyAnyAuth,
  requireRole(["admin", "superadmin"]),
  pmInstancesController.remove,
);

export default router;
