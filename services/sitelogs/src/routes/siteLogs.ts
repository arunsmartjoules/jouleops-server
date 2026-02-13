import express from "express";
import siteLogsController from "../controllers/siteLogsController.ts";
import { verifyToken } from "../middleware/auth.ts";

import {
  validate,
  createSiteLogSchema,
  updateSiteLogSchema,
} from "@smartops/shared";

const router = express.Router();

/**
 * Site Logs Routes
 * Base path: /api/site-logs
 */

router.post("/bulk-delete", verifyToken, siteLogsController.bulkRemove);
router.get("/", verifyToken, siteLogsController.getAll);
router.post(
  "/",
  verifyToken,
  validate(createSiteLogSchema),
  siteLogsController.create,
);
router.get("/site/:siteId", verifyToken, siteLogsController.getBySite);
router.put(
  "/:id",
  verifyToken,
  validate(updateSiteLogSchema),
  siteLogsController.update,
);
router.delete("/:id", verifyToken, siteLogsController.remove);

export default router;
