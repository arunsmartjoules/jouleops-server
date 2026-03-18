/**
 * Duration-Based Trigger Evaluator
 *
 * Pure functions for determining which complaints are eligible for
 * duration-based push notifications (e.g. "Open" or "Inprogress" alerts).
 *
 * No DB calls — callers are responsible for fetching complaints and
 * notification logs and passing them in. This keeps the logic fully testable.
 *
 * Tasks: 6.7 (duration threshold + repeat frequency), 6.10 (status-transition guard)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Complaint {
  complaint_id: string;
  /** Current status of the complaint, e.g. 'Open' | 'Inprogress' | other */
  status: string;
  /** Timestamp when the complaint entered its current status */
  status_changed_at: Date | string;
  [key: string]: any;
}

export interface NotificationLog {
  complaint_id: string;
  /** The trigger key this log entry belongs to, e.g. 'complaint_open' */
  trigger_key: string;
  /** When the notification was sent */
  sent_at: Date | string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the elapsed time in minutes between `from` and `to`.
 *
 * Accepts either a Date object or an ISO string for `from`.
 * Returns 0 if `from` is invalid or in the future relative to `to`.
 */
export function getElapsedMinutes(from: Date | string, to: Date): number {
  const fromDate = from instanceof Date ? from : new Date(from);
  if (isNaN(fromDate.getTime())) return 0;
  const diffMs = to.getTime() - fromDate.getTime();
  // Clamp to 0 — negative elapsed time is treated as 0 (future timestamp).
  return Math.max(0, diffMs / 60_000);
}

/**
 * Calculate how many notifications should have been sent by now.
 *
 * Formula: floor((elapsedMinutes - thresholdMinutes) / frequencyMinutes) + 1
 *
 * Returns 0 if the elapsed time has not yet reached the threshold.
 *
 * @param elapsedMinutes   - Minutes since the complaint entered the trigger status.
 * @param thresholdMinutes - Minimum age before the first notification is sent.
 * @param frequencyMinutes - Repeat interval between subsequent notifications.
 */
export function getExpectedNotificationCount(
  elapsedMinutes: number,
  thresholdMinutes: number,
  frequencyMinutes: number,
): number {
  if (elapsedMinutes < thresholdMinutes) return 0;
  return Math.floor((elapsedMinutes - thresholdMinutes) / frequencyMinutes) + 1;
}

// ---------------------------------------------------------------------------
// Main evaluator
// ---------------------------------------------------------------------------

/**
 * Return the subset of `complaints` that are eligible for a push notification.
 *
 * Eligibility rules (all must pass):
 *
 * 1. **Status guard (Task 6.10):** The complaint's current `status` must match
 *    `triggerStatus` (case-insensitive). Complaints that have transitioned away
 *    from the trigger status are excluded immediately.
 *
 * 2. **Threshold check (Task 6.7):** The time elapsed since `status_changed_at`
 *    must be >= `thresholdMinutes`. Complaints that haven't aged enough are skipped.
 *
 * 3. **Repeat frequency guard (Task 6.7):** If a notification has already been
 *    sent for this complaint + trigger, a new one is only sent when the time
 *    since the last send is >= `frequencyMinutes`. This prevents duplicate sends
 *    within the configured interval.
 *
 *    More precisely, the number of logs for this complaint+trigger must be less
 *    than the expected notification count derived from the elapsed time and the
 *    formula in `getExpectedNotificationCount`. This ensures exactly one
 *    notification per frequency window.
 *
 * @param complaints       - All candidate complaints to evaluate.
 * @param triggerStatus    - The status that activates this trigger ('Open' or 'Inprogress').
 * @param thresholdMinutes - Minimum age (in minutes) before the first notification.
 * @param frequencyMinutes - Repeat interval (in minutes) between notifications.
 * @param recentLogs       - Notification logs for these complaints and this trigger.
 * @param utcNow           - Current UTC time used as the reference point.
 * @returns Complaints that should receive a notification on this evaluation tick.
 */
export function getEligibleComplaints(
  complaints: Complaint[],
  triggerStatus: string,
  thresholdMinutes: number,
  frequencyMinutes: number,
  recentLogs: NotificationLog[],
  utcNow: Date,
): Complaint[] {
  // Build a lookup: complaint_id → most recent sent_at for this trigger.
  // We only need the latest log per complaint to check the repeat interval.
  const lastSentByComplaint = new Map<string, Date>();
  const logCountByComplaint = new Map<string, number>();

  for (const log of recentLogs) {
    const sentAt = log.sent_at instanceof Date ? log.sent_at : new Date(log.sent_at);
    if (isNaN(sentAt.getTime())) continue;

    // Track the most recent send time.
    const existing = lastSentByComplaint.get(log.complaint_id);
    if (!existing || sentAt > existing) {
      lastSentByComplaint.set(log.complaint_id, sentAt);
    }

    // Track total send count.
    logCountByComplaint.set(
      log.complaint_id,
      (logCountByComplaint.get(log.complaint_id) ?? 0) + 1,
    );
  }

  const normalizedTriggerStatus = triggerStatus.toLowerCase();

  return complaints.filter((complaint) => {
    // -----------------------------------------------------------------------
    // Rule 1 — Status guard (Task 6.10)
    // Only process complaints still in the trigger status.
    // -----------------------------------------------------------------------
    if (complaint.status.toLowerCase() !== normalizedTriggerStatus) {
      return false;
    }

    // -----------------------------------------------------------------------
    // Rule 2 — Threshold check
    // The complaint must have been in this status long enough.
    // -----------------------------------------------------------------------
    const elapsedMinutes = getElapsedMinutes(complaint.status_changed_at, utcNow);
    if (elapsedMinutes < thresholdMinutes) {
      return false;
    }

    // -----------------------------------------------------------------------
    // Rule 3 — Repeat frequency guard (Task 6.7)
    // Compare how many notifications have been sent vs. how many should have
    // been sent by now. Only send if we're behind the expected count.
    // -----------------------------------------------------------------------
    const expectedCount = getExpectedNotificationCount(
      elapsedMinutes,
      thresholdMinutes,
      frequencyMinutes,
    );
    const actualCount = logCountByComplaint.get(complaint.complaint_id) ?? 0;

    return actualCount < expectedCount;
  });
}
