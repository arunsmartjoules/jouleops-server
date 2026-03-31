import { logger, queryOne } from "@jouleops/shared";
import cron from "node-cron";
import attendanceNotificationService from "../services/attendanceNotificationService.ts";

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

    // Fetch trigger configs directly from the database to ensure we have the latest values
    const punchInConfig = await queryOne(
      "SELECT threshold_value, is_enabled FROM notification_trigger_configs WHERE trigger_key = 'punch_in'",
    );
    const punchOutConfig = await queryOne(
      "SELECT threshold_value, is_enabled FROM notification_trigger_configs WHERE trigger_key = 'punch_out'",
    );

    const getTriggerTime = (config: any) => {
      if (!config || !config.is_enabled) return null;
      const hours = Math.floor(config.threshold_value / 60);
      const minutes = config.threshold_value % 60;
      return {
        hour: hours,
        minute: minutes,
        formatted: `${hours.toString().padStart(2, "0")}:${minutes
          .toString()
          .padStart(2, "0")}`,
      };
    };

    const checkInTime = getTriggerTime(punchInConfig);
    const checkOutTime = getTriggerTime(punchOutConfig);

    if (checkInTime) {
      // Cron format: minute hour day-of-month month day-of-week
      const cronTime = `${checkInTime.minute} ${checkInTime.hour} * * *`;

      checkInJob = cron.schedule(
        cronTime,
        async () => {
          logger.info(
            `[JOB] Running scheduled check-in reminders for ${checkInTime.formatted} IST`,
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
      logger.info(
        `[JOB] Scheduled check-in reminders at ${checkInTime.formatted} IST`,
      );
    } else {
      logger.warn(
        "[JOB] Check-in reminders are disabled or not configured in trigger table",
      );
    }

    if (checkOutTime) {
      const cronTime = `${checkOutTime.minute} ${checkOutTime.hour} * * *`;

      checkOutJob = cron.schedule(
        cronTime,
        async () => {
          logger.info(
            `[JOB] Running scheduled check-out reminders for ${checkOutTime.formatted} IST`,
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
      logger.info(
        `[JOB] Scheduled check-out reminders at ${checkOutTime.formatted} IST`,
      );
    } else {
      logger.warn(
        "[JOB] Check-out reminders are disabled or not configured in trigger table",
      );
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
