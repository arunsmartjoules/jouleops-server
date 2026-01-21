import express from "express";
import logsController from "../controllers/logsController.js";
import { verifyToken, requireRole } from "../middleware/auth.js";

const router = express.Router();

/**
 * Logs Routes
 * Base path: /api/logs
 */

router.get("/", verifyToken, requireRole("admin"), logsController.getAll);
router.get(
  "/trends",
  verifyToken,
  requireRole("admin"),
  logsController.getTrends,
);
router.post("/", verifyToken, logsController.create);

export default router;
