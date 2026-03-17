import express from "express";
import usersController from "../controllers/usersController.ts";
import { verifyAnyAuth } from "../middleware/auth.ts";

const router = express.Router();

/**
 * Users Routes
 * Base path: /api/users
 * Merged from profiles service.
 */

// Bulk operations (must come before /:userId to avoid param clash)
router.post("/bulk-upsert", verifyAnyAuth, usersController.bulkUpsert);
router.post("/bulk-update", verifyAnyAuth, usersController.bulkUpdate);
router.post("/bulk-delete", verifyAnyAuth, usersController.bulkRemove);

// Standard CRUD
router.post("/", verifyAnyAuth, usersController.create);
router.get("/", verifyAnyAuth, usersController.getAll);
router.get("/phone/:phone", verifyAnyAuth, usersController.getByPhone);
router.get("/site/:siteCode", verifyAnyAuth, usersController.getBySite);
router.get("/:userId", verifyAnyAuth, usersController.getById);
router.put("/:userId", verifyAnyAuth, usersController.update);
router.delete("/:userId", verifyAnyAuth, usersController.remove);

export default router;
