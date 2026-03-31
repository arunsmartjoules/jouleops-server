/**
 * PM Response Repository
 *
 * Data access layer for pm_checklist_responses table (UUID version).
 */

import { query, queryOne } from "@jouleops/shared";

export interface PMResponse {
  id: string; // UUID
  instance_id: string; // UUID
  checklist_id: string; // UUID
  response_value?: string;
  readings?: string; // New field from pm_checklist_responses
  remarks?: string;
  image_url?: string;
  completed_by?: string;
  completed_at?: Date;
  created_at?: Date;
}

export interface CreatePMResponseInput {
  instance_id: string;
  checklist_id: string;
  response_value?: string;
  readings?: string;
  remarks?: string;
  image_url?: string;
  completed_by?: string;
}

/**
 * Create or Upsert a PM response
 */
export async function create(data: CreatePMResponseInput): Promise<PMResponse> {
  const { instance_id, checklist_id, ...updateData } = data;

  // Check for existing response to perform upsert manually
  const existing = await queryOne<PMResponse>(
    `SELECT id FROM pm_checklist_responses WHERE instance_id = $1 AND checklist_id = $2`,
    [instance_id, checklist_id],
  );

  let response: PMResponse | null;

  if (existing) {
    const entries = Object.entries(updateData).filter(
      ([, value]) => value !== undefined,
    );
    if (entries.length > 0) {
      const setClauses = entries.map(([key], i) => `${key} = $${i + 1}`);
      const values = entries.map(([, value]) => value);
      response = await queryOne<PMResponse>(
        `UPDATE pm_checklist_responses SET ${setClauses.join(", ")} WHERE id = $${entries.length + 1} RETURNING *`,
        [...values, existing.id],
      );
    } else {
      response = await getById(existing.id);
    }
  } else {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map((_, i) => `$${i + 1}`);

    response = await queryOne<PMResponse>(
      `INSERT INTO pm_checklist_responses (${columns.join(", ")})
       VALUES (${placeholders.join(", ")})
       RETURNING *`,
      values,
    );
  }

  if (!response) {
    throw new Error("Failed to upsert PM response");
  }

  await updateInstanceProgress(response.instance_id);

  return response;
}

/**
 * Get PM response by ID
 */
export async function getById(
  id: string,
  fields?: string[],
): Promise<PMResponse | null> {
  const selectFields = fields && fields.length > 0 ? fields.join(", ") : "*";
  return queryOne<PMResponse>(
    `SELECT ${selectFields} FROM pm_checklist_responses WHERE id = $1`,
    [id],
  );
}

/**
 * Get PM responses by instance
 */
export async function getByInstance(
  instanceId: string,
  fields?: string[],
): Promise<PMResponse[]> {
  const selectFields =
    fields && fields.length > 0
      ? fields.join(", ")
      : "pr.*, pc.task_name, pc.sequence_no";
  return query<PMResponse>(
    `SELECT ${selectFields} 
     FROM pm_checklist_responses pr
     LEFT JOIN pm_checklist pc ON pr.checklist_id = pc.checklist_id
     WHERE pr.instance_id = $1 
     ORDER BY pc.sequence_no ASC NULLS LAST, pr.created_at ASC`,
    [instanceId],
  );
}

/**
 * Update a PM response
 */
export async function update(
  id: string,
  data: Partial<PMResponse>,
): Promise<PMResponse> {
  const entries = Object.entries(data).filter(
    ([, value]) => value !== undefined,
  );
  if (entries.length === 0) throw new Error("No fields to update");

  const setClauses = entries.map(([key], i) => `${key} = $${i + 1}`);
  const values = entries.map(([, value]) => value);

  const response = await queryOne<PMResponse>(
    `UPDATE pm_checklist_responses
     SET ${setClauses.join(", ")}
     WHERE id = $${entries.length + 1}
     RETURNING *`,
    [...values, id],
  );

  if (!response) {
    throw new Error("PM response not found");
  }

  await updateInstanceProgress(response.instance_id);

  return response;
}

/**
 * Delete a PM response
 */
export async function remove(id: string): Promise<boolean> {
  const result = await queryOne<{ id: string }>(
    `DELETE FROM pm_checklist_responses WHERE id = $1 RETURNING id`,
    [id],
  );
  return result !== null;
}

/**
 * Update PM instance progress string 'X/Y'
 */
async function updateInstanceProgress(instanceId: string): Promise<void> {
  const stats = await queryOne<{ answered: string; total: string }>(
    `SELECT 
      (SELECT COUNT(DISTINCT checklist_id) FROM pm_checklist_responses WHERE instance_id = $1) as answered,
      (SELECT COUNT(*) FROM pm_checklist pc
       JOIN pm_instances pi ON pc.checklist_id = pi.maintenance_id
       WHERE pi.instance_id = $1) as total`,
    [instanceId],
  );

  if (stats) {
    const progressStr = `${stats.answered}/${stats.total}`;
    await query(
      `UPDATE pm_instances SET progress = $1, updated_at = NOW() WHERE instance_id = $2`,
      [progressStr, instanceId],
    );
  }
}

export default {
  create,
  getById,
  getByInstance,
  update,
  remove,
};
