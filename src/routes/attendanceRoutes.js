import express from "express";
import attendanceLogsController from "../controllers/attendanceLogsController.js";
import { verifyToken, verifyApiKey } from "../middleware/auth.js";

const router = express.Router();

/**
 * Attendance Logs Routes
 * Base path: /api/attendance
 */

router.post("/", verifyToken, attendanceLogsController.create);
router.post("/check-in", verifyToken, attendanceLogsController.checkIn);
router.post("/:id/check-out", verifyToken, attendanceLogsController.checkOut);

// Location validation - check which sites a user can check in at based on their location
router.get(
  "/validate-location/:userId",
  verifyToken,
  attendanceLogsController.validateLocation,
);

// Get user's assigned sites with coordinates
router.get(
  "/user-sites/:userId",
  verifyToken,
  attendanceLogsController.getUserSites,
);

router.get("/site/:siteId", verifyToken, attendanceLogsController.getBySite);
router.get(
  "/site/:siteId/report",
  verifyToken,
  attendanceLogsController.getReport,
);
router.get(
  "/overall-report",
  verifyToken,
  attendanceLogsController.getOverallReport,
);
router.get("/user/:userId", verifyToken, attendanceLogsController.getByUser);
router.get(
  "/user/:userId/today",
  verifyToken,
  attendanceLogsController.getTodayByUser,
);
router.put("/:id", verifyToken, attendanceLogsController.update);
router.delete("/:id", verifyToken, attendanceLogsController.remove);

export default router;
