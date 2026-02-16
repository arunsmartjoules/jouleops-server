import express from "express";
import complaintsController from "../controllers/complaintsController.ts";
import { verifyToken, verifyApiKey } from "../middleware/auth.ts";

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

// Protected routes (require JWT)
router.get("/", verifyToken, complaintsController.getAll);

// Public routes (with API key for n8n)
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

// Protected routes (require JWT)
router.get("/site/:siteId", verifyToken, complaintsController.getBySite);
router.get("/site/:siteId/stats", verifyToken, complaintsController.getStats);
router.get("/:ticketId", verifyToken, complaintsController.getById);
router.put(
  "/:ticketId",
  verifyToken,
  validate(updateComplaintSchema),
  complaintsController.update,
);
router.patch(
  "/:ticketId/status",
  verifyToken,
  validate(updateComplaintStatusSchema),
  complaintsController.updateStatus,
);
router.delete("/:ticketId", verifyToken, complaintsController.remove);

export default router;
