/**
 * PM Checklist Repository
 *
 * Data access layer for pm_checklist and pm_checklist_responses tables.
 */

import { query, queryOne } from "@jouleops/shared";

// ============================================================================
// Types
// ============================================================================

export interface PMChecklist {
  checklist_id: string;
  site_code: string;
  task_name: string;
  asset_type?: string;
  maintenance_type?: string;
  field_type?: string;
  sequence_no?: number;
  status: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface PMChecklistResponse {
  id: number;
  instance_id: string;
  checklist_id: string;
  response_value?: string;
  readings?: string;
  remarks?: string;
  image_url?: string;
  completed_by?: string;
  completed_at?: Date;
  created_at?: Date;
}

export interface CreatePMChecklistInput {
  checklist_id: string;
  site_code: string;
  task_name: string;
  asset_type?: string;
  maintenance_type?: string;
  field_type?: string;
  sequence_no?: number;
  status?: string;
}

export interface GetPMChecklistOptions {
  checklist_id?: string | null;
  site_code?: string | null;
  task_name?: string | null;
  asset_type?: string | null;
  status?: string | null;
}

// ============================================================================
// Repository Functions
// ============================================================================

/**
 * Create a PM checklist item
 */
export async function createPMChecklist(
  data: CreatePMChecklistInput,
): Promise<PMChecklist> {
  const columns = Object.keys(data).filter(
    (k) => data[k as keyof CreatePMChecklistInput] !== undefined,
  );
  const values = columns.map((k) => data[k as keyof CreatePMChecklistInput]);
  const placeholders = columns.map((_, i) => `$${i + 1}`);

  const checklist = await queryOne<PMChecklist>(
    `INSERT INTO pm_checklist (${columns.join(", ")})
     VALUES (${placeholders.join(", ")})
     RETURNING *`,
    values,
  );

  if (!checklist) {
    throw new Error("Failed to create PM checklist");
  }

  return checklist;
}

/**
 * Get PM checklist by ID
 */
export async function getPMChecklistById(
  checklistId: string,
  fields?: string[],
): Promise<PMChecklist | null> {
  const selectFields = fields && fields.length > 0 ? fields.join(", ") : "*";
  return queryOne<PMChecklist>(
    `SELECT ${selectFields} FROM pm_checklist WHERE checklist_id = $1`,
    [checklistId],
  );
}

/**
 * Get PM checklist by site
 */
export async function getPMChecklistBySite(
  siteCode: string,
  options: GetPMChecklistOptions = {},
  fields?: string[],
): Promise<PMChecklist[]> {
  const { asset_type = null, status = "Active" } = options;
  const selectFields = fields && fields.length > 0 ? fields.join(", ") : "*";

  const conditions: string[] = ["site_code = $1"];
  const params: any[] = [siteCode];
  let paramIndex = 2;

  if (asset_type) {
    conditions.push(`asset_type = $${paramIndex}`);
    params.push(asset_type);
    paramIndex++;
  }

  if (status) {
    conditions.push(`status = $${paramIndex}`);
    params.push(status);
    paramIndex++;
  }

  return query<PMChecklist>(
    `SELECT ${selectFields} FROM pm_checklist
     WHERE ${conditions.join(" AND ")}
     ORDER BY sequence_no ASC`,
    params,
  );
}

/**
 * Get PM checklist by maintenance type
 */
export async function getPMChecklistByMaintenanceType(
  maintenanceType: string,
  siteCode?: string,
  fields?: string[],
): Promise<PMChecklist[]> {
  const conditions: string[] = ["maintenance_type = $1", "status = 'Active'"];
  const selectFields = fields && fields.length > 0 ? fields.join(", ") : "*";
  const params: any[] = [maintenanceType];
  let paramIndex = 2;

  if (siteCode) {
    conditions.push(`site_code = $${paramIndex}`);
    params.push(siteCode);
    paramIndex++;
  }

  return query<PMChecklist>(
    `SELECT ${selectFields} FROM pm_checklist
     WHERE ${conditions.join(" AND ")}
     ORDER BY sequence_no ASC`,
    params,
  );
}

/**
 * Get all PM checklists (for admin/monitoring)
 */
export async function getAllPMChecklists(
  options: GetPMChecklistOptions = {},
  fields?: string[],
): Promise<PMChecklist[]> {
  const {
    checklist_id = null,
    site_code = null,
    task_name = null,
    asset_type = null,
    status = "Active",
  } = options;
  const selectFields = fields && fields.length > 0 ? fields.join(", ") : "*";

  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (checklist_id) {
    conditions.push(`checklist_id = $${paramIndex}`);
    params.push(checklist_id);
    paramIndex++;
  }

  if (site_code) {
    conditions.push(`site_code = $${paramIndex}`);
    params.push(site_code);
    paramIndex++;
  }

  if (task_name) {
    conditions.push(`task_name ILIKE $${paramIndex}`);
    params.push(`%${task_name}%`);
    paramIndex++;
  }

  if (asset_type) {
    conditions.push(`asset_type = $${paramIndex}`);
    params.push(asset_type);
    paramIndex++;
  }

  if (status && status !== "All") {
    conditions.push(`status = $${paramIndex}`);
    params.push(status);
    paramIndex++;
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  return query<PMChecklist>(
    `SELECT ${selectFields} FROM pm_checklist
     ${whereClause}
     ORDER BY site_code, sequence_no ASC`,
    params,
  );
}

/**
 * Update PM checklist
 */
export async function updatePMChecklist(
  checklistId: string,
  updateData: Partial<PMChecklist>,
): Promise<PMChecklist> {
  const { checklist_id, created_at, ...allowedUpdates } = updateData as any;

  const entries = Object.entries(allowedUpdates).filter(
    ([, value]) => value !== undefined,
  );

  if (entries.length === 0) {
    throw new Error("No fields to update");
  }

  const setClauses = entries.map(([key], i) => `${key} = $${i + 1}`);
  const values = entries.map(([, value]) => value);

  const checklist = await queryOne<PMChecklist>(
    `UPDATE pm_checklist
     SET ${setClauses.join(", ")}, updated_at = NOW()
     WHERE checklist_id = $${entries.length + 1}
     RETURNING *`,
    [...values, checklistId],
  );

  if (!checklist) {
    throw new Error("PM checklist not found");
  }

  return checklist;
}

/**
 * Delete PM checklist (all items for a checklist business ID)
 */
export async function deletePMChecklist(checklistId: string): Promise<boolean> {
  const result = await queryOne<{ checklist_id: string }>(
    `DELETE FROM pm_checklist WHERE checklist_id = $1 RETURNING checklist_id`,
    [checklistId],
  );
  return result !== null;
}

/**
 * Get a specific PM checklist line item by UUID
 */
export async function getPMChecklistItemById(
  id: string,
  fields?: string[],
): Promise<PMChecklist | null> {
  const selectFields = fields && fields.length > 0 ? fields.join(", ") : "*";
  return queryOne<PMChecklist>(
    `SELECT ${selectFields} FROM pm_checklist WHERE id = $1`,
    [id],
  );
}

/**
 * Update a specific PM checklist line item by UUID
 */
export async function updatePMChecklistItem(
  id: string,
  updateData: Partial<PMChecklist>,
): Promise<PMChecklist> {
  const { id: _, created_at, ...allowedUpdates } = updateData as any;

  const entries = Object.entries(allowedUpdates).filter(
    ([, value]) => value !== undefined,
  );

  if (entries.length === 0) {
    throw new Error("No fields to update");
  }

  const setClauses = entries.map(([key], i) => `${key} = $${i + 1}`);
  const values = entries.map(([, value]) => value);

  const checklist = await queryOne<PMChecklist>(
    `UPDATE pm_checklist
     SET ${setClauses.join(", ")}, updated_at = NOW()
     WHERE id = $${entries.length + 1}
     RETURNING *`,
    [...values, id],
  );

  if (!checklist) {
    throw new Error("PM checklist item not found");
  }

  return checklist;
}

/**
 * Delete a specific PM checklist line item by UUID
 */
export async function deletePMChecklistItem(id: string): Promise<boolean> {
  const result = await queryOne<{ id: string }>(
    `DELETE FROM pm_checklist WHERE id = $1 RETURNING id`,
    [id],
  );
  return result !== null;
}

// ============================================================================
// Checklist Responses
// ============================================================================

/**
 * Create a checklist response
 */
export async function createChecklistResponse(data: {
  instance_id: string;
  checklist_id: string;
  response_value?: string;
  readings?: string;
  remarks?: string;
  image_url?: string;
  completed_by?: string;
}): Promise<PMChecklistResponse> {
  const response = await queryOne<PMChecklistResponse>(
    `INSERT INTO pm_checklist_responses 
     (instance_id, checklist_id, response_value, readings, remarks, image_url, completed_by, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     RETURNING *`,
    [
      data.instance_id,
      data.checklist_id,
      data.response_value || null,
      data.readings || null,
      data.remarks || null,
      data.image_url || null,
      data.completed_by || null,
    ],
  );

  if (!response) {
    throw new Error("Failed to create checklist response");
  }

  return response;
}

/**
 * Get checklist responses for an instance
 */
export async function getChecklistResponses(
  instanceId: string,
  fields?: string[],
): Promise<any[]> {
  const selectFields =
    fields && fields.length > 0
      ? fields.map((f) => `r.${f}`).join(", ")
      : "r.*";
  return query(
    `SELECT ${selectFields}, c.task_name, c.field_type, c.sequence_no
     FROM pm_checklist_responses r
     LEFT JOIN pm_checklist c ON r.checklist_id = c.checklist_id
     WHERE r.instance_id = $1
     ORDER BY r.created_at ASC`,
    [instanceId],
  );
}

/**
 * Update a checklist response
 */
export async function updateChecklistResponse(
  responseId: number,
  updateData: Partial<PMChecklistResponse>,
): Promise<PMChecklistResponse> {
  const entries = Object.entries(updateData).filter(
    ([, value]) => value !== undefined,
  );

  if (entries.length === 0) {
    throw new Error("No fields to update");
  }

  const setClauses = entries.map(([key], i) => `${key} = $${i + 1}`);
  const values = entries.map(([, value]) => value);

  const response = await queryOne<PMChecklistResponse>(
    `UPDATE pm_checklist_responses
     SET ${setClauses.join(", ")}
     WHERE id = $${entries.length + 1}
     RETURNING *`,
    [...values, responseId],
  );

  if (!response) {
    throw new Error("Checklist response not found");
  }

  return response;
}

/**
 * Delete a checklist response
 */
export async function deleteChecklistResponse(
  responseId: number,
): Promise<boolean> {
  const result = await queryOne<{ id: number }>(
    `DELETE FROM pm_checklist_responses WHERE id = $1 RETURNING id`,
    [responseId],
  );
  return result !== null;
}

export default {
  createPMChecklist,
  getPMChecklistById,
  getPMChecklistBySite,
  getPMChecklistByMaintenanceType,
  getAllPMChecklists,
  updatePMChecklist,
  deletePMChecklist,
  getPMChecklistItemById,
  updatePMChecklistItem,
  deletePMChecklistItem,
  createChecklistResponse,
  getChecklistResponses,
  updateChecklistResponse,
  deleteChecklistResponse,
};
