import express from "express";
import logsController from "../controllers/logsController.ts";
import { requireAdmin, requireSuperAdmin } from "../middleware/admin.ts";
import { verifyAnyAuth } from "../middleware/auth.ts";

const router = express.Router();

/**
 * Logs Routes
 * Base path: /api/logs
 */

// Get all logs (Admin only)
router.get("/", requireAdmin, logsController.getLogs);

// Create log (from Mobile app, accessible to any authenticated user)
router.post("/", verifyAnyAuth, logsController.createLog);

export default router;
