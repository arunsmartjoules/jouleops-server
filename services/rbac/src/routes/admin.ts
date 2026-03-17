import express from "express";
import adminController from "../controllers/adminController.ts";
import { requireAdmin, requireSuperAdmin } from "../middleware/admin.ts";

const router = express.Router();

/**
 * Admin Routes
 * Base path: /api/admin
 * All routes require admin or superadmin privileges
 */

// List all admins (admin or superadmin can access)
router.get("/list", requireAdmin, adminController.listAdmins);

// Promote user to admin (superadmin only)
router.post("/promote", requireSuperAdmin, adminController.promoteToAdmin);

// Demote admin (superadmin only)
router.post("/demote", requireSuperAdmin, adminController.demoteAdmin);

// Change superadmin - request (superadmin only)
router.post(
  "/change-superadmin/request",
  requireSuperAdmin,
  adminController.requestSuperadminChange
);

// Change superadmin - verify (superadmin only)
router.post(
  "/change-superadmin/verify",
  requireSuperAdmin,
  adminController.verifySuperadminChange
);

// Get dashboard stats (admin or superadmin)
router.get("/stats", requireAdmin, adminController.getDashboardStats);

export default router;
