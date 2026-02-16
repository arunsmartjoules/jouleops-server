import express from "express";
import sitesController from "../controllers/sitesController.ts";
import { verifyToken, verifyAnyAuth, requireRole } from "../middleware/auth.ts";

const router = express.Router();

/**
 * Sites Routes
 * Base path: /api/sites
 */

router.post(
  "/",
  verifyToken,
  requireRole(["admin", "superadmin"]),
  sitesController.create,
);
router.get("/", verifyAnyAuth, sitesController.getAll);
router.get("/:siteId", verifyAnyAuth, sitesController.getById);
router.put(
  "/:siteId",
  verifyToken,
  requireRole(["admin", "superadmin"]),
  sitesController.update,
);
router.delete(
  "/:siteId",
  verifyToken,
  requireRole(["admin", "superadmin"]),
  sitesController.remove,
);

// Bulk operations
router.post(
  "/bulk-update",
  verifyToken,
  requireRole(["admin", "superadmin"]),
  sitesController.bulkUpdate,
);
router.post(
  "/bulk-delete",
  verifyToken,
  requireRole(["admin", "superadmin"]),
  sitesController.bulkRemove,
);

export default router;
