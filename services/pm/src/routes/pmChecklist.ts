import express from "express";
import pmChecklistController from "../controllers/pmChecklistController.ts";
import { verifyAnyAuth, requireRole } from "../middleware/auth.ts";

const router = express.Router();

/**
 * PM Checklist Routes
 * Base path: /api/pm-checklist
 */

router.post(
  "/",
  verifyAnyAuth,
  requireRole(["admin", "superadmin"]),
  pmChecklistController.create,
);
router.get("/site/:siteId", verifyAnyAuth, pmChecklistController.getBySite);
router.get(
  "/maintenance-type/:maintenanceType",
  verifyAnyAuth,
  pmChecklistController.getByMaintenanceType,
);
router.get("/", verifyAnyAuth, pmChecklistController.getAll);
router.get("/:checklistId", verifyAnyAuth, pmChecklistController.getById);
router.put(
  "/:checklistId",
  verifyAnyAuth,
  requireRole(["admin", "superadmin"]),
  pmChecklistController.update,
);
router.delete(
  "/:checklistId",
  verifyAnyAuth,
  requireRole(["admin", "superadmin"]),
  pmChecklistController.remove,
);

// Checklist Responses
router.post("/responses", verifyAnyAuth, pmChecklistController.createResponse);
router.get(
  "/responses/instance/:instanceId",
  verifyAnyAuth,
  pmChecklistController.getResponses,
);
router.put(
  "/responses/:responseId",
  verifyAnyAuth,
  pmChecklistController.updateResponse,
);

export default router;
