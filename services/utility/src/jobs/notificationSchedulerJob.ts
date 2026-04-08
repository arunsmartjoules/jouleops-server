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

import { logger, query } from "@jouleops/shared";
import cron from "node-cron";

import { getAllTriggerConfigs } from "../repositories/triggerConfigRepository.ts";
import { getAllTemplates } from "../repositories/notificationTemplateRepository.ts";
import { getAllExclusions } from "../repositories/notificationExclusionRepository.ts";

import { getEligibleComplaints } from "../utils/durationTriggerEvaluator.ts";
import { getActiveTemplate, resolvePlaceholders } from "../utils/notificationFilters.ts";
import pushNotificationService from "../services/pushNotificationService.ts";
import type { Complaint, NotificationLog } from "../utils/durationTriggerEvaluator.ts";

// ---------------------------------------------------------------------------
// DB helpers — thin wrappers so the scheduler stays readable
// ---------------------------------------------------------------------------

/** Fetch complaints currently in a given status, including assigned_to and site_code */
async function fetchComplaintsByStatus(status: string): Promise<Complaint[]> {
  return query<Complaint>(
    `SELECT 
        c.id AS complaint_id, 
        c.ticket_no,
        c.status, 
        c.updated_at AS status_changed_at, 
        c.assigned_to, 
        c.site_code,
        s.name AS site_name,
        c.category,
        c.priority
     FROM complaints c
     LEFT JOIN sites s ON c.site_code = s.site_code
     WHERE c.status = $1`,
    [status],
  );
}

/** Fetch PM instances currently in a given status */
async function fetchPmInstancesByStatus(status: string): Promise<Complaint[]> {
  return query<Complaint>(
    `SELECT
        p.id::text AS complaint_id,
        p.instance_id AS ticket_no,
        p.status,
        COALESCE(p.start_datetime, p.updated_at) AS status_changed_at,
        p.assigned_to,
        p.site_code,
        s.name AS site_name,
        p.asset_type AS category,
        ''::text AS priority
     FROM pm_instances p
     LEFT JOIN sites s ON p.site_code = s.site_code
     WHERE p.status = $1`,
    [status],
  );
}

/** Fetch user ids mapped to a site code */
async function fetchSiteUserIdsBySiteCode(siteCode?: string): Promise<string[]> {
  if (!siteCode) return [];

  const rows = await query<{ user_id: string }>(
    `SELECT DISTINCT su.user_id
     FROM site_user su
     JOIN sites s ON su.site_id = s.site_id
     WHERE s.site_code = $1`,
    [siteCode],
  );

  return rows.map((row) => row.user_id);
}

/** Keep only users with ticket notifications enabled (or unset => enabled) */
async function filterUsersByTicketPreference(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];

  const rows = await query<{ user_id: string }>(
    `SELECT u.user_id
     FROM users u
     LEFT JOIN user_notification_preferences p ON p.user_id = u.user_id
     WHERE u.user_id = ANY($1)
       AND COALESCE(p.ticket_notifications_enabled, true) = true`,
    [userIds],
  );

  return rows.map((row) => row.user_id);
}

