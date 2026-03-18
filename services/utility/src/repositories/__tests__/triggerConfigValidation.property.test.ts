// Feature: push-notification-control, Property 9: Config validation rejects invalid values
//
// For any invalid threshold input (time outside 00:00–23:59, negative duration,
// zero or negative frequency), the validation layer should reject the value and
// the persisted configuration should remain unchanged.
//
// Validates: Requirements 6.3, 7.3

import { describe, test, expect } from "bun:test";
import * as fc from "fast-check";
import { validateTriggerConfigUpdate } from "../triggerConfigRepository.ts";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const timeTriggerKeyArb = fc.constantFrom("punch_in" as const, "punch_out" as const);

const durationTriggerKeyArb = fc.constantFrom(
  "complaint_open" as const,
  "complaint_inprogress" as const,
);

const allTriggerKeyArb = fc.constantFrom(
  "punch_in" as const,
  "punch_out" as const,
  "complaint_open" as const,
  "complaint_inprogress" as const,
);

/** Invalid threshold for time triggers: integer outside [0, 1439] */
const invalidTimeThreshold = fc.oneof(
  fc.integer({ min: -100_000, max: -1 }),   // negative
  fc.integer({ min: 1440, max: 100_000 }),  // above 1439
);

/** Invalid threshold for duration triggers: zero or negative integer */
const invalidDurationThreshold = fc.integer({ min: -100_000, max: 0 });

/** Invalid repeat frequency: zero or negative integer */
const invalidFrequency = fc.integer({ min: -100_000, max: 0 });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Property 9: Config validation rejects invalid values", () => {
  test(
    "time trigger (punch_in / punch_out): threshold_value < 0 produces a validation error",
    () => {
      fc.assert(
        fc.property(
          timeTriggerKeyArb,
          fc.integer({ min: -100_000, max: -1 }),
          (triggerKey, threshold) => {
            const errors = validateTriggerConfigUpdate(triggerKey, {
              threshold_value: threshold,
            });
            expect(errors.length).toBeGreaterThan(0);
            expect(errors.some((e) => e.field === "threshold_value")).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  test(
    "time trigger (punch_in / punch_out): threshold_value > 1439 produces a validation error",
    () => {
      fc.assert(
        fc.property(
          timeTriggerKeyArb,
          fc.integer({ min: 1440, max: 100_000 }),
          (triggerKey, threshold) => {
            const errors = validateTriggerConfigUpdate(triggerKey, {
              threshold_value: threshold,
            });
            expect(errors.length).toBeGreaterThan(0);
            expect(errors.some((e) => e.field === "threshold_value")).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  test(
    "time trigger: any out-of-range threshold produces a validation error",
    () => {
      fc.assert(
        fc.property(
          timeTriggerKeyArb,
          invalidTimeThreshold,
          (triggerKey, threshold) => {
            const errors = validateTriggerConfigUpdate(triggerKey, {
              threshold_value: threshold,
            });
            expect(errors.length).toBeGreaterThan(0);
            expect(errors.some((e) => e.field === "threshold_value")).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  test(
    "duration trigger (complaint_open / complaint_inprogress): threshold_value <= 0 produces a validation error",
    () => {
      fc.assert(
        fc.property(
          durationTriggerKeyArb,
          invalidDurationThreshold,
          (triggerKey, threshold) => {
            const errors = validateTriggerConfigUpdate(triggerKey, {
              threshold_value: threshold,
            });
            expect(errors.length).toBeGreaterThan(0);
            expect(errors.some((e) => e.field === "threshold_value")).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  test(
    "any trigger: repeat_frequency_minutes <= 0 produces a validation error",
    () => {
      fc.assert(
        fc.property(
          allTriggerKeyArb,
          invalidFrequency,
          (triggerKey, frequency) => {
            const errors = validateTriggerConfigUpdate(triggerKey, {
              repeat_frequency_minutes: frequency,
            });
            expect(errors.length).toBeGreaterThan(0);
            expect(errors.some((e) => e.field === "repeat_frequency_minutes")).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  test(
    "invalid threshold and invalid frequency together both produce errors",
    () => {
      fc.assert(
        fc.property(
          durationTriggerKeyArb,
          invalidDurationThreshold,
          invalidFrequency,
          (triggerKey, threshold, frequency) => {
            const errors = validateTriggerConfigUpdate(triggerKey, {
              threshold_value: threshold,
              repeat_frequency_minutes: frequency,
            });
            expect(errors.some((e) => e.field === "threshold_value")).toBe(true);
            expect(errors.some((e) => e.field === "repeat_frequency_minutes")).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  test(
    "valid inputs produce no validation errors (time triggers)",
    () => {
      fc.assert(
        fc.property(
          timeTriggerKeyArb,
          fc.integer({ min: 0, max: 1439 }),
          (triggerKey, threshold) => {
            const errors = validateTriggerConfigUpdate(triggerKey, {
              threshold_value: threshold,
            });
            expect(errors).toHaveLength(0);
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  test(
    "valid inputs produce no validation errors (duration triggers)",
    () => {
      fc.assert(
        fc.property(
          durationTriggerKeyArb,
          fc.integer({ min: 1, max: 10_000 }),
          fc.integer({ min: 1, max: 10_000 }),
          (triggerKey, threshold, frequency) => {
            const errors = validateTriggerConfigUpdate(triggerKey, {
              threshold_value: threshold,
              repeat_frequency_minutes: frequency,
            });
            expect(errors).toHaveLength(0);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
