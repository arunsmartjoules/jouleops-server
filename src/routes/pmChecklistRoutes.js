import express from "express";
import pmChecklistController from "../controllers/pmChecklistController.js";
import { verifyToken, verifyApiKey, requireRole } from "../middleware/auth.js";

const router = express.Router();

/**
 * PM Checklist Routes
 * Base path: /api/pm-checklist
 */

router.post(
  "/",
  verifyToken,
  requireRole(["admin", "superadmin"]),
  pmChecklistController.create,
);
router.get("/site/:siteId", verifyToken, pmChecklistController.getBySite);
router.get(
  "/maintenance-type/:maintenanceType",
  verifyToken,
  pmChecklistController.getByMaintenanceType,
);
router.get("/:checklistId", verifyToken, pmChecklistController.getById);
router.put(
  "/:checklistId",
  verifyToken,
  requireRole(["admin", "superadmin"]),
  pmChecklistController.update,
);
router.delete(
  "/:checklistId",
  verifyToken,
  requireRole(["admin", "superadmin"]),
  pmChecklistController.remove,
);

// Checklist Responses
router.post("/responses", verifyApiKey, pmChecklistController.createResponse);
router.get(
  "/responses/instance/:instanceId",
  verifyToken,
  pmChecklistController.getResponses,
);
router.put(
  "/responses/:responseId",
  verifyToken,
  pmChecklistController.updateResponse,
);

export default router;
