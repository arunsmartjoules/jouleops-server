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
router.get("/:ticketId", verifyAnyAuth, complaintsController.getById);
router.put(
  "/:ticketId",
  verifyAnyAuth,
  validate(updateComplaintSchema),
  complaintsController.update,
);
router.patch(
  "/:ticketId/status",
  verifyAnyAuth,
  validate(updateComplaintStatusSchema),
  complaintsController.updateStatus,
);

// Line items routes
router.get(
  "/:ticketId/line-items",
  verifyAnyAuth,
  complaintImagesController.getLineItems,
);
router.post(
  "/:ticketId/line-items",
  verifyAnyAuth,
  complaintImagesController.addLineItem,
);

router.delete("/:ticketId", verifyAnyAuth, complaintsController.remove);

export default router;
