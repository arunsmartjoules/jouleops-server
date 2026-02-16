import express from "express";
import siteLogsController from "../controllers/siteLogsController.ts";
import { verifyAnyAuth } from "../middleware/auth.ts";

import {
  validate,
  createSiteLogSchema,
  updateSiteLogSchema,
} from "@jouleops/shared";

const router = express.Router();

/**
 * Site Logs Routes
 * Base path: /api/site-logs
 */

router.post("/bulk-delete", verifyAnyAuth, siteLogsController.bulkRemove);
router.get("/", verifyAnyAuth, siteLogsController.getAll);
router.post(
  "/",
  verifyAnyAuth,
  validate(createSiteLogSchema),
  siteLogsController.create,
);
router.get("/site/:siteId", verifyAnyAuth, siteLogsController.getBySite);
router.put(
  "/:id",
  verifyAnyAuth,
  validate(updateSiteLogSchema),
  siteLogsController.update,
);
router.delete("/:id", verifyAnyAuth, siteLogsController.remove);

export default router;
