import express from "express";
import pmInstancesController from "../controllers/pmInstancesController.js";
import { verifyToken, verifyApiKey, requireRole } from "../middleware/auth.js";

const router = express.Router();

/**
 * PM Instances Routes
 * Base path: /api/pm-instances
 */

router.get("/", verifyToken, pmInstancesController.getAll);
router.post("/", verifyApiKey, pmInstancesController.create);
router.get("/site/:siteId", verifyToken, pmInstancesController.getBySite);
router.get(
  "/site/:siteId/pending",
  verifyToken,
  pmInstancesController.getPending,
);
router.get(
  "/site/:siteId/overdue",
  verifyToken,
  pmInstancesController.getOverdue,
);
router.get("/site/:siteId/stats", verifyToken, pmInstancesController.getStats);
router.get("/asset/:assetId", verifyToken, pmInstancesController.getByAsset);
router.get("/:instanceId", verifyToken, pmInstancesController.getById);
router.put(
  "/:instanceId",
  verifyToken,
  requireRole(["admin", "superadmin"]),
  pmInstancesController.update,
);
router.patch(
  "/:instanceId/status",
  verifyToken,
  pmInstancesController.updateStatus,
);
router.patch(
  "/:instanceId/progress",
  verifyToken,
  pmInstancesController.updateProgress,
);
router.delete(
  "/:instanceId",
  verifyToken,
  requireRole(["admin", "superadmin"]),
  pmInstancesController.remove,
);

export default router;
