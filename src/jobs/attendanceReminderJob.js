import cron from "node-cron";
import attendanceNotificationService from "../services/attendanceNotificationService.js";
import notificationSettingsService from "../services/notificationSettingsService.js";

let checkInJob = null;
let checkOutJob = null;

/**
 * Initializes or re-initializes attendance reminder jobs based on database settings
 */
export const initAttendanceReminders = async () => {
  try {
    console.log("Initializing attendance reminder jobs...");

    // Stop existing jobs if they exist to allow re-initialization
    if (checkInJob) {
      checkInJob.stop();
      checkInJob = null;
    }
    if (checkOutJob) {
      checkOutJob.stop();
      checkOutJob = null;
    }

    const checkInTime = await notificationSettingsService.getCheckInTime();
    const checkOutTime = await notificationSettingsService.getCheckOutTime();

    if (checkInTime && checkInTime.includes(":")) {
      const [hour, minute] = checkInTime.split(":");
      // Cron format: minute hour day-of-month month day-of-week
      const cronTime = `${parseInt(minute)} ${parseInt(hour)} * * *`;

      checkInJob = cron.schedule(
        cronTime,
        async () => {
          console.log(
            `[JOB] Running scheduled check-in reminders for ${checkInTime} IST`,
          );
          try {
            await attendanceNotificationService.sendMissedCheckInNotifications();
          } catch (err) {
            console.error("[JOB] Error in check-in reminder job:", err);
          }
        },
        {
          scheduled: true,
          timezone: "Asia/Kolkata",
        },
      );
      console.log(`[JOB] Scheduled check-in reminders at ${checkInTime} IST`);
    } else {
      console.warn("[JOB] No valid check-in time configured for reminders");
    }

    if (checkOutTime && checkOutTime.includes(":")) {
      const [hour, minute] = checkOutTime.split(":");
      const cronTime = `${parseInt(minute)} ${parseInt(hour)} * * *`;

      checkOutJob = cron.schedule(
        cronTime,
        async () => {
          console.log(
            `[JOB] Running scheduled check-out reminders for ${checkOutTime} IST`,
          );
          try {
            await attendanceNotificationService.sendMissedCheckOutNotifications();
          } catch (err) {
            console.error("[JOB] Error in check-out reminder job:", err);
          }
        },
        {
          scheduled: true,
          timezone: "Asia/Kolkata",
        },
      );
      console.log(`[JOB] Scheduled check-out reminders at ${checkOutTime} IST`);
    } else {
      console.warn("[JOB] No valid check-out time configured for reminders");
    }
  } catch (error) {
    console.error("[JOB] Failed to initialize attendance reminders:", error);
  }
};

/**
 * Reset scheduler - can be called when settings are updated via API
 */
export const reloadAttendanceReminders = async () => {
  console.log("[JOB] Reloading attendance reminder schedules...");
  await initAttendanceReminders();
};

export default {
  initAttendanceReminders,
  reloadAttendanceReminders,
};
