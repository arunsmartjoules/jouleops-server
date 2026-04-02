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
  task_line_id?: string | null;
  task_name?: string | null;
  // Exact date match (YYYY-MM-DD) or ISO-like strings (will be normalized)
  scheduled_date?: string | null;
  // Date range match (inclusive). These will be normalized to YYYY-MM-DD.
  scheduled_date_from?: string | null;
  scheduled_date_to?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  remarks?: string | null;
  site_codes?: string[];
}

// ============================================================================
// Repository Functions
// ============================================================================

/**
 * Sanitize scheduled_date: accept ISO timestamps or YYYY-MM-DD strings,
 * always store as YYYY-MM-DD (matching the DATE column type).
 */
function sanitizeScheduledDate(value: string | null | undefined): string | null {
  if (!value) return null;
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  // ISO timestamp — take the date part only
  const d = new Date(value);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return value;
}

/**
 * Create a site log
 */
export async function createLog(data: CreateSiteLogInput): Promise<SiteLog> {
  if (data.scheduled_date !== undefined) {
    data = { ...data, scheduled_date: sanitizeScheduledDate(data.scheduled_date) ?? undefined };
  }
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
    task_line_id = null,
    task_name = null,
    scheduled_date = null,
    scheduled_date_from = null,
    scheduled_date_to = null,
    date_from = null,
    date_to = null,
    remarks: remarksFilter = null,
  } = options;
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (siteCode !== "all") {
    conditions.push(`site_code = $${paramIndex}`);
    params.push(siteCode);
    paramIndex++;
  } else if (options.site_codes && options.site_codes.length > 0) {
    conditions.push(`site_code = ANY($${paramIndex}::text[])`);
    params.push(options.site_codes);
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

  const isPendingSearch = status?.toLowerCase() === "pending";

  if (isPendingSearch) {
    conditions.push(`status != $${paramIndex}`);
    params.push("Completed");
    paramIndex++;
  } else if (status) {
    conditions.push(`status = $${paramIndex}`);
    params.push(status);
    paramIndex++;
  }

  if (task_line_id) {
    conditions.push(`task_line_id = $${paramIndex}`);
    params.push(task_line_id);
    paramIndex++;
  }

  if (task_name) {
    conditions.push(`task_name = $${paramIndex}`);
    params.push(task_name);
    paramIndex++;
  }

  // If we're searching for "pending" without any date constraints, we return
  // all pending records across dates. If the caller provides date filters,
  // we apply them even for pending.
  if (!isPendingSearch || date_from || date_to) {
    if (date_from) {
      conditions.push(`created_at >= $${paramIndex}`);
      params.push(date_from);
      paramIndex++;
    }

    if (date_to) {
      conditions.push(`created_at <= $${paramIndex}`);
      params.push(date_to);
      paramIndex++;
    }
  }

  if (scheduled_date) {
    const normalized = sanitizeScheduledDate(scheduled_date);
    if (normalized) {
      conditions.push(`scheduled_date = $${paramIndex}`);
      params.push(normalized);
      paramIndex++;
    }
  }

  if (scheduled_date_from) {
    const normalized = sanitizeScheduledDate(scheduled_date_from);
    if (normalized) {
      conditions.push(`scheduled_date >= $${paramIndex}`);
      params.push(normalized);
      paramIndex++;
    }
  }

  if (scheduled_date_to) {
    const normalized = sanitizeScheduledDate(scheduled_date_to);
    if (normalized) {
      conditions.push(`scheduled_date <= $${paramIndex}`);
      params.push(normalized);
      paramIndex++;
    }
  }
  
  if (remarksFilter) {
    conditions.push(`remarks ILIKE $${paramIndex}`);
    params.push(`%${remarksFilter}%`);
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

  // Get data with sorting by log_master.sequence_number
  const data = await query<SiteLog>(
    `SELECT sl.*, lm.sequence_number 
     FROM site_logs sl
     LEFT JOIN log_master lm ON sl.task_name = lm.task_name AND sl.log_name = lm.log_name
     ${whereClause.replace(
       /([^a-zA-Z0-9_])(site_code|log_name|log_id|status|task_line_id|created_at|scheduled_date|task_name|remarks|executor_id)/g,
       "$1sl.$2",
     )}
     ORDER BY lm.sequence_number ASC NULLS LAST, sl.created_at DESC
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
 * Get log signature by ID
 */
export async function getSignatureById(id: string): Promise<string | null> {
  const result = await queryOne<{ signature: string }>(
    `SELECT signature FROM site_logs WHERE id = $1`,
    [id],
  );
  return result?.signature || null;
}

/**
 * Update a site log
 */
export async function updateLog(
  id: string,
  updateData: UpdateSiteLogInput,
): Promise<SiteLog> {
  if (updateData.scheduled_date !== undefined) {
    updateData = { ...updateData, scheduled_date: sanitizeScheduledDate(updateData.scheduled_date) ?? undefined };
  }
  const entries = Object.entries(updateData).filter(
    ([key, value]) => value !== undefined && !['id', 'created_at', 'updated_at'].includes(key),
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

/**
 * Bulk upsert site logs
 */
export async function bulkUpsertLogs(logs: CreateSiteLogInput[]): Promise<{ count: number }> {
  if (!logs || logs.length === 0) {
    return { count: 0 };
  }

  // Since site_logs doesn't have a natural unique constraint, we just perform batch inserts
  // We'll build a single multi-row INSERT query for efficiency
  
  const allColumns = Array.from(new Set(logs.flatMap(l => Object.keys(l))));
  const placeholders: string[] = [];
  const values: any[] = [];
  
  logs.forEach((log, i) => {
    const rowPlaceholders = allColumns.map((col, j) => {
      values.push((log as any)[col]);
      return `$${i * allColumns.length + j + 1}`;
    });
    placeholders.push(`(${rowPlaceholders.join(", ")})`);
  });

  const sql = `
    INSERT INTO site_logs (${allColumns.join(", ")})
    VALUES ${placeholders.join(", ")}
    RETURNING id
  `;

  const results = await query<{ id: string }>(sql, values);
  return { count: results.length };
}

export default {
  createLog,
  getLogsBySite,
  updateLog,
  deleteLog,
  deleteLogs,
  bulkUpsertLogs,
};
