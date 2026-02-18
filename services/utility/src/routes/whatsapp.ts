import express from "express";
import whatsappController from "../controllers/whatsappController.ts";
import { verifyAnyAuth } from "../middleware/auth.ts";

const router = express.Router();

/**
 * WhatsApp Routes
 * Base path: /api/whatsapp
 */

// Mapping routes
router.get("/mappings", verifyAnyAuth, whatsappController.getAllMappings);
router.post("/mappings", verifyAnyAuth, whatsappController.createMapping);
router.put("/mappings/:id", verifyAnyAuth, whatsappController.updateMapping);
router.delete("/mappings/:id", verifyAnyAuth, whatsappController.deleteMapping);
router.post(
  "/mappings/bulk-delete",
  verifyAnyAuth,
  whatsappController.bulkDeleteMappings,
);

// Template routes
router.get("/templates", verifyAnyAuth, whatsappController.getAllTemplates);
router.put("/templates/:id", verifyAnyAuth, whatsappController.updateTemplate);

// Log routes
router.get("/logs", verifyAnyAuth, whatsappController.getMessageLogs);

export default router;
