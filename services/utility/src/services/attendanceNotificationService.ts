import { query, queryOne } from "@jouleops/shared";
import { sendNotificationToUser } from "./pushNotificationService.ts";
import {
  getCheckInMessage,
  getCheckOutMessage,
  getUserPreferences,
} from "./notificationSettingsService.ts";

const getTodayDate = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

/**
 * Find users who haven't checked in by the specified time
 * @returns Array of user IDs who missed check-in
 */
export const findMissedCheckIns = async () => {
  // Get all active users
  const users = await query(
    "SELECT user_id, name, work_location_type FROM users WHERE is_active = true",
  );
  const missedUsers = [];
  const today = getTodayDate();

  for (const user of users) {
    // Skip if work location type is not set (might be admins)
    if (!user.work_location_type) continue;

    // Check if user has checked in today
    const attendance = await queryOne(
      "SELECT * FROM attendance_logs WHERE user_id = $1 AND date = $2",
      [user.user_id, today],
    );

    if (!attendance) {
      // User hasn't checked in
      missedUsers.push({ id: user.user_id, name: user.name });
    }
  }

  return missedUsers;
};

/**
 * Find users who checked in but haven't checked out by the specified time
 * @returns Array of user IDs who missed check-out
 */
export const findMissedCheckOuts = async () => {
  const today = getTodayDate();

  // Find attendance records with check-in but no check-out for today, joining with users to get names
  const attendanceRecords = await query(
    `SELECT al.user_id as id, u.name 
     FROM attendance_logs al
     JOIN users u ON al.user_id = u.user_id
     WHERE al.date = $1 AND al.check_in_time IS NOT NULL AND al.check_out_time IS NULL`,
    [today],
  );

  return attendanceRecords.map((record) => ({
    id: record.id,
    name: record.name,
  }));
};

/**
 * Send check-in reminder notifications to users who haven't checked in
 */
export const sendMissedCheckInNotifications = async () => {
  try {
    const missedUsers = (await findMissedCheckIns()) as {
      id: string;
      name: string;
    }[];

    if (missedUsers.length === 0) {
      console.log("No users found who missed check-in");
      return { success: true, count: 0 };
    }

    const baseMessage = (await getCheckInMessage()) || "Don't forget to check in!";
    let sentCount = 0;

    for (const user of missedUsers) {
      // Check user preferences
      const preferences = await getUserPreferences(user.id);

      if (!preferences.attendance_notifications_enabled) {
        console.log(`User ${user.id} has disabled attendance notifications`);
        continue;
      }

      // PREVENTION: Check if check-in reminder was already sent today
      const alreadySent = await queryOne(
        `SELECT id FROM notification_logs 
         WHERE user_id = $1 
         AND notification_type = 'check_in_reminder' 
         AND sent_at::date = CURRENT_DATE
         AND status = 'sent'
         LIMIT 1`,
        [user.id]
      );

      if (alreadySent) {
        console.log(`Check-in reminder already sent today for user ${user.id}`);
        continue;
      }

      // Replace placeholders
      const personalizedMessage = baseMessage.replace(
        /{{name}}/g,
        user.name || "there"
      );

      const result = await sendNotificationToUser(
        user.id,
        "Check-In Reminder",
        personalizedMessage,
        { type: "check_in_reminder", screen: "attendance" }
      );

      if (result.success) {
        sentCount++;
      }
    }

    console.log(`Sent ${sentCount} check-in reminder notifications`);
    return { success: true, count: sentCount };
  } catch (error: any) {
    console.error("Error sending check-in notifications:", error);
    return { success: false, error: error.message };
  }
};

/**
 * Send check-out reminder notifications to users who haven't checked out
 */
export const sendMissedCheckOutNotifications = async () => {
  try {
    const missedUsers = (await findMissedCheckOuts()) as {
      id: string;
      name: string;
    }[];

    if (missedUsers.length === 0) {
      console.log("No users found who missed check-out");
      return { success: true, count: 0 };
    }

    const baseMessage =
      (await getCheckOutMessage()) || "Remember to check out!";
    let sentCount = 0;

    for (const user of missedUsers) {
      // Check user preferences
      const preferences = await getUserPreferences(user.id);

      if (!preferences.attendance_notifications_enabled) {
        console.log(`User ${user.id} has disabled attendance notifications`);
        continue;
      }

      // PREVENTION: Check if check-out reminder was already sent today
      const alreadySent = await queryOne(
        `SELECT id FROM notification_logs 
         WHERE user_id = $1 
         AND notification_type = 'check_out_reminder' 
         AND sent_at::date = CURRENT_DATE
         AND status = 'sent'
         LIMIT 1`,
        [user.id]
      );

      if (alreadySent) {
        console.log(`Check-out reminder already sent today for user ${user.id}`);
        continue;
      }

      // Replace placeholders
      const personalizedMessage = baseMessage.replace(
        /{{name}}/g,
        user.name || "there"
      );

      const result = await sendNotificationToUser(
        user.id,
        "Check-Out Reminder",
        personalizedMessage,
        { type: "check_out_reminder", screen: "attendance" }
      );

      if (result.success) {
        sentCount++;
      }
    }

    console.log(`Sent ${sentCount} check-out reminder notifications`);
    return { success: true, count: sentCount };
  } catch (error: any) {
    console.error("Error sending check-out notifications:", error);
    return { success: false, error: error.message };
  }
};

export default {
  findMissedCheckIns,
  findMissedCheckOuts,
  sendMissedCheckInNotifications,
  sendMissedCheckOutNotifications,
};
