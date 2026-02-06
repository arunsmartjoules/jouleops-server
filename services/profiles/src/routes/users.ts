import express from "express";
import usersController from "../controllers/usersController.ts";
import { verifyToken, verifyApiKey } from "../middleware/auth.ts";

const router = express.Router();

/**
 * Users Routes
 * Base path: /api/users
 */

router.post("/", verifyToken, usersController.create);
router.get("/", verifyToken, usersController.getAll);
router.get("/phone/:phone", verifyApiKey, usersController.getByPhone);
router.get("/site/:siteId", verifyToken, usersController.getBySite);
router.get("/:userId", verifyToken, usersController.getById);
router.put("/:userId", verifyToken, usersController.update);
router.delete("/:userId", verifyToken, usersController.remove);

// Bulk operations
router.post("/bulk-update", verifyToken, usersController.bulkUpdate);
router.post("/bulk-delete", verifyToken, usersController.bulkRemove);

export default router;
