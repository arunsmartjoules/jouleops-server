/**
 * Notification Scheduler Job
 *
 * Runs on a configurable cron interval (default: every minute). On each tick:
 *   1. Fetches trigger configs, templates, exclusions, and device tokens from DB.
 *   2. Evaluates time-based triggers (punch_in, punch_out).
 *   3. Evaluates duration-based triggers (complaint_open, complaint_inprogress).
 *   4. Applies exclusion filter.
 *   5. Resolves the active template; writes suppressed log if inactive/missing.
 *   6. Resolves {{variable}} placeholders.
 *   7. Dispatches via FCM/APNs for each user's device token.
 *   8. Writes a log entry for every outcome.
 *
 * Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 5.2
 */

import { logger, query, queryOne } from "@jouleops/shared";
import cron from "node-cron";

import { getAllTriggerConfigs } from "../repositories/triggerConfigRepository.ts";
import { getAllTemplates } from "../repositories/notificationTemplateRepository.ts";
import { getAllExclusions } from "../repositories/notificationExclusionRepository.ts";

import { getPunchInEligibleUsers, getPunchOutEligibleUsers } from "../utils/attendanceEligibility.ts";
import { getEligibleComplaints } from "../utils/durationTriggerEvaluator.ts";
import { filterExcludedUsers, getActiveTemplate, resolvePlaceholders } from "../utils/notificationFilters.ts";
import { dispatchToToken } from "../utils/pushDispatcher.ts";
import type { DeviceToken, DispatchDb, NotificationLogEntry } from "../utils/pushDispatcher.ts";
import type { User } from "../utils/attendanceEligibility.ts";
import type { Complaint, NotificationLog } from "../utils/durationTriggerEvaluator.ts";

// ---------------------------------------------------------------------------
// DB helpers — thin wrappers so the scheduler stays readable
// ---------------------------------------------------------------------------

/** Fetch all active users */
async function fetchActiveUsers(): Promise<User[]> {
  return query<User>(
    `SELECT user_id FROM users WHERE is_active = true`,
  );
}

/** Fetch today's attendance records (IST date) */
async function fetchTodayAttendance(): Promise<
  { user_id: string; punch_in_time: string | null; punch_out_time: string | null }[]
> {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return query(
    `SELECT user_id, check_in_time AS punch_in_time, check_out_time AS punch_out_time
     FROM attendance_logs
     WHERE date = $1`,
    [today],
  );
}

/** Fetch complaints currently in a given status */
async function fetchComplaintsByStatus(status: string): Promise<Complaint[]> {
  return query<Complaint>(
    `SELECT complaint_id, status, status_changed_at
     FROM complaints
     WHERE status = $1`,
    [status],
  );
}

/** Fetch recent notification logs for a trigger key (last 24 h to bound the query) */
async function fetchRecentLogs(triggerKey: string): Promise<NotificationLog[]> {
  return query<NotificationLog>(
    `SELECT complaint_id, trigger_key, sent_at
     FROM notification_logs
     WHERE trigger_key = $1
       AND sent_at >= NOW() - INTERVAL '24 hours'`,
    [triggerKey],
  );
}

/** Fetch all device tokens for a set of user IDs */
async function fetchDeviceTokens(userIds: string[]): Promise<DeviceToken[]> {
  if (userIds.length === 0) return [];
  return query<DeviceToken>(
    `SELECT user_id, token, platform
     FROM device_tokens
     WHERE user_id = ANY($1)`,
    [userIds],
  );
}

