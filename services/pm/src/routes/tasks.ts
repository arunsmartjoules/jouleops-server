import express from "express";
import tasksController from "../controllers/tasksController.ts";
import { verifyAnyAuth, requireRole } from "../middleware/auth.ts";

const router = express.Router();

/**
 * Tasks Routes
 * Base path: /api/tasks
 */

router.post("/", verifyAnyAuth, tasksController.create);
router.get("/site/:siteCode", verifyAnyAuth, tasksController.getBySite);
router.get(
  "/site/:siteCode/due-today",
  verifyAnyAuth,
  tasksController.getDueToday,
);
router.get("/site/:siteCode/stats", verifyAnyAuth, tasksController.getStats);
router.get("/user/:userId", verifyAnyAuth, tasksController.getByUser);
router.get("/:taskId", verifyAnyAuth, tasksController.getById);
router.put(
  "/:taskId",
  verifyAnyAuth,
  requireRole(["admin", "superadmin"]),
  tasksController.update,
);
router.patch("/:taskId/status", verifyAnyAuth, tasksController.updateStatus);
router.delete(
  "/:taskId",
  verifyAnyAuth,
  requireRole(["admin", "superadmin"]),
  tasksController.remove,
);

export default router;
