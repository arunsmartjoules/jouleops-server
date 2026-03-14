import express from "express";
import logMasterController from "../controllers/logMasterController.ts";
import { verifyAnyAuth } from "../middleware/auth.ts";

const router = express.Router();

/**
 * Log Master Routes
 * Base path: /api/log-master
 */

router.get("/", verifyAnyAuth, logMasterController.getAll);
router.post("/", verifyAnyAuth, logMasterController.create);
router.post("/bulk-upsert", verifyAnyAuth, logMasterController.bulkUpsert);
router.post("/bulk-delete", verifyAnyAuth, logMasterController.bulkDelete);
router.put("/:id", verifyAnyAuth, logMasterController.update);
router.delete("/:id", verifyAnyAuth, logMasterController.remove);

export default router;
