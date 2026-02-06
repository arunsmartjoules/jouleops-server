/**
 * PM Checklist Repository
 *
 * Data access layer for pm_checklist and pm_checklist_responses tables.
 */

import { query, queryOne } from "@smartops/shared";

// ============================================================================
// Types
// ============================================================================

export interface PMChecklist {
  checklist_id: string;
  site_id: string;
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
  remarks?: string;
  image_url?: string;
  completed_by?: string;
  completed_at?: Date;
  created_at?: Date;
}

export interface CreatePMChecklistInput {
  checklist_id: string;
  site_id: string;
  task_name: string;
  asset_type?: string;
  maintenance_type?: string;
  field_type?: string;
  sequence_no?: number;
  status?: string;
}

export interface GetPMChecklistOptions {
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
): Promise<PMChecklist | null> {
  return queryOne<PMChecklist>(
    `SELECT * FROM pm_checklist WHERE checklist_id = $1`,
    [checklistId],
  );
}

/**
 * Get PM checklist by site
 */
export async function getPMChecklistBySite(
  siteId: string,
  options: GetPMChecklistOptions = {},
): Promise<PMChecklist[]> {
  const { asset_type = null, status = "Active" } = options;

  const conditions: string[] = ["site_id = $1"];
  const params: any[] = [siteId];
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
    `SELECT * FROM pm_checklist
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
  siteId?: string,
): Promise<PMChecklist[]> {
  const conditions: string[] = ["maintenance_type = $1", "status = 'Active'"];
  const params: any[] = [maintenanceType];
  let paramIndex = 2;

  if (siteId) {
    conditions.push(`site_id = $${paramIndex}`);
    params.push(siteId);
    paramIndex++;
  }

  return query<PMChecklist>(
    `SELECT * FROM pm_checklist
     WHERE ${conditions.join(" AND ")}
     ORDER BY sequence_no ASC`,
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
 * Delete PM checklist
 */
export async function deletePMChecklist(checklistId: string): Promise<boolean> {
  const result = await queryOne<{ checklist_id: string }>(
    `DELETE FROM pm_checklist WHERE checklist_id = $1 RETURNING checklist_id`,
    [checklistId],
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
  remarks?: string;
  image_url?: string;
  completed_by?: string;
}): Promise<PMChecklistResponse> {
  const response = await queryOne<PMChecklistResponse>(
    `INSERT INTO pm_checklist_responses 
     (instance_id, checklist_id, response_value, remarks, image_url, completed_by, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     RETURNING *`,
    [
      data.instance_id,
      data.checklist_id,
      data.response_value || null,
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
): Promise<any[]> {
  return query(
    `SELECT r.*, c.task_name, c.field_type, c.sequence_no
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

export default {
  createPMChecklist,
  getPMChecklistById,
  getPMChecklistBySite,
  getPMChecklistByMaintenanceType,
  updatePMChecklist,
  deletePMChecklist,
  createChecklistResponse,
  getChecklistResponses,
  updateChecklistResponse,
};
