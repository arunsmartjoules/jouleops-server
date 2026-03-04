/**
 * PM Checklist Master Repository
 *
 * Data access layer for pm_checklist_master table.
 */

import { query, queryOne } from "@jouleops/shared";

// ============================================================================
// Types
// ============================================================================

export interface PMChecklistMaster {
  check_list_id: string; // character varying
  title: string; // character varying
  asset_type: string; // character varying
  frequency: string; // character varying
  created_at?: Date; // timestamp without time zone
}

export interface CreatePMChecklistMasterInput {
  check_list_id: string;
  title: string;
  asset_type: string;
  frequency: string;
}

// ============================================================================
// Repository Functions
// ============================================================================

/**
 * Create a PM checklist master entry
 */
export async function create(
  data: CreatePMChecklistMasterInput,
): Promise<PMChecklistMaster> {
  const columns = Object.keys(data);
  const values = Object.values(data);
  const placeholders = columns.map((_, i) => `$${i + 1}`);

  const entry = await queryOne<PMChecklistMaster>(
    `INSERT INTO pm_checklist_master (${columns.join(", ")})
     VALUES (${placeholders.join(", ")})
     RETURNING *`,
    values,
  );

  if (!entry) {
    throw new Error("Failed to create PM checklist master entry");
  }

  return entry;
}

/**
 * Get PM checklist master by ID
 */
export async function getById(
  checkListId: string,
  fields?: string[],
): Promise<PMChecklistMaster | null> {
  const selectFields = fields && fields.length > 0 ? fields.join(", ") : "*";
  return queryOne<PMChecklistMaster>(
    `SELECT ${selectFields} FROM pm_checklist_master WHERE check_list_id = $1`,
    [checkListId],
  );
}

/**
 * Get all PM checklist master entries
 */
export async function getAll(fields?: string[]): Promise<PMChecklistMaster[]> {
  const selectFields = fields && fields.length > 0 ? fields.join(", ") : "*";
  return query<PMChecklistMaster>(
    `SELECT ${selectFields} FROM pm_checklist_master ORDER BY created_at DESC`,
  );
}

/**
 * Update a PM checklist master entry
 */
export async function update(
  checkListId: string,
  data: Partial<PMChecklistMaster>,
): Promise<PMChecklistMaster> {
  const entries = Object.entries(data).filter(
    ([, value]) => value !== undefined,
  );
  if (entries.length === 0) throw new Error("No fields to update");

  const setClauses = entries.map(([key], i) => `${key} = $${i + 1}`);
  const values = entries.map(([, value]) => value);

  const entry = await queryOne<PMChecklistMaster>(
    `UPDATE pm_checklist_master
     SET ${setClauses.join(", ")}
     WHERE check_list_id = $${entries.length + 1}
     RETURNING *`,
    [...values, checkListId],
  );

  if (!entry) {
    throw new Error("PM checklist master entry not found");
  }

  return entry;
}

/**
 * Delete a PM checklist master entry
 */
export async function remove(checkListId: string): Promise<boolean> {
  const result = await queryOne<{ check_list_id: string }>(
    `DELETE FROM pm_checklist_master WHERE check_list_id = $1 RETURNING check_list_id`,
    [checkListId],
  );
  return result !== null;
}

export default {
  create,
  getById,
  getAll,
  update,
  remove,
};
