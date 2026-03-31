/**
 * PM Instances Repository
 *
 * Data access layer for pm_instances table.
 */

import { query, queryOne, buildQuery } from "@jouleops/shared";
import type { FilterRule } from "@jouleops/shared";

// ============================================================================
// Types
// ============================================================================

export interface PMInstance {
  id: string; // UUID
  instance_id: string;
  site_code: string;
  asset_id?: string;
  maintenance_id?: string;
  checklist_version?: string;
  title?: string;
  description?: string;
  location?: string;
  asset_type?: string;
  floor?: string;
  frequency?: string;
  start_due_date?: Date;
  start_datetime?: Date;
  end_datetime?: Date;
  status: string;
  progress?: string;
  estimated_duration?: string;
  inventory_id?: string;
  created_by?: string;
  updated_by?: string;
  assigned_to?: string;
  teams?: string;
  teams_name?: string;
  assigned_to_name?: string;
  remarks?: string;
  client_sign?: string;
  before_image?: string;
  after_image?: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface CreatePMInstanceInput {
  instance_id: string;
  site_code: string;
  asset_id?: string;
  maintenance_id?: string;
  checklist_version?: string;
  title?: string;
  description?: string;
  location?: string;
  asset_type?: string;
  floor?: string;
  frequency?: string;
  start_due_date?: Date;
  status?: string;
  progress?: string;
  estimated_duration?: string;
  inventory_id?: string;
  created_by?: string;
  assigned_to?: string;
  teams?: string;
  teams_name?: string;
  assigned_to_name?: string;
  remarks?: string;
  client_sign?: string;
  before_image?: string;
  after_image?: string;
}

export interface GetPMInstancesOptions {
  instance_id?: string | null;
  maintenance_id?: string | null;
  page?: number | string;
  limit?: number | string;
  status?: string | null;
  frequency?: string | null;
  asset_type?: string | null;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  fields?: string[];
  search?: string | null;
  filters?: FilterRule[] | string | null;
  from_date?: string | null;
  to_date?: string | null;
}

// ============================================================================
// Helper Functions
// ============================================================================

const isUuid = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

// ============================================================================
// Repository Functions
// ============================================================================

/**
 * Create a PM instance
 */
export async function createPMInstance(
  data: CreatePMInstanceInput,
): Promise<PMInstance> {
  const columns = Object.keys(data).filter(
    (k) => data[k as keyof CreatePMInstanceInput] !== undefined,
  );
  const values = columns.map((k) => data[k as keyof CreatePMInstanceInput]);
  const placeholders = columns.map((_, i) => `$${i + 1}`);

  const instance = await queryOne<PMInstance>(
    `INSERT INTO pm_instances (${columns.join(", ")})
     VALUES (${placeholders.join(", ")})
     RETURNING *`,
    values,
  );

  if (!instance) {
    throw new Error("Failed to create PM instance");
  }

  return instance;
}

/**
 * Get PM instance by ID
 */
export async function getPMInstanceById(
  instanceId: string,
  fields?: string[],
): Promise<PMInstance | null> {
  const selectFields = fields && fields.length > 0 ? fields.join(", ") : "*";
  const column = isUuid(instanceId) ? "id" : "instance_id";
  return queryOne<PMInstance>(
    `SELECT ${selectFields} FROM pm_instances WHERE ${column} = $1`,
    [instanceId],
  );
}

/**
 * Get PM instances by site with pagination
 */
export async function getPMInstancesBySite(
  siteCode: string,
  options: GetPMInstancesOptions = {},
): Promise<{
  data: PMInstance[];
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
    status = null,
    frequency = null,
    asset_type = null,
    search = null,
    filters: optFilters = null,
    from_date = null,
    to_date = null,
  } = options;

  const filters: FilterRule[] = [];
  if (optFilters) {
    if (typeof optFilters === "string") {
      try {
        filters.push(...JSON.parse(optFilters));
      } catch (e) {
        console.error("[PM-REPO] Failed to parse filters", e);
      }
    } else if (Array.isArray(optFilters)) {
      filters.push(...optFilters);
    }
  }

