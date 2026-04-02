/**
 * Log Master Site Repository
 *
 * Data access layer for log_master_site table.
 */

import { query, queryOne, buildQuery } from "@jouleops/shared";

// ============================================================================
// Types
// ============================================================================

export interface LogMasterSite {
  id: string;
  log_id: string;
  log_name: string;
  frequency: string;
  site_id: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface CreateLogMasterSiteInput {
  log_id: string;
  log_name: string;
  frequency?: string;
  site_id: string;
}

export interface UpdateLogMasterSiteInput {
  log_id?: string;
  log_name?: string;
  frequency?: string;
  site_id?: string;
}

export interface GetLogMasterSiteOptions {
  page?: number | string;
  limit?: number | string;
  search?: string | null;
  log_id?: string | null;
  log_name?: string | null;
  frequency?: string | null;
  site_id?: string | null;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

// ============================================================================
// Repository Functions
// ============================================================================

/**
 * Create a log master site entry
 */
export async function createLogMasterSite(
  data: CreateLogMasterSiteInput,
): Promise<LogMasterSite> {
  const columns = Object.keys(data).filter(
    (k) => data[k as keyof CreateLogMasterSiteInput] !== undefined,
  );
  const values = columns.map((k) => data[k as keyof CreateLogMasterSiteInput]);
  const placeholders = columns.map((_, i) => `$${i + 1}`);

  const sql = `
    INSERT INTO log_master_site (${columns.join(", ")})
    VALUES (${placeholders.join(", ")})
    RETURNING *
  `;

  const record = await queryOne<LogMasterSite>(sql, values);

  if (!record) {
    throw new Error("Failed to create log master site entry");
  }

  return record;
}

/**
 * Get all log master site entries with filtering and pagination
 */
export async function getAllLogMasterSites(
  options: GetLogMasterSiteOptions = {},
): Promise<{
  data: LogMasterSite[];
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
    filters.push({ fieldId: "log_name", operator: "=", value: options.log_name });
  }
  if (options.frequency) {
    filters.push({ fieldId: "frequency", operator: "=", value: options.frequency });
  }
  if (options.site_id) {
    filters.push({ fieldId: "site_id", operator: "=", value: options.site_id });
  }

  const { whereClause, orderClause, limitClause, values } = buildQuery(
    {
      ...options,
      search: search ?? undefined,
      filters: filters.length > 0 ? filters : undefined,
    },
    {
      tableAlias: "lms",
      searchFields: ["log_id", "log_name", "site_id"],
      allowedFields: [
        "id",
        "log_id",
        "log_name",
        "frequency",
        "site_id",
        "created_at",
        "updated_at",
      ],
      defaultSort: "created_at",
      defaultSortOrder: "desc",
    },
  );

  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM log_master_site lms ${whereClause}`,
    values.slice(0, -2),
  );
  const total = parseInt(countResult?.count || "0", 10);

  const sql = `
    SELECT * FROM log_master_site lms
    ${whereClause}
    ${orderClause}
    ${limitClause}
  `;

  const data = await query<LogMasterSite>(sql, values);

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
 * Get a single log master site entry by ID
 */
export async function getLogMasterSiteById(
  id: string,
): Promise<LogMasterSite | null> {
  const sql = `SELECT * FROM log_master_site WHERE id = $1`;
  return queryOne<LogMasterSite>(sql, [id]);
}

/**
 * Update a log master site entry (partial update)
 */
export async function updateLogMasterSite(
  id: string,
  updateData: UpdateLogMasterSiteInput,
): Promise<LogMasterSite> {
  const entries = Object.entries(updateData).filter(
    ([key, value]) =>
      value !== undefined && !["id", "created_at", "updated_at"].includes(key),
  );

  if (entries.length === 0) {
    throw new Error("No fields to update");
  }

  const setClauses = entries.map(([key], i) => `${key} = $${i + 1}`);
  const values = entries.map(([, value]) => value);

  const record = await queryOne<LogMasterSite>(
    `UPDATE log_master_site
     SET ${setClauses.join(", ")}, updated_at = NOW()
     WHERE id = $${entries.length + 1}
     RETURNING *`,
    [...values, id],
  );

  if (!record) {
    throw new Error("Log master site entry not found");
  }

  return record;
}

/**
 * Delete a log master site entry
 */
export async function deleteLogMasterSite(id: string): Promise<boolean> {
  const result = await queryOne<{ id: string }>(
    `DELETE FROM log_master_site WHERE id = $1 RETURNING id`,
    [id],
  );
  return result !== null;
}

/**
 * Bulk delete log master site entries
 */
export async function bulkDeleteLogMasterSites(ids: string[]): Promise<boolean> {
  if (!ids || ids.length === 0) return false;
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
  const result = await query(
    `DELETE FROM log_master_site WHERE id IN (${placeholders}) RETURNING id`,
    ids,
  );
  return result.length > 0;
}

export default {
  createLogMasterSite,
  getAllLogMasterSites,
  getLogMasterSiteById,
  updateLogMasterSite,
  deleteLogMasterSite,
  bulkDeleteLogMasterSites,
};
