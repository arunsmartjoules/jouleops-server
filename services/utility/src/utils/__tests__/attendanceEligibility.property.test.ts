// Feature: push-notification-control, Property 1: Punch-in eligibility determines notification dispatch
// Feature: push-notification-control, Property 2: Punch-out eligibility determines notification dispatch
//
// Property 1: Validates: Requirements 1.1, 1.2
// Property 2: Validates: Requirements 2.1, 2.2

import { describe, test, expect } from "bun:test";
import * as fc from "fast-check";
import {
  getPunchInEligibleUsers,
  getPunchOutEligibleUsers,
  type User,
  type AttendanceRecord,
} from "../attendanceEligibility.ts";

function utcDateAtMinutes(m: number): Date {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return new Date(`2024-06-15T${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}:00Z`);
}

const TZ = "UTC";
const NOW = new Date("2024-06-15T12:00:00Z");
const userArb = fc.record({ user_id: fc.uuid() });
const usersArb = fc.uniqueArray(userArb, { minLength: 0, maxLength: 10, selector: (u) => u.user_id });
const thresholdArb = fc.integer({ min: 0, max: 1439 });
const punchArb = fc.integer({ min: 0, max: 1439 });

describe('Property 1: Punch-in eligibility determines notification dispatch', () => {
  test('a user with no attendance record is always eligible', () => {
    fc.assert(
      fc.property(usersArb, thresholdArb, (users, threshold) => {
        const result = getPunchInEligibleUsers(users, [], threshold, TZ, NOW);
        expect(result.length).toBe(users.length);
        for (const user of users) {
          expect(result.some((u) => u.user_id === user.user_id)).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });

  test('a user whose punch_in_time < threshold is NOT eligible', () => {
    fc.assert(
      fc.property(fc.uuid(), thresholdArb.filter((t) => t > 0), (userId, threshold) => {
        const user: User = { user_id: userId };
        const record: AttendanceRecord = {
          user_id: userId,
          punch_in_time: utcDateAtMinutes(threshold - 1),
          punch_out_time: null,
        };
        const result = getPunchInEligibleUsers([user], [record], threshold, TZ, NOW);
        expect(result.length).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  test('a user whose punch_in_time is null is eligible', () => {
    fc.assert(
      fc.property(fc.uuid(), thresholdArb, (userId, threshold) => {
        const user: User = { user_id: userId };
        const record: AttendanceRecord = { user_id: userId, punch_in_time: null, punch_out_time: null };
        const result = getPunchInEligibleUsers([user], [record], threshold, TZ, NOW);
        expect(result.length).toBe(1);
        expect(result[0].user_id).toBe(userId);
      }),
      { numRuns: 100 },
    );
  });

  test('the returned set is always a subset of the input users', () => {
    fc.assert(
      fc.property(usersArb, thresholdArb, fc.array(punchArb, { minLength: 0, maxLength: 10 }), (users, threshold, mins) => {
        const records: AttendanceRecord[] = users.slice(0, mins.length).map((u, i) => ({
          user_id: u.user_id,
          punch_in_time: utcDateAtMinutes(mins[i]),
          punch_out_time: null,
        }));
        const result = getPunchInEligibleUsers(users, records, threshold, TZ, NOW);
        const ids = new Set(users.map((u) => u.user_id));
        for (const u of result) expect(ids.has(u.user_id)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  test('no user appears twice in the result', () => {
    fc.assert(
      fc.property(usersArb, thresholdArb, fc.array(punchArb, { minLength: 0, maxLength: 10 }), (users, threshold, mins) => {
        const records: AttendanceRecord[] = users.slice(0, mins.length).map((u, i) => ({
          user_id: u.user_id,
          punch_in_time: utcDateAtMinutes(mins[i]),
          punch_out_time: null,
        }));
        const result = getPunchInEligibleUsers(users, records, threshold, TZ, NOW);
        const resultIds = result.map((u) => u.user_id);
        expect(new Set(resultIds).size).toBe(resultIds.length);
      }),
      { numRuns: 100 },
    );
  });
});

describe('Property 2: Punch-out eligibility determines notification dispatch', () => {
  test('a user with no attendance record is never eligible', () => {
    fc.assert(
      fc.property(usersArb, thresholdArb, (users, threshold) => {
        const result = getPunchOutEligibleUsers(users, [], threshold, TZ, NOW);
        expect(result.length).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  test('a user with punch_in but no punch_out is always eligible', () => {
    fc.assert(
      fc.property(fc.uuid(), thresholdArb, punchArb, (userId, threshold, punchInMins) => {
        const user: User = { user_id: userId };
        const record: AttendanceRecord = {
          user_id: userId,
          punch_in_time: utcDateAtMinutes(punchInMins),
          punch_out_time: null,
        };
        const result = getPunchOutEligibleUsers([user], [record], threshold, TZ, NOW);
        expect(result.length).toBe(1);
        expect(result[0].user_id).toBe(userId);
      }),
      { numRuns: 100 },
    );
  });

  test('a user with punch_in AND punch_out where punch_out < threshold is NOT eligible', () => {
    fc.assert(
      fc.property(fc.uuid(), thresholdArb.filter((t) => t > 0), punchArb, (userId, threshold, punchInMins) => {
        const user: User = { user_id: userId };
        const record: AttendanceRecord = {
          user_id: userId,
          punch_in_time: utcDateAtMinutes(punchInMins),
          punch_out_time: utcDateAtMinutes(threshold - 1),
        };
        const result = getPunchOutEligibleUsers([user], [record], threshold, TZ, NOW);
        expect(result.length).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  test('a user with no punch_in is never eligible (even if punch_out exists)', () => {
    fc.assert(
      fc.property(fc.uuid(), thresholdArb, punchArb, (userId, threshold, punchOutMins) => {
        const user: User = { user_id: userId };
        const record: AttendanceRecord = {
          user_id: userId,
          punch_in_time: null,
          punch_out_time: utcDateAtMinutes(punchOutMins),
        };
        const result = getPunchOutEligibleUsers([user], [record], threshold, TZ, NOW);
        expect(result.length).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  test('the returned set is always a subset of the input users', () => {
    fc.assert(
      fc.property(
        usersArb,
        thresholdArb,
        fc.array(
          fc.record({ punchIn: punchArb, punchOut: fc.option(punchArb, { nil: null }) }),
          { minLength: 0, maxLength: 10 },
        ),
        (users, threshold, punchData) => {
          const records: AttendanceRecord[] = users.slice(0, punchData.length).map((u, i) => ({
            user_id: u.user_id,
            punch_in_time: utcDateAtMinutes(punchData[i].punchIn),
            punch_out_time: punchData[i].punchOut !== null ? utcDateAtMinutes(punchData[i].punchOut) : null,
          }));
          const result = getPunchOutEligibleUsers(users, records, threshold, TZ, NOW);
          const ids = new Set(users.map((u) => u.user_id));
          for (const u of result) expect(ids.has(u.user_id)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
