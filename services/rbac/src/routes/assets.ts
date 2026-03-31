import express from "express";
import assetsController from "../controllers/assetsController.ts";
import {
  verifyToken,
  verifyApiKey,
  verifyAnyAuth,
  requireRole,
} from "../middleware/auth.ts";
import { validate, createAssetSchema, updateAssetSchema } from "@jouleops/shared";

const router = express.Router();

/**
 * Assets Routes
 * Base path: /api/assets
 */
// Protected routes (accepts JWT or API Key)
router.get("/", verifyAnyAuth, assetsController.getAll);
router.get("/site/:siteCode", verifyAnyAuth, assetsController.getBySite);
router.get("/site/:siteCode/search", verifyAnyAuth, assetsController.search);
router.get(
  "/site/:siteCode/type/:assetType",
  verifyAnyAuth,
  assetsController.getByType,
);
router.get(
  "/site/:siteCode/location/:location",
  verifyAnyAuth,
  assetsController.getByLocation,
);
router.get(
  "/site/:siteCode/warranty",
  verifyAnyAuth,
  assetsController.getUnderWarranty,
);
router.get(
  "/site/:siteCode/warranty-expiring",
  verifyAnyAuth,
  assetsController.getWarrantyExpiring,
);
router.get("/site/:siteCode/stats", verifyAnyAuth, assetsController.getStats);
router.get("/qr/:qrId", verifyAnyAuth, assetsController.getByQrId);
router.get("/:assetId", verifyAnyAuth, assetsController.getById);
// Modification and privileged operations (unifying auth but still requiring role if needed)
// NOTE: For now, we unify auth for GET. Admin ops stay protected.
router.post(
  "/bulk-upsert",
  verifyAnyAuth,
  requireRole(["admin", "superadmin"]),
  assetsController.bulkUpsert,
);
router.post(
  "/",
  verifyAnyAuth,
  requireRole(["admin", "superadmin"]),
  validate(createAssetSchema),
  assetsController.create,
);
router.put(
  "/:assetId",
  verifyAnyAuth,
  requireRole(["admin", "superadmin"]),
  validate(updateAssetSchema),
  assetsController.update,
);
router.patch(
  "/:assetId/status",
  verifyAnyAuth,
  requireRole(["admin", "superadmin"]),
  assetsController.updateStatus,
);
router.delete(
  "/:assetId",
  verifyAnyAuth,
  requireRole(["admin", "superadmin"]),
  assetsController.remove,
);

export default router;
