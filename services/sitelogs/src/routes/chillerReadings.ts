import express from "express";
import chillerReadingsController from "../controllers/chillerReadingsController.ts";
import { verifyAnyAuth } from "../middleware/auth.ts";

import {
  validate,
  createChillerReadingSchema,
  updateChillerReadingSchema,
} from "@jouleops/shared";

const router = express.Router();

/**
 * Chiller Readings Routes
 * Base path: /api/chiller-readings
 */

// Protected routes (accepts JWT or API Key)
router.post(
  "/bulk-delete",
  verifyAnyAuth,
  chillerReadingsController.bulkRemove,
);
router.post(
  "/sync-fieldproxy",
  verifyAnyAuth,
  chillerReadingsController.syncFieldproxyBulk,
);
router.post(
  "/backfill-fp-sync",
  verifyAnyAuth,
  chillerReadingsController.backfillFpSync,
);
router.get("/", verifyAnyAuth, chillerReadingsController.getAll);
router.post(
  "/",
  verifyAnyAuth,
  validate(createChillerReadingSchema),
  chillerReadingsController.create,
);
router.get(
  "/site/:siteCode",
  verifyAnyAuth,
  chillerReadingsController.getBySite,
);
router.post(
  "/:id/sync-fieldproxy",
  verifyAnyAuth,
  chillerReadingsController.syncFieldproxySingle,
);
router.get(
  "/site/:siteCode/shift/:dateShift",
  verifyAnyAuth,
  chillerReadingsController.getByDateShift,
);
router.get(
  "/chiller/:chillerId",
  verifyAnyAuth,
  chillerReadingsController.getByChiller,
);
router.get(
  "/chiller/:chillerId/latest",
  verifyAnyAuth,
  chillerReadingsController.getLatest,
);
router.get(
  "/chiller/:chillerId/averages",
  verifyAnyAuth,
  chillerReadingsController.getAverages,
);
router.get("/:id", verifyAnyAuth, chillerReadingsController.getById);
router.put(
  "/:id",
  verifyAnyAuth,
  validate(updateChillerReadingSchema),
  chillerReadingsController.update,
);
router.delete("/:id", verifyAnyAuth, chillerReadingsController.remove);

export default router;
