import { query, queryOne } from "@smartops/shared";

/**
 * Get a specific notification setting by key
 */
export const getSetting = async (key) => {
  const result = await queryOne(
    "SELECT * FROM notification_settings WHERE setting_key = $1",
    [key],
  );
  return result?.setting_value || null;
};

/**
 * Get all notification settings
 */
export const getAllSettings = async () => {
  const data = await query("SELECT * FROM notification_settings");

  // Convert to key-value object
  const settings = {};
  data.forEach((item) => {
    settings[item.setting_key] = item.setting_value;
  });

  return settings;
};

/**
 * Update a notification setting
 */
export const updateSetting = async (key, value, updatedBy) => {
  const result = await queryOne(
    `
        INSERT INTO notification_settings (setting_key, setting_value, updated_at, updated_by)
        VALUES ($1, $2, NOW(), $3)
        ON CONFLICT (setting_key) DO UPDATE SET
        setting_value = EXCLUDED.setting_value,
        updated_at = NOW(),
        updated_by = EXCLUDED.updated_by
        RETURNING *
    `,
    [key, value, updatedBy],
  );
  return result;
};

/**
 * Get check-in notification message
 */
export const getCheckInMessage = async () => {
  return await getSetting("check_in_message");
};

/**
 * Get check-out notification message
 */
export const getCheckOutMessage = async () => {
  return await getSetting("check_out_message");
};

/**
 * Get check-in reminder time (HH:MM format)
 */
export const getCheckInTime = async () => {
  return await getSetting("check_in_time");
};

/**
 * Get check-out reminder time (HH:MM format)
 */
export const getCheckOutTime = async () => {
  return await getSetting("check_out_time");
};

/**
 * Update check-in notification message
 */
export const updateCheckInMessage = async (message, updatedBy) => {
  return await updateSetting("check_in_message", message, updatedBy);
};

/**
 * Update check-out notification message
 */
export const updateCheckOutMessage = async (message, updatedBy) => {
  return await updateSetting("check_out_message", message, updatedBy);
};

/**
 * Update check-in reminder time
 */
export const updateCheckInTime = async (time, updatedBy) => {
  return await updateSetting("check_in_time", time, updatedBy);
};

/**
 * Update check-out reminder time
 */
export const updateCheckOutTime = async (time, updatedBy) => {
  return await updateSetting("check_out_time", time, updatedBy);
};

/**
 * Get user notification preferences
 */
export const getUserPreferences = async (userId) => {
  const data = await queryOne(
    "SELECT * FROM user_notification_preferences WHERE user_id = $1",
    [userId],
  );

  // Return default preferences if not set
  if (!data) {
    return {
      user_id: userId,
      attendance_notifications_enabled: true,
    };
  }

  return data;
};

/**
 * Update user notification preferences
 */
export const updateUserPreferences = async (userId, preferences) => {
  const { attendance_notifications_enabled } = preferences;
  const result = await queryOne(
    `
        INSERT INTO user_notification_preferences (user_id, attendance_notifications_enabled, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (user_id) DO UPDATE SET
        attendance_notifications_enabled = EXCLUDED.attendance_notifications_enabled,
        updated_at = NOW()
        RETURNING *
    `,
    [userId, attendance_notifications_enabled ?? true],
  );
  return result;
};

export default {
  getSetting,
  getAllSettings,
  updateSetting,
  getCheckInMessage,
  getCheckOutMessage,
  getCheckInTime,
  getCheckOutTime,
  updateCheckInMessage,
  updateCheckOutMessage,
  updateCheckInTime,
  updateCheckOutTime,
  getUserPreferences,
  updateUserPreferences,
};
