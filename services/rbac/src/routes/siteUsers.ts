import express from "express";
import siteUsersController from "../controllers/siteUsersController.ts";
import { verifyAnyAuth, requireRole } from "../middleware/auth.ts";

const router = express.Router();

/**
 * Site Users Routes
 * Base path: /api/site-users
 */

router.get("/", verifyAnyAuth, siteUsersController.getAll);
router.get("/site/:siteCode", verifyAnyAuth, siteUsersController.getBySite);
router.get("/user/:userId", verifyAnyAuth, siteUsersController.getByUser);

router.post(
  "/",
  verifyAnyAuth,
  requireRole(["admin", "superadmin"]),
  siteUsersController.assignUser,
);

router.put(
  "/:siteCode/:userId",
  verifyAnyAuth,
  requireRole(["admin", "superadmin"]),
  siteUsersController.updateAssignment,
);

router.delete(
  "/:siteCode/:userId",
  verifyAnyAuth,
  requireRole(["admin", "superadmin"]),
  siteUsersController.removeAssignment,
);

export default router;
