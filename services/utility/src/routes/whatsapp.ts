import express from "express";
import whatsappController from "../controllers/whatsappController.ts";
import { verifyAnyAuth } from "../middleware/auth.ts";

const router = express.Router();

/**
 * WhatsApp Routes
 * Base path: /api/whatsapp
 */

// Channel routes
router.get("/channels", verifyAnyAuth, whatsappController.getAllChannels);
router.post("/channels", verifyAnyAuth, whatsappController.createChannel);
router.put("/channels/:id", verifyAnyAuth, whatsappController.updateChannel);
router.delete("/channels/:id", verifyAnyAuth, whatsappController.deleteChannel);

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
router.post("/templates", verifyAnyAuth, whatsappController.createTemplate);
router.get(
  "/templates/status/:status",
  verifyAnyAuth,
  whatsappController.getTemplateStatus,
);
router.put("/templates/:id", verifyAnyAuth, whatsappController.updateTemplate);
router.delete(
  "/templates/:id",
  verifyAnyAuth,
  whatsappController.deleteTemplate,
);

// Sending routes
router.post("/send", verifyAnyAuth, whatsappController.sendWhatsAppMessage);
router.post("/send-image", verifyAnyAuth, whatsappController.sendWhatsAppImage);

export default router;
