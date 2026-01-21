import express from "express";
import whatsappController from "../controllers/whatsappController.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

/**
 * WhatsApp Routes
 * Base path: /api/whatsapp
 */

// Mapping routes
router.get("/mappings", verifyToken, whatsappController.getAllMappings);
router.post("/mappings", verifyToken, whatsappController.createMapping);
router.put("/mappings/:id", verifyToken, whatsappController.updateMapping);
router.delete("/mappings/:id", verifyToken, whatsappController.deleteMapping);

// Template routes
router.get("/templates", verifyToken, whatsappController.getAllTemplates);
router.put("/templates/:id", verifyToken, whatsappController.updateTemplate);

// Log routes
router.get("/logs", verifyToken, whatsappController.getMessageLogs);

export default router;
