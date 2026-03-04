import express from "express";
import pmResponseController from "../controllers/pmResponseController.ts";
import { verifyAnyAuth, requireRole } from "../middleware/auth.ts";

const router = express.Router();

/**
 * PM Response Routes (UUID version)
 * Base path: /api/pm-response
 */

router.get("/", verifyAnyAuth, pmResponseController.getByInstance); // Assuming get by instance by default if no params
router.post("/", verifyAnyAuth, pmResponseController.create);
router.get(
  "/instance/:instanceId",
  verifyAnyAuth,
  pmResponseController.getByInstance,
);
router.get("/:id", verifyAnyAuth, pmResponseController.getById);
router.put(
  "/:id",
  verifyAnyAuth,
  requireRole(["admin", "superadmin"]),
  pmResponseController.update,
);
router.delete(
  "/:id",
  verifyAnyAuth,
  requireRole(["admin", "superadmin"]),
  pmResponseController.remove,
);

export default router;
