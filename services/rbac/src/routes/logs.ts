import express from "express";
import logsController from "../controllers/logsController.ts";
import { requireAdmin, requireSuperAdmin } from "../middleware/admin.ts";

const router = express.Router();

/**
 * Logs Routes
 * Base path: /api/logs
 */

// Get all logs (Admin only)
router.get("/", requireAdmin, logsController.getLogs);

export default router;
