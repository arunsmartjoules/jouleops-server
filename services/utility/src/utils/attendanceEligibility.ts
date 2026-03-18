/**
 * Attendance Eligibility Filters
 *
 * Pure functions for determining which users should receive punch-in or
 * punch-out reminder notifications.
 *
 * No DB calls — callers are responsible for fetching users and attendance
 * records and passing them in. This keeps the logic fully testable.
 *
 * Timezone conversion is delegated to `utcToMinutesFromMidnight` from
 * `./thresholdEvaluator` so that all timezone handling is centralised.
 */

import { utcToMinutesFromMidnight } from "./thresholdEvaluator.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface User {
  user_id: string;
  [key: string]: any;
}

export interface AttendanceRecord {
  user_id: string;
  /** The time the user punched in, or null if not yet punched in. */
  punch_in_time: Date | string | null;
  /** The time the user punched out, or null if not yet punched out. */
  punch_out_time: Date | string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Coerce a punch time value (Date, ISO string, or null) to a Date, or null.
 */
function toDate(value: Date | string | null): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Convert a punch time to minutes-from-midnight in the given timezone.
 * Returns null if the punch time is null/invalid.
 */
function punchTimeToMinutes(
  punchTime: Date | string | null,
  timezone: string,
): number | null {
  const d = toDate(punchTime);
  if (d === null) return null;
  return utcToMinutesFromMidnight(d, timezone);
}

// ---------------------------------------------------------------------------
// Punch-in eligibility
// ---------------------------------------------------------------------------

/**
 * Return the subset of `users` who are eligible for a punch-in reminder.
 *
 * A user is eligible when they have NOT recorded a punch-in for today whose
 * local time (in `timezone`) is strictly less than `thresholdMinutes` from
 * midnight.  In other words:
 *   - No attendance record at all → eligible (they never punched in).
 *   - Attendance record exists but `punch_in_time` is null → eligible.
 *   - `punch_in_time` converted to local minutes >= `thresholdMinutes` → eligible
 *     (they punched in after the threshold, so the reminder window already passed
 *     without a timely punch-in).
 *   - `punch_in_time` converted to local minutes < `thresholdMinutes` → NOT eligible
 *     (they punched in before the threshold — no reminder needed).
 *
 * Requirements: 1.1, 1.2
 *
 * @param users             - Full list of candidate users.
 * @param attendanceRecords - Today's attendance records (one per user at most).
 * @param thresholdMinutes  - Punch-in threshold in minutes from midnight (0–1439).
 * @param timezone          - IANA timezone string used for local-time conversion.
 * @param utcNow            - Current UTC time (unused in filter logic but kept for
 *                            API symmetry with the punch-out filter).
 * @returns Users who have not punched in before the threshold.
 */
export function getPunchInEligibleUsers(
  users: User[],
  attendanceRecords: AttendanceRecord[],
  thresholdMinutes: number,
  timezone: string,
  _utcNow: Date,
): User[] {
  // Build a lookup: user_id → attendance record for O(1) access.
  const recordByUser = new Map<string, AttendanceRecord>();
  for (const record of attendanceRecords) {
    recordByUser.set(record.user_id, record);
  }

  return users.filter((user) => {
    const record = recordByUser.get(user.user_id);

    // No record at all → user never punched in → eligible.
    if (!record) return true;

    const punchInMinutes = punchTimeToMinutes(record.punch_in_time, timezone);

    // punch_in_time is null or unparseable → treated as no punch-in → eligible.
    if (punchInMinutes === null) return true;

    // User punched in before the threshold → NOT eligible (already complied).
    // User punched in at or after the threshold → eligible (missed the window).
    return punchInMinutes >= thresholdMinutes;
  });
}

// ---------------------------------------------------------------------------
// Punch-out eligibility
// ---------------------------------------------------------------------------

/**
 * Return the subset of `users` who are eligible for a punch-out reminder.
 *
 * A user is eligible when they HAVE a punch-in for today but do NOT have a
 * punch-out whose local time (in `timezone`) is strictly less than
 * `thresholdMinutes` from midnight.  Specifically:
 *   - No attendance record, or `punch_in_time` is null → NOT eligible
 *     (can't remind to punch out if they never punched in).
 *   - Has a `punch_in_time` AND `punch_out_time` whose local minutes <
 *     `thresholdMinutes` → NOT eligible (already punched out in time).
 *   - Has a `punch_in_time` AND (`punch_out_time` is null OR local minutes >=
 *     `thresholdMinutes`) → eligible.
 *
 * Requirements: 2.1, 2.2
 *
 * @param users             - Full list of candidate users.
 * @param attendanceRecords - Today's attendance records (one per user at most).
 * @param thresholdMinutes  - Punch-out threshold in minutes from midnight (0–1439).
 * @param timezone          - IANA timezone string used for local-time conversion.
 * @param utcNow            - Current UTC time (unused in filter logic but kept for
 *                            API symmetry with the punch-in filter).
 * @returns Users who have punched in but not punched out before the threshold.
 */
export function getPunchOutEligibleUsers(
  users: User[],
  attendanceRecords: AttendanceRecord[],
  thresholdMinutes: number,
  timezone: string,
  _utcNow: Date,
): User[] {
  // Build a lookup: user_id → attendance record for O(1) access.
  const recordByUser = new Map<string, AttendanceRecord>();
  for (const record of attendanceRecords) {
    recordByUser.set(record.user_id, record);
  }

  return users.filter((user) => {
    const record = recordByUser.get(user.user_id);

    // No record → never punched in → NOT eligible.
    if (!record) return false;

    const punchInMinutes = punchTimeToMinutes(record.punch_in_time, timezone);

    // No valid punch-in → NOT eligible.
    if (punchInMinutes === null) return false;

    const punchOutMinutes = punchTimeToMinutes(record.punch_out_time, timezone);

    // No punch-out at all → eligible (punched in but not out).
    if (punchOutMinutes === null) return true;

    // Punched out before the threshold → NOT eligible (already complied).
    // Punched out at or after the threshold → eligible (missed the window).
    return punchOutMinutes >= thresholdMinutes;
  });
}
