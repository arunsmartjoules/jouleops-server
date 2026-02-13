import { logger } from "@smartops/shared";
import cron from "node-cron";
import attendanceNotificationService from "../services/attendanceNotificationService.ts";
import notificationSettingsService from "../services/notificationSettingsService.ts";

let checkInJob: any = null;
let checkOutJob: any = null;

/**
 * Initializes or re-initializes attendance reminder jobs based on database settings
 */
export const initAttendanceReminders = async () => {
  try {
    logger.info("Initializing attendance reminder jobs...");

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
          logger.info(
            `[JOB] Running scheduled check-in reminders for ${checkInTime} IST`,
          );
          try {
            await attendanceNotificationService.sendMissedCheckInNotifications();
          } catch (err) {
            logger.error("[JOB] Error in check-in reminder job", {
              error: err,
            });
          }
        },
        {
          timezone: "Asia/Kolkata",
        },
      );
      logger.info(`[JOB] Scheduled check-in reminders at ${checkInTime} IST`);
    } else {
      logger.warn("[JOB] No valid check-in time configured for reminders");
    }

    if (checkOutTime && checkOutTime.includes(":")) {
      const [hour, minute] = checkOutTime.split(":");
      const cronTime = `${parseInt(minute)} ${parseInt(hour)} * * *`;

      checkOutJob = cron.schedule(
        cronTime,
        async () => {
          logger.info(
            `[JOB] Running scheduled check-out reminders for ${checkOutTime} IST`,
          );
          try {
            await attendanceNotificationService.sendMissedCheckOutNotifications();
          } catch (err) {
            logger.error("[JOB] Error in check-out reminder job", {
              error: err,
            });
          }
        },
        {
          timezone: "Asia/Kolkata",
        },
      );
      logger.info(`[JOB] Scheduled check-out reminders at ${checkOutTime} IST`);
    } else {
      logger.warn("[JOB] No valid check-out time configured for reminders");
    }
  } catch (error) {
    logger.error("[JOB] Failed to initialize attendance reminders", { error });
  }
};

/**
 * Reset scheduler - can be called when settings are updated via API
 */
export const reloadAttendanceReminders = async () => {
  logger.info("[JOB] Reloading attendance reminder schedules...");
  await initAttendanceReminders();
};
