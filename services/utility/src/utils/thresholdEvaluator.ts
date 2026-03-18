/**
 * Threshold Evaluator Utilities
 *
 * Pure functions for timezone-aware threshold evaluation.
 * Used by the notification scheduler to compare the current local time
 * (in a configured timezone) against a stored threshold_value
 * (minutes from midnight, 0–1439).
 *
 * No external dependencies — uses built-in Intl.DateTimeFormat.
 */

const DEFAULT_TIMEZONE = "Asia/Kolkata";

/**
 * Convert a UTC Date to minutes from midnight in the given timezone.
 *
 * Strategy: use Intl.DateTimeFormat with 'hour' and 'minute' parts to
 * extract the local hour and minute in the target timezone, then compute
 * hour * 60 + minute.
 *
 * @param utcDate  - A Date object representing a UTC instant
 * @param timezone - IANA timezone string (e.g. 'Asia/Kolkata', 'America/New_York')
 * @returns Minutes from midnight in the target timezone (0–1439)
 */
export function utcToMinutesFromMidnight(
  utcDate: Date,
  timezone: string = DEFAULT_TIMEZONE,
): number {
  // Intl.DateTimeFormat with 'hour12: false' gives 0–23 hour values.
  // We request only hour and minute parts to keep it minimal.
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });

  const parts = formatter.formatToParts(utcDate);

  // Extract hour and minute from the formatted parts array
  const hourPart = parts.find((p) => p.type === "hour");
  const minutePart = parts.find((p) => p.type === "minute");

  const hour = parseInt(hourPart?.value ?? "0", 10);
  const minute = parseInt(minutePart?.value ?? "0", 10);

  // Intl may return 24 for midnight in some environments; normalise to 0
  const normalisedHour = hour === 24 ? 0 : hour;

  return normalisedHour * 60 + minute;
}

/**
 * Returns true if the current local time (in the given timezone) is at or
 * past the configured threshold (minutes from midnight).
 *
 * Used for punch-in and punch-out time-based triggers.
 *
 * @param utcNow           - Current UTC time
 * @param thresholdMinutes - Configured threshold in minutes from midnight (0–1439)
 * @param timezone         - IANA timezone string
 */
export function hasReachedTimeThreshold(
  utcNow: Date,
  thresholdMinutes: number,
  timezone: string = DEFAULT_TIMEZONE,
): boolean {
  const localMinutes = utcToMinutesFromMidnight(utcNow, timezone);
  return localMinutes >= thresholdMinutes;
}

/**
 * Alias for utcToMinutesFromMidnight — provided for semantic clarity at
 * call sites that emphasise "what is the local time right now?".
 *
 * @param utcDate  - A Date object representing a UTC instant
 * @param timezone - IANA timezone string
 * @returns Minutes from midnight in the target timezone (0–1439)
 */
export const getMinutesFromMidnightInTimezone = utcToMinutesFromMidnight;
