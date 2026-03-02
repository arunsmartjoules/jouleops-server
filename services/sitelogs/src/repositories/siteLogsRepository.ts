/**
 * Site Logs Repository
 *
 * Data access layer for site_logs table.
 */

import { query, queryOne } from "@jouleops/shared";

// ============================================================================
// Types
// ============================================================================

export interface SiteLog {
  id: string; // UUID
  site_code: string;
  executor_id?: string;
  log_name?: string;
  temperature?: number;
  rh?: number;
  tds?: number;
  ph?: number;
  hardness?: number;
  chemical_dosing?: string;
  remarks?: string;
  entry_time?: Date;
  end_time?: Date;
  signature?: string;
  attachment?: string;
  task_line_id?: string;
  log_id?: string;
  sequence_no?: string;
  scheduled_date?: string;
  main_remarks?: string;
  task_name?: string;
  status?: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface CreateSiteLogInput {
  site_code: string;
  executor_id?: string;
  log_name?: string;
  temperature?: number;
  rh?: number;
  tds?: number;
  ph?: number;
  hardness?: number;
  chemical_dosing?: string;
  remarks?: string;
  entry_time?: Date;
  end_time?: Date;
  signature?: string;
  attachment?: string;
  task_line_id?: string;
  log_id?: string;
  sequence_no?: string;
  scheduled_date?: string;
  main_remarks?: string;
  task_name?: string;
  status?: string;
}

export interface UpdateSiteLogInput {
  executor_id?: string;
  log_name?: string;
  temperature?: number;
  rh?: number;
  tds?: number;
  ph?: number;
  hardness?: number;
  chemical_dosing?: string;
  remarks?: string;
  entry_time?: Date;
  end_time?: Date;
  signature?: string;
  attachment?: string;
  task_line_id?: string;
  log_id?: string;
  sequence_no?: string;
  scheduled_date?: string;
  main_remarks?: string;
  task_name?: string;
  status?: string;
}

export interface GetSiteLogsOptions {
  page?: number;
  limit?: number;
  log_name?: string | null;
  search?: string | null;
  site_code?: string | null;
  log_id?: string | null;
  status?: string | null;
}

// ============================================================================
// Repository Functions
// ============================================================================

/**
 * Create a site log
 */
export async function createLog(data: CreateSiteLogInput): Promise<SiteLog> {
  const columns = Object.keys(data).filter(
    (k) => data[k as keyof CreateSiteLogInput] !== undefined,
  );
  const values = columns.map((k) => data[k as keyof CreateSiteLogInput]);
  const placeholders = columns.map((_, i) => `$${i + 1}`);

  const sql = `
    INSERT INTO site_logs (${columns.join(", ")})
    VALUES (${placeholders.join(", ")})
    RETURNING *
  `;

  const log = await queryOne<SiteLog>(sql, values);

  if (!log) {
    throw new Error("Failed to create site log");
  }

  return log;
}

/**
 * Get logs by site with pagination
 */
export async function getLogsBySite(
  siteCode: string,
  options: GetSiteLogsOptions = {},
): Promise<{
  data: SiteLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}> {
  const {
    page = 1,
    limit = 20,
    log_name = null,
    search = null,
    site_code = null,
    log_id = null,
    status = null,
  } = options;
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (siteCode !== "all") {
    conditions.push(`site_code = $${paramIndex}`);
    params.push(siteCode);
    paramIndex++;
  } else if (site_code) {
    conditions.push(`site_code = $${paramIndex}`);
    params.push(site_code);
    paramIndex++;
  }

  if (log_name) {
    conditions.push(`log_name = $${paramIndex}`);
    params.push(log_name);
    paramIndex++;
  }

  if (log_id) {
    conditions.push(`log_id = $${paramIndex}`);
    params.push(log_id);
    paramIndex++;
  }

  if (status) {
    conditions.push(`status = $${paramIndex}`);
    params.push(status);
    paramIndex++;
  }

  if (search) {
    conditions.push(
      `(site_code ILIKE $${paramIndex} OR executor_id ILIKE $${paramIndex} OR remarks ILIKE $${paramIndex})`,
    );
    params.push(`%${search}%`);
    paramIndex++;
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Get count
  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM site_logs ${whereClause}`,
    params,
  );
  const total = parseInt(countResult?.count || "0", 10);

  // Get data
  const data = await query<SiteLog>(
    `SELECT * FROM site_logs ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset],
  );

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Update a site log
 */
export async function updateLog(
  id: string,
  updateData: UpdateSiteLogInput,
): Promise<SiteLog> {
  const entries = Object.entries(updateData).filter(
    ([, value]) => value !== undefined,
  );

  if (entries.length === 0) {
    throw new Error("No fields to update");
  }

  const setClauses = entries.map(([key], i) => `${key} = $${i + 1}`);
  const values = entries.map(([, value]) => value);

  const log = await queryOne<SiteLog>(
    `UPDATE site_logs
     SET ${setClauses.join(", ")}, updated_at = NOW()
     WHERE id = $${entries.length + 1}
     RETURNING *`,
    [...values, id],
  );

  if (!log) {
    throw new Error("Site log not found");
  }

  return log;
}

/**
 * Delete a site log
 */
export async function deleteLog(id: string): Promise<boolean> {
  const result = await queryOne<{ id: string }>(
    `DELETE FROM site_logs WHERE id = $1 RETURNING id`,
    [id],
  );
  return result !== null;
}

/**
 * Delete multiple site logs
 */
export async function deleteLogs(ids: string[]): Promise<{ count: number }> {
  if (!ids || ids.length === 0) {
    return { count: 0 };
  }

  const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");

  const results = await query<{ id: string }>(
    `DELETE FROM site_logs WHERE id IN (${placeholders}) RETURNING id`,
    ids,
  );

  return { count: results.length };
}

export default {
  createLog,
  getLogsBySite,
  updateLog,
  deleteLog,
  deleteLogs,
};
