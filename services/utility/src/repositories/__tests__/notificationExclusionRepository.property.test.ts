// Feature: push-notification-control, Property 11: Exclusion list deduplication (idempotence)
//
// For any user already present in the exclusion list, attempting to add that user again
// should result in exactly one entry in the exclusion list (no duplicates).
//
// Validates: Requirements 8.5

import { describe, test, expect, mock, beforeEach } from "bun:test";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// In-memory DB store — simulates notification_exclusions joined with users
// ---------------------------------------------------------------------------

type ExclusionRow = {
  id: string;
  user_id: string;
  added_at: string;
};

type UserRow = {
  user_id: string;
  name: string;
  employee_code: string;
};

let exclusionStore: Map<string, ExclusionRow>; // keyed by id
let userStore: Map<string, UserRow>;           // keyed by user_id
let idCounter: number;

function makeEmptyStores() {
  exclusionStore = new Map<string, ExclusionRow>();
  userStore = new Map<string, UserRow>();
}

function generateId(): string {
  return `excl-id-${++idCounter}`;
}

// ---------------------------------------------------------------------------
// Mock @jouleops/shared before importing the repository
// ---------------------------------------------------------------------------

mock.module("@jouleops/shared", () => {
  return {
    // query<T>(sql, params) — used by getAllExclusions
    // Returns all exclusion rows joined with user data, ordered by added_at DESC
    query: async <T>(_sql: string, _params?: any[]): Promise<T[]> => {
      const rows = [...exclusionStore.values()]
        .sort((a, b) => new Date(b.added_at).getTime() - new Date(a.added_at).getTime())
        .map((excl) => {
          const user = userStore.get(excl.user_id);
          return {
            id: excl.id,
            user_id: excl.user_id,
            user_name: user?.name ?? "Unknown",
            employee_code: user?.employee_code ?? "",
            added_at: excl.added_at,
          };
        });
      return rows as unknown as T[];
    },

    // queryOne<T>(sql, params) — used by addExclusion and removeExclusion
    queryOne: async <T>(sql: string, params?: any[]): Promise<T | null> => {
      const normalised = sql.replace(/\s+/g, " ").trim().toUpperCase();

      // SELECT — duplicate check in addExclusion
      // "SELECT id FROM notification_exclusions WHERE user_id = $1"
      if (
        normalised.startsWith("SELECT ID FROM NOTIFICATION_EXCLUSIONS") &&
        normalised.includes("WHERE USER_ID")
      ) {
        const userId = params![0] as string;
        const existing = [...exclusionStore.values()].find((r) => r.user_id === userId);
        return (existing ? { id: existing.id } : null) as unknown as T;
      }

      // INSERT RETURNING — addExclusion inserts the row
      // "INSERT INTO notification_exclusions (user_id) VALUES ($1) RETURNING id, added_at"
      if (normalised.startsWith("INSERT INTO NOTIFICATION_EXCLUSIONS")) {
        const userId = params![0] as string;
        const id = generateId();
        const now = new Date().toISOString();
        const row: ExclusionRow = { id, user_id: userId, added_at: now };
        exclusionStore.set(id, row);
        return { id, added_at: now } as unknown as T;
      }

      // SELECT joined — addExclusion fetches full entry after insert
      // "SELECT ne.id, ne.user_id, u.name AS user_name, u.employee_code, ne.added_at
      //  FROM notification_exclusions ne JOIN users u ... WHERE ne.id = $1"
      if (
        normalised.startsWith("SELECT") &&
        normalised.includes("NOTIFICATION_EXCLUSIONS NE") &&
        normalised.includes("WHERE NE.ID")
      ) {
        const id = params![0] as string;
        const excl = exclusionStore.get(id);
        if (!excl) return null;
        const user = userStore.get(excl.user_id);
        return {
          id: excl.id,
          user_id: excl.user_id,
          user_name: user?.name ?? "Unknown",
          employee_code: user?.employee_code ?? "",
          added_at: excl.added_at,
        } as unknown as T;
      }

      // DELETE RETURNING — removeExclusion
      // "DELETE FROM notification_exclusions WHERE id = $1 RETURNING id"
      if (normalised.startsWith("DELETE FROM NOTIFICATION_EXCLUSIONS")) {
        const id = params![0] as string;
        const row = exclusionStore.get(id);
        if (!row) return null;
        exclusionStore.delete(id);
        return { id } as unknown as T;
      }

      return null;
    },
  };
});

// Import AFTER mock.module so the repository picks up the mocked @jouleops/shared
const { getAllExclusions, addExclusion } = await import(
  "../notificationExclusionRepository.ts"
);

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Random UUID for user_id */
const userIdArb = fc.uuid();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Property 11: Exclusion list deduplication (idempotence)", () => {
  beforeEach(() => {
    makeEmptyStores();
    idCounter = 0;
  });

  test(
    "adding the same user_id twice results in exactly one entry in getAllExclusions",
    async () => {
      await fc.assert(
        fc.asyncProperty(userIdArb, async (userId) => {
          // Reset stores for each iteration
          makeEmptyStores();
          idCounter = 0;

          // Seed a fake user so the join in getAllExclusions works
          userStore.set(userId, {
            user_id: userId,
            name: "Test User",
            employee_code: "EMP001",
          });

          // First add — should succeed and return an entry
          const first = await addExclusion(userId);
          expect(first).not.toBeNull();
          expect(first!.user_id).toBe(userId);

          // Second add — should return null (already excluded)
          const second = await addExclusion(userId);
          expect(second).toBeNull();

          // Exactly one entry must exist in the exclusion list
          const all = await getAllExclusions();
          expect(all).toHaveLength(1);
          expect(all[0].user_id).toBe(userId);
        }),
        { numRuns: 100 },
      );
    },
  );

  test(
    "adding N distinct users then re-adding each one still yields exactly N entries",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }).filter(
            (ids) => new Set(ids).size === ids.length, // ensure all UUIDs are distinct
          ),
          async (userIds) => {
            makeEmptyStores();
            idCounter = 0;

            // Seed fake users
            for (const uid of userIds) {
              userStore.set(uid, {
                user_id: uid,
                name: `User ${uid.slice(0, 8)}`,
                employee_code: `EMP-${uid.slice(0, 4)}`,
              });
            }

            // Add each user once
            for (const uid of userIds) {
              const result = await addExclusion(uid);
              expect(result).not.toBeNull();
            }

            // Re-add each user — all should return null
            for (const uid of userIds) {
              const result = await addExclusion(uid);
              expect(result).toBeNull();
            }

            // Still exactly N entries
            const all = await getAllExclusions();
            expect(all).toHaveLength(userIds.length);

            // Each user_id appears exactly once
            const returnedIds = all.map((e) => e.user_id).sort();
            const expectedIds = [...userIds].sort();
            expect(returnedIds).toEqual(expectedIds);
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});
