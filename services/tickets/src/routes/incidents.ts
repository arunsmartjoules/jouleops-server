import express from "express";
import incidentsController from "../controllers/incidentsController.ts";
import { verifyAnyAuth } from "../middleware/auth.ts";
import {
  createIncidentSchema,
  updateIncidentSchema,
  updateIncidentStatusSchema,
  updateIncidentRcaStatusSchema,
  validate,
} from "@jouleops/shared";

const router = express.Router();

router.get("/", verifyAnyAuth, incidentsController.list);
router.get("/stats", verifyAnyAuth, incidentsController.getStats);
router.get("/:id", verifyAnyAuth, incidentsController.getById);
router.post("/", verifyAnyAuth, validate(createIncidentSchema), incidentsController.create);
router.put("/:id", verifyAnyAuth, validate(updateIncidentSchema), incidentsController.update);
router.patch(
  "/:id/status",
  verifyAnyAuth,
  validate(updateIncidentStatusSchema),
  incidentsController.updateStatus,
);
router.patch(
  "/:id/rca-status",
  verifyAnyAuth,
  validate(updateIncidentRcaStatusSchema),
  incidentsController.updateRcaStatus,
);
router.post("/:id/attachments", verifyAnyAuth, incidentsController.addAttachment);

export default router;
