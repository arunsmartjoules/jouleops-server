import express from "express";
import { verifyAnyAuth } from "../middleware/auth.ts";
import pushTokenService from "../services/pushTokenService.ts";
import notificationSettingsService from "../services/notificationSettingsService.ts";
import pushNotificationService from "../services/pushNotificationService.ts";
import attendanceNotificationService from "../services/attendanceNotificationService.ts";
import triggerConfigRepository from "../repositories/triggerConfigRepository.ts";
import notificationTemplateRepository from "../repositories/notificationTemplateRepository.ts";
import notificationExclusionRepository from "../repositories/notificationExclusionRepository.ts";

import { reloadAttendanceReminders } from "../jobs/attendanceReminderJob.ts";

const router = express.Router();

/**
 * Notification Routes
 * Base path: /api/notifications
 */

/**
 * Get all notification trigger configs
 * GET /api/notifications/triggers
 */
router.get("/triggers", verifyAnyAuth, async (_req, res) => {
  try {
    const data = await triggerConfigRepository.getAllTriggerConfigs();
    res.json({ success: true, data });
  } catch (error: any) {
    console.error("Error getting trigger configs:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Update a notification trigger config
 * PUT /api/notifications/triggers/:trigger_key
 */
router.put("/triggers/:trigger_key", verifyAnyAuth, async (req: any, res) => {
  try {
    const { trigger_key } = req.params;
    const { threshold_value, repeat_frequency_minutes, is_enabled } = req.body;

    const input: Record<string, any> = {};
    if (threshold_value !== undefined) input.threshold_value = threshold_value;
    if (repeat_frequency_minutes !== undefined) input.repeat_frequency_minutes = repeat_frequency_minutes;
    if (is_enabled !== undefined) input.is_enabled = is_enabled;

    // Validate before persisting
    const errors = triggerConfigRepository.validateTriggerConfigUpdate(trigger_key, input);
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: errors.map((e) => e.message).join("; "),
        details: errors,
      });
    }

    const updated = await triggerConfigRepository.updateTriggerConfig(trigger_key, input);
    if (!updated) {
      return res.status(404).json({ success: false, error: `Trigger '${trigger_key}' not found` });
    }

    res.json({ success: true, data: updated });
  } catch (error: any) {
    console.error("Error updating trigger config:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Register a push token for a user's device
 * POST /api/notifications/register-token
 */
router.post("/register-token", verifyAnyAuth, async (req: any, res) => {
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
  } catch (error: any) {
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
router.delete("/token", verifyAnyAuth, async (req, res) => {
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
  } catch (error: any) {
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
router.get("/settings", verifyAnyAuth, async (req, res) => {
  try {
    const settings = await notificationSettingsService.getAllSettings();

    res.json({
      success: true,
      data: settings,
    });
  } catch (error: any) {
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
router.put("/settings/check-in", verifyAnyAuth, async (req: any, res) => {
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

    const results: any = {};

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
  } catch (error: any) {
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
router.put("/settings/check-out", verifyAnyAuth, async (req: any, res) => {
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

    const results: any = {};

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
  } catch (error: any) {
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
router.post("/send-custom", verifyAnyAuth, async (req: any, res) => {
  try {
    const { title, body, recipients, userIds } = req.body;
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
  } catch (error: any) {
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
router.get("/logs", verifyAnyAuth, async (req: any, res) => {
  try {
    const role = req.user.role;
    const { page, limit, type, user_id }: any = req.query;

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
  } catch (error: any) {
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
router.get("/preferences", verifyAnyAuth, async (req: any, res) => {
  try {
    const userId = req.user.user_id;
    const preferences =
      await notificationSettingsService.getUserPreferences(userId);

    res.json({
      success: true,
      data: preferences,
    });
  } catch (error: any) {
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
router.put("/preferences", verifyAnyAuth, async (req: any, res) => {
  try {
    const userId = req.user.user_id;
    const requestBody = req.body || {};
    const { attendance_notifications_enabled, ticket_notifications_enabled } = requestBody;
    const hasAttendanceField = Object.prototype.hasOwnProperty.call(
      requestBody,
      "attendance_notifications_enabled",
    );
    const hasTicketField = Object.prototype.hasOwnProperty.call(
      requestBody,
      "ticket_notifications_enabled",
    );

    if (!hasAttendanceField && !hasTicketField) {
      return res.status(400).json({
        success: false,
        error:
          "At least one preference field is required: attendance_notifications_enabled or ticket_notifications_enabled",
      });
    }

    if (attendance_notifications_enabled === null || ticket_notifications_enabled === null) {
      return res.status(400).json({
        success: false,
        error: "Preference values cannot be null",
      });
    }

    if (
      (hasAttendanceField && typeof attendance_notifications_enabled !== "boolean") ||
      (hasTicketField && typeof ticket_notifications_enabled !== "boolean")
    ) {
      return res.status(400).json({
        success: false,
        error: "Preference values must be boolean",
      });
    }

    const preferences = await notificationSettingsService.updateUserPreferences(
      userId,
      { attendance_notifications_enabled, ticket_notifications_enabled },
    );

    res.json({
      success: true,
      data: preferences,
    });
  } catch (error: any) {
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
router.post("/trigger-attendance", verifyAnyAuth, async (req: any, res) => {
  try {
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
  } catch (error: any) {
    console.error("Error triggering attendance notifications:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get all notification templates
 * GET /api/notifications/templates
 */
router.get("/templates", verifyAnyAuth, async (_req, res) => {
  try {
    const data = await notificationTemplateRepository.getAllTemplates();
    res.json({ success: true, data });
  } catch (error: any) {
    console.error("Error getting notification templates:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Create a notification template
 * POST /api/notifications/templates
 */
router.post("/templates", verifyAnyAuth, async (req, res) => {
  try {
    const { trigger_key, template_name, title_template, body_template, is_active } = req.body;

    const errors = notificationTemplateRepository.validateCreateTemplateInput({
      trigger_key,
      template_name,
      title_template,
      body_template,
    });

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: errors.map((e) => e.message).join("; "),
        details: errors,
      });
    }

    const data = await notificationTemplateRepository.createTemplate({
      trigger_key,
      template_name,
      title_template,
      body_template,
      is_active,
    });

    res.status(201).json({ success: true, data });
  } catch (error: any) {
    console.error("Error creating notification template:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Update a notification template
 * PUT /api/notifications/templates/:id
 */
router.put("/templates/:id", verifyAnyAuth, async (req: any, res) => {
  try {
    const { id } = req.params as { id: string };
    const { trigger_key, template_name, title_template, body_template, is_active } = req.body;

    const input: Record<string, any> = {};
    if (trigger_key !== undefined) input.trigger_key = trigger_key;
    if (template_name !== undefined) input.template_name = template_name;
    if (title_template !== undefined) input.title_template = title_template;
    if (body_template !== undefined) input.body_template = body_template;
    if (is_active !== undefined) input.is_active = is_active;

    const updated = await notificationTemplateRepository.updateTemplate(id, input);
    if (!updated) {
      return res.status(404).json({ success: false, error: `Template '${id}' not found` });
    }

    res.json({ success: true, data: updated });
  } catch (error: any) {
    console.error("Error updating notification template:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Delete a notification template
 * DELETE /api/notifications/templates/:id
 */
router.delete("/templates/:id", verifyAnyAuth, async (req: any, res) => {
  try {
    const { id } = req.params as { id: string };
    const deleted = await notificationTemplateRepository.deleteTemplate(id);

    if (!deleted) {
      return res.status(404).json({ success: false, error: `Template '${id}' not found` });
    }

    res.json({ success: true, data: { id } });
  } catch (error: any) {
    console.error("Error deleting notification template:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get all notification exclusions (joined with users)
 * GET /api/notifications/exclusions
 */
router.get("/exclusions", verifyAnyAuth, async (_req, res) => {
  try {
    const data = await notificationExclusionRepository.getAllExclusions();
    res.json({ success: true, data });
  } catch (error: any) {
    console.error("Error getting notification exclusions:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Add a user to the exclusion list
 * POST /api/notifications/exclusions
 */
router.post("/exclusions", verifyAnyAuth, async (req, res) => {
  try {
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ success: false, error: "user_id is required" });
    }

    const data = await notificationExclusionRepository.addExclusion(user_id);

    if (data === null) {
      return res.status(409).json({
        success: false,
        error: "User is already in the exclusion list",
        alreadyExcluded: true,
      });
    }

    res.status(201).json({ success: true, data });
  } catch (error: any) {
    console.error("Error adding notification exclusion:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Remove a user from the exclusion list
 * DELETE /api/notifications/exclusions/:id
 */
router.delete("/exclusions/:id", verifyAnyAuth, async (req, res) => {
  try {
    const { id } = req.params as { id: string };
    const deleted = await notificationExclusionRepository.removeExclusion(id);

    if (!deleted) {
      return res.status(404).json({ success: false, error: `Exclusion '${id}' not found` });
    }

    res.json({ success: true, data: { id } });
  } catch (error: any) {
    console.error("Error removing notification exclusion:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
