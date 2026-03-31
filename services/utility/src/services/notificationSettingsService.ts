import { query, queryOne } from "@jouleops/shared";

export interface UserPreferences {
  user_id: string;
  attendance_notifications_enabled: boolean;
  ticket_notifications_enabled: boolean;
  updated_at?: string;
}

/**
 * Get a specific notification setting by key
 */
export const getSetting = async (key: string): Promise<string | null> => {
  const result = await queryOne<{ setting_value: string }>(
    "SELECT * FROM notification_settings WHERE setting_key = $1",
    [key],
  );
  return result?.setting_value || null;
};

/**
 * Get all notification settings
 */
export const getAllSettings = async (): Promise<Record<string, string>> => {
  const data = await query<{ setting_key: string; setting_value: string }>(
    "SELECT * FROM notification_settings",
  );

  // Convert to key-value object
  const settings: Record<string, string> = {};
  data.forEach((item) => {
    settings[item.setting_key] = item.setting_value;
  });

  return settings;
};

/**
 * Update a notification setting
 */
export const updateSetting = async (
  key: string,
  value: string,
  updatedBy: string,
): Promise<any> => {
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
export const getCheckInMessage = async (): Promise<string | null> => {
  return await getSetting("check_in_message");
};

/**
 * Get check-out notification message
 */
export const getCheckOutMessage = async (): Promise<string | null> => {
  return await getSetting("check_out_message");
};

/**
 * Get check-in reminder time (HH:MM format)
 */
export const getCheckInTime = async (): Promise<string | null> => {
  return await getSetting("check_in_time");
};

/**
 * Get check-out reminder time (HH:MM format)
 */
export const getCheckOutTime = async (): Promise<string | null> => {
  return await getSetting("check_out_time");
};

/**
 * Update check-in notification message
 */
export const updateCheckInMessage = async (
  message: string,
  updatedBy: string,
): Promise<any> => {
  return await updateSetting("check_in_message", message, updatedBy);
};

/**
 * Update check-out notification message
 */
export const updateCheckOutMessage = async (
  message: string,
  updatedBy: string,
): Promise<any> => {
  return await updateSetting("check_out_message", message, updatedBy);
};

/**
 * Update check-in reminder time
 */
export const updateCheckInTime = async (
  time: string,
  updatedBy: string,
): Promise<any> => {
  return await updateSetting("check_in_time", time, updatedBy);
};

/**
 * Update check-out reminder time
 */
export const updateCheckOutTime = async (
  time: string,
  updatedBy: string,
): Promise<any> => {
  return await updateSetting("check_out_time", time, updatedBy);
};

/**
 * Get user notification preferences
 */
export const getUserPreferences = async (
  userId: string,
): Promise<UserPreferences> => {
  const data = await queryOne<UserPreferences>(
    "SELECT * FROM user_notification_preferences WHERE user_id = $1",
    [userId],
  );

  // Return default preferences if not set
  if (!data) {
    return {
      user_id: userId,
      attendance_notifications_enabled: true,
      ticket_notifications_enabled: true,
    };
  }

  return {
    ...data,
    ticket_notifications_enabled: data.ticket_notifications_enabled ?? true,
  };
};

/**
 * Update user notification preferences
 */
export const updateUserPreferences = async (
  userId: string,
  preferences: Partial<UserPreferences>,
): Promise<UserPreferences | null> => {
  const {
    attendance_notifications_enabled,
    ticket_notifications_enabled,
  } = preferences;

  const result = await queryOne<UserPreferences>(
    `
        INSERT INTO user_notification_preferences (user_id, attendance_notifications_enabled, ticket_notifications_enabled, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (user_id) DO UPDATE SET
        attendance_notifications_enabled = CASE 
            WHEN EXCLUDED.attendance_notifications_enabled IS NULL THEN user_notification_preferences.attendance_notifications_enabled 
            ELSE EXCLUDED.attendance_notifications_enabled 
        END,
        ticket_notifications_enabled = CASE 
            WHEN EXCLUDED.ticket_notifications_enabled IS NULL THEN user_notification_preferences.ticket_notifications_enabled 
            ELSE EXCLUDED.ticket_notifications_enabled 
        END,
        updated_at = NOW()
        RETURNING *
    `,
    [
      userId,
      attendance_notifications_enabled !== undefined ? attendance_notifications_enabled : null,
      ticket_notifications_enabled !== undefined ? ticket_notifications_enabled : null,
    ],
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
