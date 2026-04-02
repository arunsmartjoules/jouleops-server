import express from "express";
import logMasterSiteController from "../controllers/logMasterSiteController.ts";
import { verifyAnyAuth } from "../middleware/auth.ts";

const router = express.Router();

/**
 * Log Master Site Routes
 * Base path: /api/log-master-site
 *
 * Auth: JWT (Authorization: Bearer <token>) OR internal API key (x-api-key: <INTERNAL_API_KEY>)
 *
 * GET    /                      List entries; filter via ?log_id=&log_name=&frequency=&site_id=&search=
 * POST   /                      Create a new entry
 * PATCH  /:id                   Partially update an entry
 * DELETE /:id                   Delete an entry
 * POST   /bulk-delete           Bulk delete { ids: string[] }
 */

router.get("/", verifyAnyAuth, logMasterSiteController.getAll);
router.post("/", verifyAnyAuth, logMasterSiteController.create);
router.post("/bulk-delete", verifyAnyAuth, logMasterSiteController.bulkDelete);
router.patch("/:id", verifyAnyAuth, logMasterSiteController.update);
router.delete("/:id", verifyAnyAuth, logMasterSiteController.remove);

export default router;