/** Format elapsed minutes as Xm, Xh Ym, or Xd Yh */
function formatElapsedFromMinutes(totalMinutes: number): string {
  const safeMinutes = Math.max(0, Math.floor(totalMinutes));
  if (safeMinutes < 60) {
    return `${safeMinutes}m`;
  }

  const totalHours = Math.floor(safeMinutes / 60);
  if (totalHours < 24) {
    const remainingMinutes = safeMinutes % 60;
    return remainingMinutes > 0
      ? `${totalHours}h ${remainingMinutes}m`
      : `${totalHours}h`;
  }

  const days = Math.floor(totalHours / 24);
  const remainingHours = totalHours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
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

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

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
  eligibleUserIds: string[],
  excludedUserIds: string[],
  templates: any[],
  context: Record<string, string>,
): Promise<void> {
  // 1. Filter out physically excluded users
  const nonExcludedIds = eligibleUserIds.filter(
    (id) => !excludedUserIds.includes(id)
  );
  if (nonExcludedIds.length === 0) return;

  // 2. Determine active template
  const templateResult = getActiveTemplate(triggerKey, templates);

  if (templateResult.suppressed) {
    // Write a suppressed log for each eligible user
    for (const userId of eligibleUserIds) {
      await pushNotificationService.logNotification(
        userId,
        "",
        "",
        triggerKey,
        "skipped",
        templateResult.reason
      );
    }
    return;
  }

  const { template } = templateResult;

  // 3. Fetch user names and site codes if not specifically provided in context
  const userDetails = new Map<string, { name: string; site_code: string }>();
  const userRows = await query<{
    user_id: string;
    name: string;
    site_code: string;
  }>(
    "SELECT user_id, name, site_code FROM users WHERE user_id = ANY($1)",
    [nonExcludedIds]
  );
  for (const row of userRows) {
    userDetails.set(row.user_id, { name: row.name, site_code: row.site_code });
  }

  // 4. Dispatch to each user
  for (const userId of nonExcludedIds) {
    const user = userDetails.get(userId);
    const resolvedTicketNo = context.ticket_no || context.complaint_id || "";
    
    // Resolve placeholders per user
    const resolvedContext = { 
      ...context,
      name: user?.name || "there",
      site_name: context.site_name || context.site_code || user?.site_code || "",
      // Map common ticket field name aliases
      ticket_no: resolvedTicketNo,
      // Keep legacy placeholder {{complaint_id}} compatible with visible ticket number.
      complaint_id: resolvedTicketNo,
      complaint_title: context.title || resolvedTicketNo,
      // Support both template variants: {{elapsed}} and {{duration_minutes}}
      elapsed: context.elapsed || context.duration_minutes || "",
      duration_minutes: context.duration_minutes || context.elapsed || "",
    };

    const siteCode = context.site_code || user?.site_code;

    const title = resolvePlaceholders(template.title_template, resolvedContext);
    const body = resolvePlaceholders(template.body_template, resolvedContext);

    // Unify dispatches using pushNotificationService
    await pushNotificationService.sendNotificationToUser(userId, title, body, {
      type: triggerKey,
      ...(context.complaint_id ? { ticket_no: context.complaint_id } : {}),
      ...(siteCode ? { site_code: siteCode } : {}),
    });
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
    /* 
      DUPLICATION PREVENTION:
      Attendance triggers (punch_in, punch_out) are now handled by the dedicated
      attendanceReminderJob.ts which has more custom logic and robust daily
      deduplication. We skip them in this general scheduler to prevent double alerts.
    */
    /*
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
    */

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
        utcNow
      );

      // Dispatch per complaint — recipients are site users for the complaint site
      for (const complaint of eligibleComplaints) {
        const siteUserIds = await fetchSiteUserIdsBySiteCode(complaint.site_code);
        const preferenceEligibleUserIds = await filterUsersByTicketPreference(siteUserIds);
        const recipientUserIds = [...new Set(preferenceEligibleUserIds)];
        if (recipientUserIds.length === 0) continue;

        const context: Record<string, string> = {
          complaint_id: complaint.complaint_id,
          ticket_no: complaint.ticket_no || "",
          status: complaint.status,
          site_code: complaint.site_code || "",
          site_name: complaint.site_name || "",
          category: complaint.category || "",
          priority: complaint.priority || "",
          elapsed: formatElapsedFromMinutes(
            (utcNow.getTime() - new Date(complaint.status_changed_at).getTime()) /
              60_000,
          ),
          duration_minutes: String(
            Math.max(
              0,
              Math.floor(
                (utcNow.getTime() - new Date(complaint.status_changed_at).getTime()) /
                  60_000,
              ),
            ),
          ),
        };

        await dispatchForUsers(
          triggerKey,
          recipientUserIds,
          excludedUserIds,
          templates,
          context
        );
      }
    }

    // -----------------------------------------------------------------------
    // PM duration-based trigger: pm_inprogress
    // -----------------------------------------------------------------------
    const pmTriggerKey = "pm_inprogress";
    const pmConfig = triggerConfigs.find((c) => c.trigger_key === pmTriggerKey);

    if (pmConfig?.is_enabled) {
      const frequencyMinutes = pmConfig.repeat_frequency_minutes ?? 30;
      const [pmInProgressStatusA, pmInProgressStatusB] = [
        "In Progress",
        "In-progress",
      ] as const;

      const [pmStatusA, pmStatusB, recentPmLogs] = await Promise.all([
        fetchPmInstancesByStatus(pmInProgressStatusA),
        fetchPmInstancesByStatus(pmInProgressStatusB),
        fetchRecentLogs(pmTriggerKey),
      ]);

      const eligiblePmInstances = [
        ...getEligibleComplaints(
          pmStatusA,
          pmInProgressStatusA,
          pmConfig.threshold_value,
          frequencyMinutes,
          recentPmLogs,
          utcNow
        ),
        ...getEligibleComplaints(
          pmStatusB,
          pmInProgressStatusB,
          pmConfig.threshold_value,
          frequencyMinutes,
          recentPmLogs,
          utcNow
        ),
      ];

      for (const pmInstance of eligiblePmInstances) {
        const siteUserIds = await fetchSiteUserIdsBySiteCode(pmInstance.site_code);
        const preferenceEligibleUserIds = await filterUsersByTicketPreference(siteUserIds);
        const recipientUserIds = [...new Set(preferenceEligibleUserIds)];
        if (recipientUserIds.length === 0) continue;

        const context: Record<string, string> = {
          complaint_id: pmInstance.complaint_id,
          ticket_no: pmInstance.ticket_no || "",
          status: pmInstance.status,
          site_code: pmInstance.site_code || "",
          site_name: pmInstance.site_name || "",
          category: pmInstance.category || "",
          priority: pmInstance.priority || "",
          elapsed: formatElapsedFromMinutes(
            (utcNow.getTime() - new Date(pmInstance.status_changed_at).getTime()) /
              60_000,
          ),
          duration_minutes: String(
            Math.max(
              0,
              Math.floor(
                (utcNow.getTime() - new Date(pmInstance.status_changed_at).getTime()) /
                  60_000,
              ),
            ),
          ),
        };

        await dispatchForUsers(
          pmTriggerKey,
          recipientUserIds,
          excludedUserIds,
          templates,
          context
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
