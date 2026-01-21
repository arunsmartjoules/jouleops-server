import express from "express";
import tasksController from "../controllers/tasksController.js";
import { verifyToken, verifyApiKey, requireRole } from "../middleware/auth.js";

const router = express.Router();

/**
 * Tasks Routes
 * Base path: /api/tasks
 */

router.post("/", verifyApiKey, tasksController.create);
router.get("/site/:siteId", verifyToken, tasksController.getBySite);
router.get("/site/:siteId/due-today", verifyToken, tasksController.getDueToday);
router.get("/site/:siteId/stats", verifyToken, tasksController.getStats);
router.get("/user/:userId", verifyToken, tasksController.getByUser);
router.get("/:taskId", verifyToken, tasksController.getById);
router.put(
  "/:taskId",
  verifyToken,
  requireRole(["admin", "superadmin"]),
  tasksController.update,
);
router.patch("/:taskId/status", verifyToken, tasksController.updateStatus);
router.delete(
  "/:taskId",
  verifyToken,
  requireRole(["admin", "superadmin"]),
  tasksController.remove,
);

export default router;
