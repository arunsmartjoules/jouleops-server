import express from "express";
import siteLogsController from "../controllers/siteLogsController.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

/**
 * Site Logs Routes
 * Base path: /api/site-logs
 */

router.post("/bulk-delete", verifyToken, siteLogsController.bulkRemove);
router.get("/", verifyToken, siteLogsController.getAll);
router.post("/", verifyToken, siteLogsController.create);
router.get("/site/:siteId", verifyToken, siteLogsController.getBySite);
router.put("/:id", verifyToken, siteLogsController.update);
router.delete("/:id", verifyToken, siteLogsController.remove);

export default router;