  if (siteCode && siteCode !== "all") {
    filters.push({ fieldId: "site_code", operator: "=", value: siteCode });
  }
  if (status && status !== "All" && status !== "all") {
    filters.push({ fieldId: "status", operator: "=", value: status });
  }
  if (frequency && frequency !== "All" && frequency !== "all") {
    filters.push({ fieldId: "frequency", operator: "=", value: frequency });
  }
  if (asset_type && asset_type !== "All" && asset_type !== "all") {
    filters.push({ fieldId: "asset_type", operator: "=", value: asset_type });
  }

  if (options.instance_id) {
    filters.push({ fieldId: "instance_id", operator: "=", value: options.instance_id });
  }
  if (options.maintenance_id) {
    filters.push({ fieldId: "maintenance_id", operator: "=", value: options.maintenance_id });
  }

  if (from_date && to_date) {
    filters.push({
      fieldId: "start_due_date",
      operator: "between",
      value: `${from_date} 00:00:00`,
      valueEnd: `${to_date} 23:59:59`,
    });
  } else if (from_date) {
    filters.push({ fieldId: "start_due_date", operator: ">=", value: `${from_date} 00:00:00` });
  } else if (to_date) {
    filters.push({ fieldId: "start_due_date", operator: "<=", value: `${to_date} 23:59:59` });
  }

  const selectFields = options.fields && options.fields.length > 0 ? options.fields.join(", ") : "*";

