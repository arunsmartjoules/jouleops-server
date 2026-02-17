import express from "express";
import siteUsersController from "../controllers/siteUsersController.ts";
import { verifyToken, verifyAnyAuth, requireRole } from "../middleware/auth.ts";

const router = express.Router();

/**
 * Site Users Routes
 * Base path: /api/site-users
 */

// Get all site-user mappings with filters
router.get("/", verifyAnyAuth, siteUsersController.getAll);

// Get users at a specific site
router.get("/by-site/:siteCode", verifyAnyAuth, siteUsersController.getBySite);

// Get sites for a specific user
router.get("/by-user/:userId", verifyAnyAuth, siteUsersController.getByUser);

// Assign user to site
router.post(
  "/",
  verifyToken,
  requireRole(["admin", "superadmin"]),
  siteUsersController.assignUser,
);

// Update assignment
router.put(
  "/:siteCode/:userId",
  verifyToken,
  requireRole(["admin", "superadmin"]),
  siteUsersController.updateAssignment,
);

// Remove assignment
router.delete(
  "/:siteCode/:userId",
  verifyToken,
  requireRole(["admin", "superadmin"]),
  siteUsersController.removeAssignment,
);

export default router;
