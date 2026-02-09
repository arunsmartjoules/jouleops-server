import express from "express";
import { verifyToken } from "../middleware/auth.ts";
import pushTokenService from "../services/pushTokenService.ts";
import notificationSettingsService from "../services/notificationSettingsService.ts";
import pushNotificationService from "../services/pushNotificationService.ts";
import attendanceNotificationService from "../services/attendanceNotificationService.ts";

import { reloadAttendanceReminders } from "../jobs/attendanceReminderJob.ts";

const router = express.Router();

/**
 * Notification Routes
 * Base path: /api/notifications
 */

/**
 * Register a push token for a user's device
 * POST /api/notifications/register-token
 */
router.post("/register-token", verifyToken, async (req, res) => {
  try {
    const { pushToken, deviceId, platform } = req.body;
    const userId = req.user.user_id;

    if (!pushToken || !deviceId) {
      return res.status(400).json({
        success: false,
        error: "Push token and device ID are required",
      });
    }

    const result = await pushTokenService.registerPushToken(
      userId,
      pushToken,
      deviceId,
      platform,
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error registering push token:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Remove a push token (e.g., on logout)
 * DELETE /api/notifications/token
 */
router.delete("/token", verifyToken, async (req, res) => {
  try {
    const { pushToken } = req.body;

    if (!pushToken) {
      return res.status(400).json({
        success: false,
        error: "Push token is required",
      });
    }

    await pushTokenService.removeToken(pushToken);

    res.json({
      success: true,
      message: "Token removed successfully",
    });
  } catch (error) {
    console.error("Error removing push token:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get all notification settings
 * GET /api/notifications/settings
 */
router.get("/settings", verifyToken, async (req, res) => {
  try {
    const settings = await notificationSettingsService.getAllSettings();

    res.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error("Error getting notification settings:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Update check-in notification message (Admin only)
 * PUT /api/notifications/settings/check-in
 */
router.put("/settings/check-in", verifyToken, async (req, res) => {
  try {
    const { message, time } = req.body;
    const userId = req.user.user_id;
    const role = req.user.role;

    if (role !== "Admin" && role !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Unauthorized. Admin access required.",
      });
    }

    const results = {};

    if (message) {
      results.message = await notificationSettingsService.updateCheckInMessage(
        message,
        userId,
      );
    }

    if (time) {
      results.time = await notificationSettingsService.updateCheckInTime(
        time,
        userId,
      );
      await reloadAttendanceReminders();
    }

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error("Error updating check-in settings:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Update check-out notification message (Admin only)
 * PUT /api/notifications/settings/check-out
 */
router.put("/settings/check-out", verifyToken, async (req, res) => {
  try {
    const { message, time } = req.body;
    const userId = req.user.user_id;
    const role = req.user.role;

    if (role !== "Admin" && role !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Unauthorized. Admin access required.",
      });
    }

    const results = {};

    if (message) {
      results.message = await notificationSettingsService.updateCheckOutMessage(
        message,
        userId,
      );
    }

    if (time) {
      results.time = await notificationSettingsService.updateCheckOutTime(
        time,
        userId,
      );
      await reloadAttendanceReminders();
    }

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error("Error updating check-out settings:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Send custom notification (Admin only)
 * POST /api/notifications/send-custom
 */
router.post("/send-custom", verifyToken, async (req, res) => {
  try {
    const { title, body, recipients, userIds } = req.body;
    const userId = req.user.user_id;
    const role = req.user.role;

    if (role !== "Admin" && role !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Unauthorized. Admin access required.",
      });
    }

    if (!title || !body) {
      return res.status(400).json({
        success: false,
        error: "Title and body are required",
      });
    }

    let result;

    if (recipients === "all") {
      result = await pushNotificationService.sendNotificationToAll(
        title,
        body,
        { type: "custom" },
      );
    } else if (recipients === "selected" && userIds && userIds.length > 0) {
      result = await pushNotificationService.sendNotificationToUsers(
        userIds,
        title,
        body,
        { type: "custom" },
      );
    } else {
      return res.status(400).json({
        success: false,
        error: "Invalid recipients specified",
      });
    }

    res.json(result);
  } catch (error) {
    console.error("Error sending custom notification:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get notification logs (Admin only)
 * GET /api/notifications/logs
 */
router.get("/logs", verifyToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const role = req.user.role;
    const { page, limit, type, user_id } = req.query;

    if (role !== "Admin" && role !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Unauthorized. Admin access required.",
      });
    }

    const logs = await pushNotificationService.getNotificationLogs({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      type,
      userId: user_id,
    });

    res.json({
      success: true,
      ...logs,
    });
  } catch (error) {
    console.error("Error getting notification logs:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get user notification preferences
 * GET /api/notifications/preferences
 */
router.get("/preferences", verifyToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const preferences =
      await notificationSettingsService.getUserPreferences(userId);

    res.json({
      success: true,
      data: preferences,
    });
  } catch (error) {
    console.error("Error getting user preferences:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Update user notification preferences
 * PUT /api/notifications/preferences
 */
router.put("/preferences", verifyToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { attendance_notifications_enabled } = req.body;

    const preferences = await notificationSettingsService.updateUserPreferences(
      userId,
      { attendance_notifications_enabled },
    );

    res.json({
      success: true,
      data: preferences,
    });
  } catch (error) {
    console.error("Error updating user preferences:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Trigger attendance notifications manually (Admin only, for testing)
 * POST /api/notifications/trigger-attendance
 */
router.post("/trigger-attendance", verifyToken, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const role = req.user.role;
    const { type } = req.body; // 'check-in' or 'check-out'

    if (role !== "Admin" && role !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Unauthorized. Admin access required.",
      });
    }

    let result;
    if (type === "check-in") {
      result =
        await attendanceNotificationService.sendMissedCheckInNotifications();
    } else if (type === "check-out") {
      result =
        await attendanceNotificationService.sendMissedCheckOutNotifications();
    } else {
      return res.status(400).json({
        success: false,
        error: "Invalid type. Must be 'check-in' or 'check-out'",
      });
    }

    res.json(result);
  } catch (error) {
    console.error("Error triggering attendance notifications:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
