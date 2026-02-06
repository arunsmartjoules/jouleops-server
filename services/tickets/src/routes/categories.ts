import express from "express";
import complaintCategoryController from "../controllers/complaintCategoryController.ts";
import { verifyToken } from "../middleware/auth.ts";

const router = express.Router();

/**
 * Complaint Category Routes
 * Base path: /api/complaint-categories
 */

// Get all categories
router.get("/", verifyToken, complaintCategoryController.getAll);

// Get category by ID
router.get("/:id", verifyToken, complaintCategoryController.getById);

// Create a new category (admin only)
router.post("/", verifyToken, complaintCategoryController.create);

// Update a category (admin only)
router.put("/:id", verifyToken, complaintCategoryController.update);

// Delete a category (admin only)
router.delete("/:id", verifyToken, complaintCategoryController.remove);

export default router;
