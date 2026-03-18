// Feature: push-notification-control, Property 4: Duration-based trigger fires at threshold
// Feature: push-notification-control, Property 5: Repeat notification frequency invariant
// Feature: push-notification-control, Property 6: Status transition stops alerts

import { describe, test, expect } from "bun:test";
import * as fc from "fast-check";
import {
  getEligibleComplaints,
  getExpectedNotificationCount,
  type Complaint,
  type NotificationLog,
} from "../durationTriggerEvaluator.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeComplaint(id: string, status: string, elapsedMinutes: number, utcNow: Date): Complaint {
  const statusChangedAt = new Date(utcNow.getTime() - elapsedMinutes * 60_000);
  return { complaint_id: id, status, status_changed_at: statusChangedAt };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const NOW = new Date("2024-06-15T12:00:00Z");

const thresholdArb = fc.integer({ min: 1, max: 1000 });
const freqArb = fc.integer({ min: 1, max: 1000 });
const elapsedArb = fc.integer({ min: 0, max: 5000 });
const triggerStatusArb = fc.constantFrom("Open", "Inprogress");

// ---------------------------------------------------------------------------
// Property 4: Duration-based trigger fires at threshold
// Validates: Requirements 3.1, 4.1
// ---------------------------------------------------------------------------

describe("Property 4: Duration-based trigger fires at threshold", () => {
  test("a complaint with elapsed time < threshold is NEVER eligible (no logs)", () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        triggerStatusArb,
        thresholdArb,
        freqArb,
        (id, triggerStatus, threshold, freq) => {
          // elapsed is strictly less than threshold
          const elapsed = threshold - 1;
          const complaint = makeComplaint(id, triggerStatus, elapsed, NOW);
          const result = getEligibleComplaints([complaint], triggerStatus, threshold, freq, [], NOW);
          expect(result.length).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  test("a complaint with elapsed time >= threshold IS eligible (no logs yet)", () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        triggerStatusArb,
        thresholdArb,
        freqArb,
        fc.integer({ min: 0, max: 4000 }),
        (id, triggerStatus, threshold, freq, extra) => {
          // elapsed is at or beyond threshold
          const elapsed = threshold + extra;
          const complaint = makeComplaint(id, triggerStatus, elapsed, NOW);
          const result = getEligibleComplaints([complaint], triggerStatus, threshold, freq, [], NOW);
          expect(result.length).toBe(1);
          expect(result[0].complaint_id).toBe(id);
        },
      ),
      { numRuns: 100 },
    );
  });

  test("the result is always a subset of the input complaints", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({ id: fc.uuid(), elapsed: elapsedArb, status: triggerStatusArb }),
          { minLength: 0, maxLength: 10 },
        ),
        triggerStatusArb,
        thresholdArb,
        freqArb,
        (items, triggerStatus, threshold, freq) => {
          const complaints = items.map((c) => makeComplaint(c.id, c.status, c.elapsed, NOW));
          const inputIds = new Set(complaints.map((c) => c.complaint_id));
          const result = getEligibleComplaints(complaints, triggerStatus, threshold, freq, [], NOW);
          for (const c of result) {
            expect(inputIds.has(c.complaint_id)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  test("only complaints with the matching status are included", () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        triggerStatusArb,
        thresholdArb,
        freqArb,
        fc.integer({ min: 0, max: 4000 }),
        (id, triggerStatus, threshold, freq, extra) => {
          const elapsed = threshold + extra;
          const otherStatus = triggerStatus === "Open" ? "Inprogress" : "Open";
          const wrongComplaint = makeComplaint(id, otherStatus, elapsed, NOW);
          const result = getEligibleComplaints([wrongComplaint], triggerStatus, threshold, freq, [], NOW);
          expect(result.length).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5: Repeat notification frequency invariant
// Validates: Requirements 3.3, 4.3, 7.4
// ---------------------------------------------------------------------------

describe("Property 5: Repeat notification frequency invariant", () => {
  test("getExpectedNotificationCount equals floor((elapsed - threshold) / freq) + 1 when elapsed >= threshold, else 0", () => {
    fc.assert(
      fc.property(
        elapsedArb,
        thresholdArb,
        freqArb,
        (elapsed, threshold, freq) => {
          const result = getExpectedNotificationCount(elapsed, threshold, freq);
          if (elapsed < threshold) {
            expect(result).toBe(0);
          } else {
            const expected = Math.floor((elapsed - threshold) / freq) + 1;
            expect(result).toBe(expected);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  test("no two consecutive notifications for the same complaint are separated by less than frequencyMinutes", () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        triggerStatusArb,
        thresholdArb,
        freqArb,
        fc.integer({ min: 0, max: 4000 }),
        (id, triggerStatus, threshold, freq, extra) => {
          const elapsed = threshold + extra;
          const expectedCount = getExpectedNotificationCount(elapsed, threshold, freq);

          // Build logs simulating notifications sent at each expected window boundary
          const logs: NotificationLog[] = [];
          for (let i = 0; i < expectedCount; i++) {
            const sentAtMs = NOW.getTime() - elapsed * 60_000 + (threshold + i * freq) * 60_000;
            logs.push({
              complaint_id: id,
              trigger_key: "complaint_open",
              sent_at: new Date(sentAtMs),
            });
          }

          // Sort logs by sent_at ascending
          const sorted = [...logs].sort(
            (a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime(),
          );

          // Verify no two consecutive sends are closer than frequencyMinutes
          for (let i = 1; i < sorted.length; i++) {
            const prev = new Date(sorted[i - 1].sent_at).getTime();
            const curr = new Date(sorted[i].sent_at).getTime();
            const gapMinutes = (curr - prev) / 60_000;
            expect(gapMinutes).toBeGreaterThanOrEqual(freq);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  test("after sending expectedCount notifications, the complaint is NOT eligible again until another frequencyMinutes passes", () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        triggerStatusArb,
        thresholdArb,
        freqArb,
        fc.integer({ min: 0, max: 4000 }),
        (id, triggerStatus, threshold, freq, extra) => {
          const elapsed = threshold + extra;
          const expectedCount = getExpectedNotificationCount(elapsed, threshold, freq);

          // Build logs for exactly expectedCount sends
          const logs: NotificationLog[] = Array.from({ length: expectedCount }, (_, i) => ({
            complaint_id: id,
            trigger_key: "complaint_open",
            sent_at: new Date(NOW.getTime() - elapsed * 60_000 + (threshold + i * freq) * 60_000),
          }));

          const complaint = makeComplaint(id, triggerStatus, elapsed, NOW);

          // With exactly expectedCount logs, the complaint should NOT be eligible
          const result = getEligibleComplaints(
            [complaint],
            triggerStatus,
            threshold,
            freq,
            logs,
            NOW,
          );
          expect(result.length).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6: Status transition stops alerts
// Validates: Requirements 3.4, 4.4
// ---------------------------------------------------------------------------

describe("Property 6: Status transition stops alerts", () => {
  test("a complaint that has transitioned OUT of the trigger status is NEVER eligible, regardless of elapsed time or log count", () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        triggerStatusArb,
        thresholdArb,
        freqArb,
        fc.integer({ min: 0, max: 4000 }),
        (id, triggerStatus, threshold, freq, extra) => {
          const elapsed = threshold + extra;
          const otherStatus = triggerStatus === "Open" ? "Closed" : "Resolved";
          // Complaint is in a different status (transitioned out)
          const complaint = makeComplaint(id, otherStatus, elapsed, NOW);
          const result = getEligibleComplaints([complaint], triggerStatus, threshold, freq, [], NOW);
          expect(result.length).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  test("a complaint that transitions back INTO the trigger status becomes eligible again (after threshold)", () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        triggerStatusArb,
        thresholdArb,
        freqArb,
        fc.integer({ min: 0, max: 4000 }),
        (id, triggerStatus, threshold, freq, extra) => {
          const elapsed = threshold + extra;
          // Complaint is back in the trigger status with elapsed >= threshold
          const complaint = makeComplaint(id, triggerStatus, elapsed, NOW);
          // No logs for this new status window
          const result = getEligibleComplaints([complaint], triggerStatus, threshold, freq, [], NOW);
          expect(result.length).toBe(1);
          expect(result[0].complaint_id).toBe(id);
        },
      ),
      { numRuns: 100 },
    );
  });
});
