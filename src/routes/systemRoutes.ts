import express from "express";
import systemController from "../controllers/systemController.js";
// import { authenticate, requireRole } from "../middleware/authMiddleware.js"; // Assuming auth middleware exists

const router = express.Router();

// router.use(authenticate);
// router.use(requireRole("super_admin")); // Only super admins should see system metrics

router.get("/metrics", systemController.getMetrics);

export default router;
