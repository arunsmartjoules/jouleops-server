/**
 * PM Response Repository
 *
 * Data access layer for pm_response table (UUID version).
 */

import { query, queryOne } from "@jouleops/shared";

export interface PMResponse {
  id: string; // UUID
  instance_id: string; // UUID
  checklist_id: string; // UUID
  response_value?: string;
  remarks?: string;
  image_url?: string;
  created_at?: Date;
}

export interface CreatePMResponseInput {
  instance_id: string;
  checklist_id: string;
  response_value?: string;
  remarks?: string;
  image_url?: string;
}

/**
 * Create a PM response
 */
export async function create(data: CreatePMResponseInput): Promise<PMResponse> {
  const columns = Object.keys(data);
  const values = Object.values(data);
  const placeholders = columns.map((_, i) => `$${i + 1}`);

  const response = await queryOne<PMResponse>(
    `INSERT INTO pm_response (${columns.join(", ")})
     VALUES (${placeholders.join(", ")})
     RETURNING *`,
    values,
  );

  if (!response) {
    throw new Error("Failed to create PM response");
  }

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
    `SELECT ${selectFields} FROM pm_response WHERE id = $1`,
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
  const selectFields = fields && fields.length > 0 ? fields.join(", ") : "*";
  return query<PMResponse>(
    `SELECT ${selectFields} FROM pm_response 
     WHERE instance_id = $1 
     ORDER BY created_at ASC`,
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
    `UPDATE pm_response
     SET ${setClauses.join(", ")}
     WHERE id = $${entries.length + 1}
     RETURNING *`,
    [...values, id],
  );

  if (!response) {
    throw new Error("PM response not found");
  }

  return response;
}

/**
 * Delete a PM response
 */
export async function remove(id: string): Promise<boolean> {
  const result = await queryOne<{ id: string }>(
    `DELETE FROM pm_response WHERE id = $1 RETURNING id`,
    [id],
  );
  return result !== null;
}

export default {
  create,
  getById,
  getByInstance,
  update,
  remove,
};
