import express from "express";
import complaintsController from "../controllers/complaintsController.ts";
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
  verifyApiKey,
  validate(createComplaintSchema),
  complaintsController.create,
);
router.get(
  "/message/:messageId",
  verifyApiKey,
  complaintsController.getByMessageId,
);
router.get(
  "/group/:groupId/recent",
  verifyApiKey,
  complaintsController.getRecentByGroup,
);

// Protected routes (accepts JWT or API Key)
router.get("/site/:siteId", verifyAnyAuth, complaintsController.getBySite);
router.get("/site/:siteId/stats", verifyAnyAuth, complaintsController.getStats);
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
router.delete("/:ticketId", verifyAnyAuth, complaintsController.remove);

export default router;
