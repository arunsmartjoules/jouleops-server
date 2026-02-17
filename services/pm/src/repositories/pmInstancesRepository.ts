/**
 * PM Instances Repository
 *
 * Data access layer for pm_instances table.
 */

import { query, queryOne } from "@jouleops/shared";

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
}

export interface GetPMInstancesOptions {
  page?: number;
  limit?: number;
  status?: string | null;
  frequency?: string | null;
  asset_type?: string | null;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

// ============================================================================
// Helper Functions
// ============================================================================

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
): Promise<PMInstance | null> {
  return queryOne<PMInstance>(
    `SELECT * FROM pm_instances WHERE instance_id = $1`,
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
    sortBy = "start_due_date",
    sortOrder = "asc",
  } = options;

  const offset = (page - 1) * limit;

  const conditions: string[] = ["site_code = $1"];
  const params: any[] = [siteCode];
  let paramIndex = 2;

  if (status) {
    conditions.push(`status = $${paramIndex}`);
    params.push(status);
    paramIndex++;
  }

  if (frequency) {
    conditions.push(`frequency = $${paramIndex}`);
    params.push(frequency);
    paramIndex++;
  }

  if (asset_type) {
    conditions.push(`asset_type = $${paramIndex}`);
    params.push(asset_type);
    paramIndex++;
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;
  const orderDirection = sortOrder === "asc" ? "ASC" : "DESC";

  // Get count
  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM pm_instances ${whereClause}`,
    params,
  );
  const total = parseInt(countResult?.count || "0", 10);

  // Get data
  const data = await query<PMInstance>(
    `SELECT * FROM pm_instances ${whereClause}
     ORDER BY ${sortBy} ${orderDirection}
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
 * Get PM instances by asset
 */
export async function getPMInstancesByAsset(
  assetId: string,
): Promise<PMInstance[]> {
  return query<PMInstance>(
    `SELECT * FROM pm_instances
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
): Promise<PMInstance[]> {
  return query<PMInstance>(
    `SELECT * FROM pm_instances
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
): Promise<PMInstance[]> {
  return query<PMInstance>(
    `SELECT * FROM pm_instances
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

  const instance = await queryOne<PMInstance>(
    `UPDATE pm_instances
     SET ${setClauses.join(", ")}, updated_at = NOW()
     WHERE instance_id = $${entries.length + 1}
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
  const result = await queryOne<{ instance_id: string }>(
    `DELETE FROM pm_instances WHERE instance_id = $1 RETURNING instance_id`,
    [instanceId],
  );
  return result !== null;
}

/**
 * Get PM statistics
 */
export async function getPMStats(siteCode: string): Promise<{
  total: number;
  byStatus: Record<string, number>;
  byFrequency: Record<string, number>;
}> {
  const data = await query<{ status: string; frequency: string }>(
    `SELECT status, frequency FROM pm_instances WHERE site_code = $1`,
    [siteCode],
  );

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
  getPMInstancesByAsset,
  getPendingPMInstances,
  getOverduePMInstances,
  updatePMInstance,
  updatePMInstanceStatus,
  updatePMInstanceProgress,
  deletePMInstance,
  getPMStats,
};
