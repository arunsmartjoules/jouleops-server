/**
 * Log Master Repository
 *
 * Data access layer for log_master table.
 */

import { query, queryOne, buildQuery } from "@jouleops/shared";

// ============================================================================
// Types
// ============================================================================

export interface LogMaster {
  id: string; // UUID
  task_name: string;
  log_name: string;
  sequence_numberIndex?: number;
  log_id?: string;
  dlr?: string;
  dbr?: string;
  nlt?: string;
  nmt?: string;
  sequence_number?: number;
  created_at?: Date;
  updated_at?: Date;
}

export interface CreateLogMasterInput {
  task_name: string;
  log_name: string;
  sequence_number?: number;
  log_id?: string;
  dlr?: string;
  dbr?: string;
  nlt?: string;
  nmt?: string;
}

export interface UpdateLogMasterInput {
  task_name?: string;
  log_name?: string;
  sequence_number?: number;
  log_id?: string;
  dlr?: string;
  dbr?: string;
  nlt?: string;
  nmt?: string;
}

export interface GetLogMasterOptions {
  page?: number | string;
  limit?: number | string;
  search?: string | null;
  log_id?: string | null;
  log_name?: string | null;
  task_name?: string | null;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

// ============================================================================
// Repository Functions
// ============================================================================

/**
 * Create a log master entry
 */
export async function createLogMaster(
  data: CreateLogMasterInput,
): Promise<LogMaster> {
  const columns = Object.keys(data).filter(
    (k) => data[k as keyof CreateLogMasterInput] !== undefined,
  );
  const values = columns.map((k) => data[k as keyof CreateLogMasterInput]);
  const placeholders = columns.map((_, i) => `$${i + 1}`);

  const sql = `
    INSERT INTO log_master (${columns.join(", ")})
    VALUES (${placeholders.join(", ")})
    RETURNING *
  `;

  const record = await queryOne<LogMaster>(sql, values);

  if (!record) {
    throw new Error("Failed to create log master entry");
  }

  return record;
}

/**
 * Get all log master entries with filtering and pagination
 */
export async function getAllLogMasters(
  options: GetLogMasterOptions = {},
): Promise<{
  data: LogMaster[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}> {
  const { page = 1, limit = 1000, search = null } = options;

  const filters: any[] = [];
  if (options.log_id) {
    filters.push({ fieldId: "log_id", operator: "=", value: options.log_id });
  }
  if (options.log_name) {
    filters.push({
      fieldId: "log_name",
      operator: "=",
      value: options.log_name,
    });
  }
  if (options.task_name) {
    filters.push({
      fieldId: "task_name",
      operator: "=",
      value: options.task_name,
    });
  }

  const { whereClause, orderClause, limitClause, values } = buildQuery(
    {
      ...options,
      search: search ?? undefined,
      filters: filters.length > 0 ? filters : undefined,
    },
    {
      tableAlias: "lm",
      searchFields: ["task_name", "log_name", "log_id"],
      allowedFields: [
        "id",
        "task_name",
        "log_name",
        "log_id",
        "sequence_number",
        "created_at",
        "updated_at",
      ],
      defaultSort: "sequence_number",
      defaultSortOrder: "asc",
    },
  );

  // Get Total Count
  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM log_master lm ${whereClause}`,
    values.slice(0, -2),
  );
  const total = parseInt(countResult?.count || "0", 10);

  // Get Data
  const sql = `
    SELECT * FROM log_master lm
    ${whereClause}
    ${orderClause}
    ${limitClause}
  `;

  const data = await query<LogMaster>(sql, values);

  const numPage = Number(page);
  const numLimit = Number(limit);

  return {
    data,
    pagination: {
      page: numPage,
      limit: numLimit,
      total,
      totalPages: Math.ceil(total / numLimit),
    },
  };
}

/**
 * Get a single log master by ID
 */
export async function getLogMasterById(id: string): Promise<LogMaster | null> {
  const sql = `SELECT * FROM log_master WHERE id = $1`;
  return queryOne<LogMaster>(sql, [id]);
}

/**
 * Update a log master entry
 */
export async function updateLogMaster(
  id: string,
  updateData: UpdateLogMasterInput,
): Promise<LogMaster> {
  const entries = Object.entries(updateData).filter(
    ([key, value]) => value !== undefined && !['id', 'created_at', 'updated_at'].includes(key),
  );

  if (entries.length === 0) {
    throw new Error("No fields to update");
  }

  const setClauses = entries.map(([key], i) => `${key} = $${i + 1}`);
  const values = entries.map(([, value]) => value);

  const record = await queryOne<LogMaster>(
    `UPDATE log_master
     SET ${setClauses.join(", ")}, updated_at = NOW()
     WHERE id = $${entries.length + 1}
     RETURNING *`,
    [...values, id],
  );

  if (!record) {
    throw new Error("Log master entry not found");
  }

  return record;
}

/**
 * Delete a log master entry
 */
export async function deleteLogMaster(id: string): Promise<boolean> {
  const result = await queryOne<{ id: string }>(
    `DELETE FROM log_master WHERE id = $1 RETURNING id`,
    [id],
  );
  return result !== null;
}

/**
 * Bulk create/update log master entries
 */
export async function bulkUpsertLogMasters(
  logs: CreateLogMasterInput[],
): Promise<void> {
  // This is a simple implementation, ideally would use a more efficient bulk insert
  for (const log of logs) {
    // Use task_name and log_name as a unique constraint if possible,
    // but for now we'll just check if it exists or create new
    const existing = await queryOne<LogMaster>(
      `SELECT id FROM log_master WHERE task_name = $1 AND log_name = $2`,
      [log.task_name, log.log_name],
    );

    if (existing) {
      await updateLogMaster(existing.id, log);
    } else {
      await createLogMaster(log);
    }
  }
}

/**
 * Bulk delete log master entries
 */
export async function bulkDeleteLogMasters(ids: string[]): Promise<boolean> {
  if (!ids || ids.length === 0) return false;
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
  const result = await query(
    `DELETE FROM log_master WHERE id IN (${placeholders}) RETURNING id`,
    ids,
  );
  return result.length > 0;
}

export default {
  createLogMaster,
  getAllLogMasters,
  getLogMasterById,
  updateLogMaster,
  deleteLogMaster,
  bulkUpsertLogMasters,
  bulkDeleteLogMasters,
};
