// Feature: push-notification-control, Property 3: Threshold timezone evaluation
//
// For any UTC timestamp and any configured timezone (defaulting to Asia/Kolkata),
// the threshold evaluation function should convert the timestamp to the target timezone
// before comparing against the threshold value, such that the same UTC time produces
// different local times in different timezones.
//
// Validates: Requirements 1.3, 1.4

import { describe, test, expect } from "bun:test";
import * as fc from "fast-check";
import {
  utcToMinutesFromMidnight,
  hasReachedTimeThreshold,
} from "../thresholdEvaluator.ts";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** A fixed set of well-known IANA timezones with distinct UTC offsets */
const timezoneArb = fc.constantFrom(
  "UTC",
  "Asia/Kolkata",    // UTC+5:30
  "America/New_York", // UTC-5 / UTC-4 (DST)
  "Europe/London",   // UTC+0 / UTC+1 (BST)
  "Asia/Tokyo",      // UTC+9
);

/** Random UTC timestamps across a wide range (NaN dates excluded) */
const utcDateArb = fc.date({
  min: new Date("2020-01-01T00:00:00Z"),
  max: new Date("2030-12-31T23:59:59Z"),
  noInvalidDate: true,
});

/** Valid threshold values: minutes from midnight [0, 1439] */
const thresholdArb = fc.integer({ min: 0, max: 1439 });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Property 3: Threshold timezone evaluation", () => {
  test(
    "utcToMinutesFromMidnight always returns a value in [0, 1439] for any UTC timestamp and timezone",
    () => {
      fc.assert(
        fc.property(utcDateArb, timezoneArb, (utcDate, timezone) => {
          const result = utcToMinutesFromMidnight(utcDate, timezone);
          expect(result).toBeGreaterThanOrEqual(0);
          expect(result).toBeLessThanOrEqual(1439);
        }),
        { numRuns: 100 },
      );
    },
  );

  test(
    "the same UTC time produces different local minutes in UTC vs Asia/Kolkata (UTC+5:30 = 330 min ahead)",
    () => {
      fc.assert(
        fc.property(utcDateArb, (utcDate) => {
          const utcMinutes = utcToMinutesFromMidnight(utcDate, "UTC");
          const istMinutes = utcToMinutesFromMidnight(utcDate, "Asia/Kolkata");

          // IST is UTC+5:30 (330 minutes ahead), so the difference mod 1440 should be 330
          const diff = (istMinutes - utcMinutes + 1440) % 1440;
          expect(diff).toBe(330);
        }),
        { numRuns: 100 },
      );
    },
  );

  test(
    "the same UTC time produces different local minutes in UTC vs Asia/Tokyo (UTC+9 = 540 min ahead)",
    () => {
      fc.assert(
        fc.property(utcDateArb, (utcDate) => {
          const utcMinutes = utcToMinutesFromMidnight(utcDate, "UTC");
          const tokyoMinutes = utcToMinutesFromMidnight(utcDate, "Asia/Tokyo");

          // Tokyo is UTC+9 (540 minutes ahead)
          const diff = (tokyoMinutes - utcMinutes + 1440) % 1440;
          expect(diff).toBe(540);
        }),
        { numRuns: 100 },
      );
    },
  );

  test(
    "hasReachedTimeThreshold returns true iff local minutes >= threshold",
    () => {
      fc.assert(
        fc.property(utcDateArb, timezoneArb, thresholdArb, (utcDate, timezone, threshold) => {
          const localMinutes = utcToMinutesFromMidnight(utcDate, timezone);
          const result = hasReachedTimeThreshold(utcDate, threshold, timezone);
          expect(result).toBe(localMinutes >= threshold);
        }),
        { numRuns: 100 },
      );
    },
  );

  test(
    "known UTC 00:00 converts to IST 05:30 = 330 minutes from midnight",
    () => {
      // UTC midnight = 00:00 UTC = 05:30 IST
      const utcMidnight = new Date("2024-06-15T00:00:00Z");
      const istMinutes = utcToMinutesFromMidnight(utcMidnight, "Asia/Kolkata");
      expect(istMinutes).toBe(330); // 5 * 60 + 30
    },
  );

  test(
    "utcToMinutesFromMidnight uses Asia/Kolkata as default timezone",
    () => {
      fc.assert(
        fc.property(utcDateArb, (utcDate) => {
          const withDefault = utcToMinutesFromMidnight(utcDate);
          const withExplicit = utcToMinutesFromMidnight(utcDate, "Asia/Kolkata");
          expect(withDefault).toBe(withExplicit);
        }),
        { numRuns: 100 },
      );
    },
  );
});