  const { whereClause, orderClause, limitClause, values } = buildQuery(
    {
      ...options,
      search: search ?? undefined,
      filters: filters.length > 0 ? filters : undefined,
    },
    {
      tableAlias: "",
      searchFields: [
        "instance_id",
        "title",
        "location",
        "asset_id",
        "assigned_to_name",
        "teams_name"
      ],
      allowedFields: [
        "id",
        "instance_id",
        "site_code",
        "asset_id",
        "maintenance_id",
        "title",
        "location",
        "asset_type",
        "frequency",
        "start_due_date",
        "start_datetime",
        "end_datetime",
        "status",
        "progress",
        "assigned_to_name",
        "teams_name",
        "client_sign",
        "before_image",
        "after_image",
        "created_at",
        "updated_at",
      ],
      defaultSort: "start_due_date",
      defaultSortOrder: "asc",
    },
  );

  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM pm_instances ${whereClause}`,
    values.slice(0, -2),
  );
  const total = parseInt(countResult?.count || "0", 10);

  const data = await query<PMInstance>(
    `SELECT ${selectFields} FROM pm_instances ${whereClause} ${orderClause} ${limitClause}`,
    values,
  );

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
 * Get all PM instances with pagination
 */
export async function getAllPMInstances(
  options: GetPMInstancesOptions = {},
): Promise<{
  data: PMInstance[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}> {
  return getPMInstancesBySite("all", options);
}

/**
 * Get PM instances by asset
 */
export async function getPMInstancesByAsset(
  assetId: string,
  fields?: string[],
): Promise<PMInstance[]> {
  const selectFields = fields && fields.length > 0 ? fields.join(", ") : "*";
  return query<PMInstance>(
    `SELECT ${selectFields} FROM pm_instances
     WHERE asset_id = $1
     ORDER BY start_due_date DESC`,
    [assetId],
  );
}

/**
 * Get pending PM instances within N days
 */
export async function getPendingPMInstances(
  siteCode: string,
  days: number = 7,
  fields?: string[],
): Promise<PMInstance[]> {
  const selectFields = fields && fields.length > 0 ? fields.join(", ") : "*";
  return query<PMInstance>(
    `SELECT ${selectFields} FROM pm_instances
     WHERE site_code = $1
       AND status = 'Pending'
       AND start_due_date <= CURRENT_DATE + $2::integer
     ORDER BY start_due_date ASC`,
    [siteCode, days],
  );
}

/**
 * Get overdue PM instances
 */
export async function getOverduePMInstances(
  siteCode: string,
  fields?: string[],
): Promise<PMInstance[]> {
  const selectFields = fields && fields.length > 0 ? fields.join(", ") : "*";
  return query<PMInstance>(
    `SELECT ${selectFields} FROM pm_instances
     WHERE site_code = $1
       AND status IN ('Pending', 'In Progress')
       AND start_due_date < CURRENT_DATE
     ORDER BY start_due_date ASC`,
    [siteCode],
  );
}

/**
 * Update a PM instance
 */
export async function updatePMInstance(
  instanceId: string,
  updateData: Partial<PMInstance>,
): Promise<PMInstance> {
  const { instance_id, created_at, ...allowedUpdates } = updateData as any;

  const entries = Object.entries(allowedUpdates).filter(
    ([, value]) => value !== undefined,
  );

  if (entries.length === 0) {
    throw new Error("No fields to update");
  }

  const setClauses = entries.map(([key], i) => `${key} = $${i + 1}`);
  const values = entries.map(([, value]) => value);

  const column = isUuid(instanceId) ? "id" : "instance_id";
  const instance = await queryOne<PMInstance>(
    `UPDATE pm_instances
     SET ${setClauses.join(", ")}, updated_at = NOW()
     WHERE ${column} = $${entries.length + 1}
     RETURNING *`,
    [...values, instanceId],
  );

  if (!instance) {
    throw new Error("PM instance not found");
  }

  return instance;
}

/**
 * Update PM instance status with timestamps
 */
export async function updatePMInstanceStatus(
  instanceId: string,
  status: string,
  userId?: string,
): Promise<PMInstance> {
  const updates: Partial<PMInstance> = {
    status,
    updated_by: userId,
  };

  if (status === "In Progress") {
    updates.start_datetime = new Date();
  } else if (status === "Completed") {
    updates.end_datetime = new Date();
    updates.progress = "100";
  }

  return updatePMInstance(instanceId, updates);
}

/**
 * Update PM instance progress
 */
export async function updatePMInstanceProgress(
  instanceId: string,
  progress: number | string,
): Promise<PMInstance> {
  return updatePMInstance(instanceId, { progress: progress.toString() });
}

/**
 * Delete a PM instance
 */
export async function deletePMInstance(instanceId: string): Promise<boolean> {
  const column = isUuid(instanceId) ? "id" : "instance_id";
  const result = await queryOne<{ id: string }>(
    `DELETE FROM pm_instances WHERE ${column} = $1 RETURNING id`,
    [instanceId],
  );
  return result !== null;
}

/**
 * Get PM statistics
 */
export async function getPMStats(
  siteCode: string,
  from_date?: string | null,
  to_date?: string | null,
): Promise<{
  total: number;
  byStatus: Record<string, number>;
  byFrequency: Record<string, number>;
}> {
  let queryStr = `SELECT status, frequency FROM pm_instances WHERE site_code = $1`;
  const params: any[] = [siteCode];
  let paramIdx = 2;

  if (from_date && to_date) {
    queryStr += ` AND (start_due_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $${paramIdx++}::date AND $${paramIdx++}::date`;
    params.push(from_date, to_date);
  } else if (from_date) {
    queryStr += ` AND (start_due_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date >= $${paramIdx++}::date`;
    params.push(from_date);
  } else if (to_date) {
    queryStr += ` AND (start_due_date AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date <= $${paramIdx++}::date`;
    params.push(to_date);
  }

  const data = await query<{ status: string; frequency: string }>(queryStr, params);

  const stats = {
    total: data.length,
    byStatus: {} as Record<string, number>,
    byFrequency: {} as Record<string, number>,
  };

  data.forEach((pm) => {
    stats.byStatus[pm.status] = (stats.byStatus[pm.status] || 0) + 1;
    if (pm.frequency) {
      stats.byFrequency[pm.frequency] =
        (stats.byFrequency[pm.frequency] || 0) + 1;
    }
  });

  return stats;
}

export default {
  createPMInstance,
  getPMInstanceById,
  getPMInstancesBySite,
  getAllPMInstances,
  getPMInstancesByAsset,
  getPendingPMInstances,
  getOverduePMInstances,
  updatePMInstance,
  updatePMInstanceStatus,
  updatePMInstanceProgress,
  deletePMInstance,
  getPMStats,
};
