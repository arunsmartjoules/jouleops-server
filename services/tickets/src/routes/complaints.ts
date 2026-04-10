import express from "express";
import complaintsController from "../controllers/complaintsController.ts";
import complaintImagesController from "../controllers/complaintImagesController.ts";

import {
  verifyToken,
  verifyApiKey,
  verifyAnyAuth,
} from "../middleware/auth.ts";

import {
  validate,
  createComplaintSchema,
  updateComplaintSchema,
  updateComplaintStatusSchema,
} from "@jouleops/shared";

const router = express.Router();

/**
 * Complaints Routes
 * Base path: /api/complaints
 */

// Protected routes (accepts JWT or API Key)
router.get("/", verifyAnyAuth, complaintsController.getAll);
router.post("/bulk-upsert", verifyAnyAuth, complaintsController.bulkUpsert);
router.post(
  "/sync-fieldproxy",
  verifyAnyAuth,
  complaintsController.syncFieldproxyBulk,
);
router.post(
  "/:id/sync-fieldproxy",
  verifyAnyAuth,
  complaintsController.syncFieldproxySingle,
);

// Protected routes (require API key for external systems)
router.post(
  "/",
  verifyAnyAuth,
  validate(createComplaintSchema),
  complaintsController.create,
);
// Protected routes (accepts JWT or API Key)
router.get(
  "/message/:messageId",
  verifyAnyAuth,
  complaintsController.getByMessageId,
);
router.get(
  "/group/:groupId/recent",
  verifyAnyAuth,
  complaintsController.getRecentByGroup,
);

// Protected routes (accepts JWT or API Key)
router.get("/site/:siteCode", verifyAnyAuth, complaintsController.getBySite);
router.get(
  "/site/:siteCode/stats",
  verifyAnyAuth,
  complaintsController.getStats,
);
router.get("/:id", verifyAnyAuth, complaintsController.getById);
router.put(
  "/",
  verifyAnyAuth,
  validate(updateComplaintSchema),
  complaintsController.update,
);
router.put(
  "/:id",
  verifyAnyAuth,
  validate(updateComplaintSchema),
  complaintsController.update,
);

router.patch(
  "/",
  verifyAnyAuth,
  validate(updateComplaintSchema),
  complaintsController.update,
);

router.patch(
  "/:id",
  verifyAnyAuth,
  validate(updateComplaintSchema),
  complaintsController.update,
);
router.patch(
  "/status",
  verifyAnyAuth,
  validate(updateComplaintStatusSchema),
  complaintsController.updateStatus,
);
router.patch(
  "/:id/status",
  verifyAnyAuth,
  validate(updateComplaintStatusSchema),
  complaintsController.updateStatus,
);

// Line items routes
router.get(
  "/:id/line-items",
  verifyAnyAuth,
  complaintImagesController.getLineItems,
);
router.post(
  "/:id/line-items",
  verifyAnyAuth,
  complaintImagesController.addLineItem,
);

router.delete("/:id", verifyAnyAuth, complaintsController.remove);

export default router;
