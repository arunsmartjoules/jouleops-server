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
  checklist_id: string; // character varying
  title: string; // character varying
  asset_type: string; // character varying
  frequency: string; // character varying
  site_code?: string; // text
  created_at?: Date; // timestamp without time zone
}

export interface GetPMChecklistMasterOptions {
  checklist_id?: string;
  site_code?: string;
  title?: string;
  asset_type?: string;
  fields?: string[];
}

export interface CreatePMChecklistMasterInput {
  checklist_id: string;
  title: string;
  asset_type: string;
  frequency: string;
  site_code?: string;
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
  checklistId: string,
  fields?: string[],
): Promise<PMChecklistMaster | null> {
  const selectFields = fields && fields.length > 0 ? fields.join(", ") : "*";
  return queryOne<PMChecklistMaster>(
    `SELECT ${selectFields} FROM pm_checklist_master WHERE checklist_id = $1`,
    [checklistId],
  );
}

/**
 * Get PM checklist master entries with multi-criteria filters
 */
export async function getFiltered(
  options: GetPMChecklistMasterOptions = {},
): Promise<PMChecklistMaster[]> {
  const { checklist_id, site_code, title, asset_type, fields = [] } = options;
  const selectFields = fields && fields.length > 0 ? fields.join(", ") : "*";

  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (checklist_id) {
    conditions.push(`checklist_id = $${paramIndex++}`);
    params.push(checklist_id);
  }
  if (site_code) {
    conditions.push(`site_code = $${paramIndex++}`);
    params.push(site_code);
  }
  if (title) {
    conditions.push(`title ILIKE $${paramIndex++}`);
    params.push(`%${title}%`);
  }
  if (asset_type) {
    conditions.push(`asset_type = $${paramIndex++}`);
    params.push(asset_type);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  return query<PMChecklistMaster>(
    `SELECT ${selectFields} FROM pm_checklist_master ${whereClause} ORDER BY created_at DESC`,
    params,
  );
}
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
  checklistId: string,
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
     WHERE checklist_id = $${entries.length + 1}
     RETURNING *`,
    [...values, checklistId],
  );

  if (!entry) {
    throw new Error("PM checklist master entry not found");
  }

  return entry;
}

/**
 * Delete a PM checklist master entry
 */
export async function remove(checklistId: string): Promise<boolean> {
  const result = await queryOne<{ checklist_id: string }>(
    `DELETE FROM pm_checklist_master WHERE checklist_id = $1 RETURNING checklist_id`,
    [checklistId],
  );
  return result !== null;
}

export default {
  create,
  getById,
  getFiltered,
  getAll,
  update,
  remove,
};
