/**
 * Notification Exclusion Repository
 *
 * Handles CRUD for notification_exclusions table.
 */

import { query, queryOne } from "@jouleops/shared";

export interface ExclusionEntry {
  id: string;
  user_id: string;
  user_name: string;
  employee_code: string;
  added_at: string;
}

/**
 * Get all exclusion entries, joined with users to include user_name and employee_code.
 */
export async function getAllExclusions(): Promise<ExclusionEntry[]> {
  const sql = `
    SELECT
      ne.id,
      ne.user_id,
      u.name        AS user_name,
      u.employee_code,
      ne.added_at
    FROM notification_exclusions ne
    JOIN users u ON u.user_id = ne.user_id
    ORDER BY ne.added_at DESC
  `;
  return query<ExclusionEntry>(sql);
}

/**
 * Add a user to the exclusion list.
 * Returns the created entry (with joined user fields), or null if the user is already excluded.
 */
export async function addExclusion(userId: string): Promise<ExclusionEntry | null> {
  // Check for existing entry first to avoid relying solely on constraint error parsing
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM notification_exclusions WHERE user_id = $1`,
    [userId],
  );
  if (existing) {
    return null; // already excluded
  }

  const inserted = await queryOne<{ id: string; added_at: string }>(
    `INSERT INTO notification_exclusions (user_id) VALUES ($1) RETURNING id, added_at`,
    [userId],
  );

  if (!inserted) {
    return null;
  }

  // Fetch joined data for the response
  const entry = await queryOne<ExclusionEntry>(
    `SELECT
       ne.id,
       ne.user_id,
       u.name        AS user_name,
       u.employee_code,
       ne.added_at
     FROM notification_exclusions ne
     JOIN users u ON u.user_id = ne.user_id
     WHERE ne.id = $1`,
    [inserted.id],
  );

  return entry;
}

/**
 * Remove an exclusion entry by id.
 * Returns true if deleted, false if not found.
 */
export async function removeExclusion(id: string): Promise<boolean> {
  const result = await queryOne<{ id: string }>(
    `DELETE FROM notification_exclusions WHERE id = $1 RETURNING id`,
    [id],
  );
  return result !== null;
}

export default {
  getAllExclusions,
  addExclusion,
  removeExclusion,
};