/** Write a notification log entry to the DB */
async function writeNotificationLog(log: NotificationLogEntry): Promise<void> {
  try {
    await queryOne(
      `INSERT INTO notification_logs
         (trigger_key, user_id, title, body, status, failure_reason, platform)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        log.trigger_key,
        log.user_id,
        log.title ?? null,
        log.body ?? null,
        log.status,
        log.failure_reason ?? null,
        log.platform ?? null,
      ],
    );
  } catch (err) {
    logger.error("[NotificationScheduler] Failed to write notification log", { err });
  }
}

/** Delete a device token from the DB */
async function deleteDeviceToken(token: string): Promise<void> {
  try {
    await queryOne(`DELETE FROM device_tokens WHERE token = $1`, [token]);
  } catch (err) {
    logger.error("[NotificationScheduler] Failed to delete device token", { err });
  }
}

// ---------------------------------------------------------------------------
// DB adapter passed to dispatchToToken
// ---------------------------------------------------------------------------

const dispatchDb: DispatchDb = {
  deleteToken: deleteDeviceToken,
  writeLog: writeNotificationLog,
};

// ---------------------------------------------------------------------------
// Per-trigger dispatch helpers
// ---------------------------------------------------------------------------

/**
 * Dispatch notifications to a list of user IDs for a given trigger.
 * Applies exclusion filter, resolves template, resolves placeholders,
 * then dispatches to each user's device tokens.
 */
async function dispatchForUsers(
  triggerKey: string,
  candidateUserIds: string[],
  excludedUserIds: string[],
  templates: Awaited<ReturnType<typeof getAllTemplates>>,
  context: Record<string, string>,
): Promise<void> {
  // 1. Apply exclusion filter
  const eligibleUserIds = filterExcludedUsers(candidateUserIds, excludedUserIds);

  // 2. Resolve active template — suppress if inactive/missing
  const templateResult = getActiveTemplate(triggerKey, templates);
  if (templateResult.suppressed) {
    // Write a suppressed log for each eligible user
    for (const userId of eligibleUserIds) {
      await writeNotificationLog({
        trigger_key: triggerKey,
        user_id: userId,
        title: "",
        body: "",
        status: "suppressed",
        failure_reason: templateResult.reason,
        platform: "",
      });
    }
    return;
  }

  const { template } = templateResult;

  // 3. Resolve placeholders
  const title = resolvePlaceholders(template.title_template, context);
  const body = resolvePlaceholders(template.body_template, context);

  // 4. Fetch device tokens for eligible users
  const tokens = await fetchDeviceTokens(eligibleUserIds);

  // Build a lookup: user_id → tokens[]
  const tokensByUser = new Map<string, DeviceToken[]>();
  for (const t of tokens) {
    const list = tokensByUser.get(t.user_id) ?? [];
    list.push(t);
    tokensByUser.set(t.user_id, list);
  }

  // 5. Dispatch to each user
  for (const userId of eligibleUserIds) {
    const userTokens = tokensByUser.get(userId);

    if (!userTokens || userTokens.length === 0) {
      // No device token registered — skip silently (no log to avoid spam)
      continue;
    }

    // Dispatch to every registered token for this user
    for (const deviceToken of userTokens) {
      await dispatchToToken(deviceToken, title, body, triggerKey, dispatchDb);
    }
  }
}

// ---------------------------------------------------------------------------
// Main scheduler tick
// ---------------------------------------------------------------------------

async function runSchedulerTick(): Promise<void> {
  const utcNow = new Date();
  logger.info("[NotificationScheduler] Tick started", { utcNow });

  try {
    // Fetch shared data once per tick
    const [triggerConfigs, templates, exclusions] = await Promise.all([
      getAllTriggerConfigs(),
      getAllTemplates(),
      getAllExclusions(),
    ]);

    const excludedUserIds = exclusions.map((e) => e.user_id);

    // -----------------------------------------------------------------------
    // Time-based triggers: punch_in and punch_out
    // -----------------------------------------------------------------------
    const timeTriggerKeys = ["punch_in", "punch_out"] as const;

    for (const triggerKey of timeTriggerKeys) {
      const config = triggerConfigs.find((c) => c.trigger_key === triggerKey);
      if (!config || !config.is_enabled) continue;

      const [users, attendance] = await Promise.all([
        fetchActiveUsers(),
        fetchTodayAttendance(),
      ]);

      const eligibleUsers =
        triggerKey === "punch_in"
          ? getPunchInEligibleUsers(users, attendance, config.threshold_value, config.timezone, utcNow)
          : getPunchOutEligibleUsers(users, attendance, config.threshold_value, config.timezone, utcNow);

      const eligibleUserIds = eligibleUsers.map((u) => u.user_id);

      await dispatchForUsers(triggerKey, eligibleUserIds, excludedUserIds, templates, {});
    }

    // -----------------------------------------------------------------------
    // Duration-based triggers: complaint_open and complaint_inprogress
    // -----------------------------------------------------------------------
    const durationTriggers = [
      { triggerKey: "complaint_open" as const, status: "Open" },
      { triggerKey: "complaint_inprogress" as const, status: "Inprogress" },
    ];

    for (const { triggerKey, status } of durationTriggers) {
      const config = triggerConfigs.find((c) => c.trigger_key === triggerKey);
      if (!config || !config.is_enabled) continue;

      const frequencyMinutes = config.repeat_frequency_minutes ?? 30;

      const [complaints, recentLogs] = await Promise.all([
        fetchComplaintsByStatus(status),
        fetchRecentLogs(triggerKey),
      ]);

      const eligibleComplaints = getEligibleComplaints(
        complaints,
        status,
        config.threshold_value,
        frequencyMinutes,
        recentLogs,
        utcNow,
      );

      // Dispatch per complaint — each complaint may have a different assigned user
      for (const complaint of eligibleComplaints) {
        // Fetch the assigned user for this complaint
        const assignedUser = await queryOne<{ assigned_to: string | null }>(
          `SELECT assigned_to FROM complaints WHERE complaint_id = $1`,
          [complaint.complaint_id],
        );

        if (!assignedUser?.assigned_to) continue;

        const context: Record<string, string> = {
          complaint_id: complaint.complaint_id,
          status: complaint.status,
        };

        await dispatchForUsers(
          triggerKey,
          [assignedUser.assigned_to],
          excludedUserIds,
          templates,
          context,
        );
      }
    }

    logger.info("[NotificationScheduler] Tick completed");
  } catch (err) {
    // Catch-all: log and continue — never crash the scheduler
    logger.error("[NotificationScheduler] Unhandled error in tick", { err });
  }
}

// ---------------------------------------------------------------------------
// Scheduler lifecycle
// ---------------------------------------------------------------------------

let schedulerJob: ReturnType<typeof cron.schedule> | null = null;

/**
 * Start the notification scheduler.
 * Runs every minute by default. Call once at application startup.
 */
export function startNotificationScheduler(): void {
  if (schedulerJob) {
    logger.warn("[NotificationScheduler] Already running — skipping duplicate start");
    return;
  }

  // Run every minute, using UTC (cron handles timezone internally via node-cron)
  schedulerJob = cron.schedule(
    "* * * * *",
    async () => {
      try {
        await runSchedulerTick();
      } catch (err) {
        logger.error("[NotificationScheduler] Unexpected error in cron callback", { err });
      }
    },
    {
      timezone: "UTC",
    },
  );

  logger.info("[NotificationScheduler] Started — running every minute");
}

/**
 * Stop the notification scheduler (useful for graceful shutdown or tests).
 */
export function stopNotificationScheduler(): void {
  if (schedulerJob) {
    schedulerJob.stop();
    schedulerJob = null;
    logger.info("[NotificationScheduler] Stopped");
  }
}
