import express from "express";
import attendanceLogsController from "../controllers/attendanceLogsController.ts";
import {
  verifyToken,
  verifyApiKey,
  verifyAnyAuth,
} from "../middleware/auth.ts";

const router = express.Router();

/**
 * Attendance Logs Routes
 * Base path: /api/attendance
 */

router.post("/bulk-upsert", verifyAnyAuth, attendanceLogsController.bulkUpsert);
router.post("/", verifyAnyAuth, attendanceLogsController.create);
router.get("/", verifyAnyAuth, attendanceLogsController.getAll);
router.post("/check-in", verifyAnyAuth, attendanceLogsController.checkIn);
router.post("/:id/check-out", verifyAnyAuth, attendanceLogsController.checkOut);

// Location validation - check which sites a user can check in at based on their location
router.get(
  "/validate-location/:userId",
  verifyAnyAuth,
  attendanceLogsController.validateLocation,
);

// Get user's assigned sites with coordinates
router.get(
  "/user-sites/:userId",
  verifyAnyAuth,
  attendanceLogsController.getUserSites,
);

router.get(
  "/site/:siteCode",
  verifyAnyAuth,
  attendanceLogsController.getBySite,
);
router.get(
  "/site/:siteCode/report",
  verifyAnyAuth,
  attendanceLogsController.getReport,
);
router.get(
  "/overall-report",
  verifyAnyAuth,
  attendanceLogsController.getOverallReport,
);
router.get("/user/:userId", verifyAnyAuth, attendanceLogsController.getByUser);
router.get(
  "/user/:userId/today",
  verifyAnyAuth,
  attendanceLogsController.getTodayByUser,
);
router.put("/:id", verifyAnyAuth, attendanceLogsController.update);
router.delete("/:id", verifyAnyAuth, attendanceLogsController.remove);

export default router;
