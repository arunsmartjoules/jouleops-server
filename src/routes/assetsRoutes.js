import express from "express";
import assetsController from "../controllers/assetsController.js";
import { verifyToken, verifyApiKey, requireRole } from "../middleware/auth.js";

const router = express.Router();

/**
 * Assets Routes
 * Base path: /api/assets
 */
router.get("/", verifyToken, assetsController.getAll);
router.post(
  "/",
  verifyToken,
  requireRole(["admin", "superadmin"]),
  assetsController.create,
);
router.get("/site/:siteId", verifyToken, assetsController.getBySite);
router.get("/site/:siteId/search", verifyToken, assetsController.search);
router.get(
  "/site/:siteId/type/:assetType",
  verifyToken,
  assetsController.getByType,
);
router.get(
  "/site/:siteId/location/:location",
  verifyToken,
  assetsController.getByLocation,
);
router.get(
  "/site/:siteId/warranty",
  verifyToken,
  assetsController.getUnderWarranty,
);
router.get(
  "/site/:siteId/warranty-expiring",
  verifyToken,
  assetsController.getWarrantyExpiring,
);
router.get("/site/:siteId/stats", verifyToken, assetsController.getStats);
router.get("/:assetId", verifyToken, assetsController.getById);
router.put(
  "/:assetId",
  verifyToken,
  requireRole(["admin", "superadmin"]),
  assetsController.update,
);
router.patch(
  "/:assetId/status",
  verifyToken,
  requireRole(["admin", "superadmin"]),
  assetsController.updateStatus,
);
router.delete(
  "/:assetId",
  verifyToken,
  requireRole(["admin", "superadmin"]),
  assetsController.remove,
);

export default router;
