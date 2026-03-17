import express from "express";
import complaintCategoryController from "../controllers/complaintCategoryController.ts";
import { verifyAnyAuth } from "../middleware/auth.ts";

const router = express.Router();

/**
 * Complaint Category Routes
 * Base path: /api/complaint-categories
 */

// Get all categories
router.get("/", verifyAnyAuth, complaintCategoryController.getAll);

// Bulk upsert categories
router.post("/bulk-upsert", verifyAnyAuth, complaintCategoryController.bulkUpsert);

// Get category by ID
router.get("/:id", verifyAnyAuth, complaintCategoryController.getById);

// Create a new category (admin only)
router.post("/", verifyAnyAuth, complaintCategoryController.create);

// Update a category (admin only)
router.put("/:id", verifyAnyAuth, complaintCategoryController.update);

// Delete a category (admin only)
router.delete("/:id", verifyAnyAuth, complaintCategoryController.remove);

export default router;
