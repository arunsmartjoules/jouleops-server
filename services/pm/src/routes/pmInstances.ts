import express from "express";
import pmInstancesController from "../controllers/pmInstancesController.ts";
import { verifyAnyAuth } from "../middleware/auth.ts";

const router = express.Router();

/**
 * PM Instances Routes
 * Base path: /api/pm-instances
 */

router.get("/", verifyAnyAuth, pmInstancesController.getAll);
router.post("/", verifyAnyAuth, pmInstancesController.create);
router.get("/site/:siteCode", verifyAnyAuth, pmInstancesController.getBySite);
router.get(
  "/site/:siteCode/pending",
  verifyAnyAuth,
  pmInstancesController.getPending,
);
router.get(
  "/site/:siteCode/overdue",
  verifyAnyAuth,
  pmInstancesController.getOverdue,
);
router.get(
  "/site/:siteCode/stats",
  verifyAnyAuth,
  pmInstancesController.getStats,
);
router.get("/asset/:assetId", verifyAnyAuth, pmInstancesController.getByAsset);
router.post(
  "/:instanceId/sync-fieldproxy",
  verifyAnyAuth,
  pmInstancesController.syncFieldproxyByInstance,
);
router.get("/:instanceId", verifyAnyAuth, pmInstancesController.getById);
router.put("/:instanceId", verifyAnyAuth, pmInstancesController.update);
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
router.post(
  "/resync/fieldproxy-history",
  verifyAnyAuth,
  pmInstancesController.resyncFieldproxyHistory,
);
router.delete("/:instanceId", verifyAnyAuth, pmInstancesController.remove);

export default router;
