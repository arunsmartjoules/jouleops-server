import express from "express";
import pmChecklistMasterController from "../controllers/pmChecklistMasterController.ts";
import { verifyAnyAuth } from "../middleware/auth.ts";

const router = express.Router();

/**
 * PM Checklist Master Routes
 * Base path: /api/pm-checklist-master
 */

router.get("/", verifyAnyAuth, pmChecklistMasterController.getAll);
router.post("/", verifyAnyAuth, pmChecklistMasterController.create);
router.get("/:id", verifyAnyAuth, pmChecklistMasterController.getById);
router.put("/:id", verifyAnyAuth, pmChecklistMasterController.update);
router.delete("/:id", verifyAnyAuth, pmChecklistMasterController.remove);

export default router;
