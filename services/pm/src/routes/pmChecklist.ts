import express from "express";
import pmChecklistController from "../controllers/pmChecklistController.ts";
import { verifyAnyAuth } from "../middleware/auth.ts";

const router = express.Router();

/**
 * PM Checklist Routes
 * Base path: /api/pm-checklist
 */

router.post("/", verifyAnyAuth, pmChecklistController.create);
router.get("/site/:siteCode", verifyAnyAuth, pmChecklistController.getBySite);
router.get(
  "/maintenance-type/:maintenanceType",
  verifyAnyAuth,
  pmChecklistController.getByMaintenanceType,
);
router.get("/", verifyAnyAuth, pmChecklistController.getAll);
router.get("/:checklistId", verifyAnyAuth, pmChecklistController.getById);
router.put("/:checklistId", verifyAnyAuth, pmChecklistController.update);
router.delete("/:checklistId", verifyAnyAuth, pmChecklistController.remove);

// Individual Item CRUD (UUID based)
router.put("/item/:id", verifyAnyAuth, pmChecklistController.updateItem);
router.delete("/item/:id", verifyAnyAuth, pmChecklistController.removeItem);

// Checklist Responses
router.post("/responses", verifyAnyAuth, pmChecklistController.createResponse);
router.get(
  "/responses/instance/:instanceId",
  verifyAnyAuth,
  pmChecklistController.getResponses,
);
router.delete(
  "/responses/:responseId",
  verifyAnyAuth,
  pmChecklistController.removeResponse,
);

export default router;
