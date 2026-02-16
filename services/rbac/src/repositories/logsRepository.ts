/**
 * Logs Repository
 *
 * Data access layer for activity_logs table.
 */

import { query, queryOne } from "@jouleops/shared";

// ============================================================================
// Types
// ============================================================================

export interface ActivityLog {
  id?: number;
  user_id: string;
  action: string;
  module: string;
  description?: string;
  ip_address?: string;
  device_info?: string;
  metadata?: Record<string, any>;
  created_at?: Date;
}

export interface LogActivityInput {
  user_id?: string;
  action: string;
  module: string;
  description?: string;
  ip_address?: string;
  device_info?: string;
  metadata?: Record<string, any>;
}

// ============================================================================
// Repository Functions
// ============================================================================

/**
 * Log an activity
 */
export async function logActivity(data: LogActivityInput): Promise<void> {
  try {
    await queryOne(
      `INSERT INTO activity_logs (user_id, action, module, description, ip_address, device_info, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        data.user_id || null,
        data.action,
        data.module,
        data.description || null,
        data.ip_address || null,
        data.device_info || null,
        data.metadata ? JSON.stringify(data.metadata) : null,
      ],
    );
  } catch (error) {
    // Log activity failures shouldn't break the main flow
    console.error("Failed to log activity:", error);
  }
}

/**
 * Get activity logs for a user
 */
export async function getLogsByUser(
  userId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<ActivityLog[]> {
  const { limit = 50, offset = 0 } = options;

  return query<ActivityLog>(
    `SELECT * FROM activity_logs
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );
}

/**
 * Get recent logs by module
 */
export async function getLogsByModule(
  module: string,
  options: { limit?: number; offset?: number } = {},
): Promise<ActivityLog[]> {
  const { limit = 50, offset = 0 } = options;

  return query<ActivityLog>(
    `SELECT * FROM activity_logs
     WHERE module = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [module, limit, offset],
  );
}

/**
 * Get all logs with pagination and filters
 */
export async function getAllLogs(
  options: {
    page?: number;
    limit?: number;
    module?: string;
    action?: string;
    search?: string;
    from?: string;
    to?: string;
  } = {},
): Promise<{
  data: ActivityLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}> {
  const { page = 1, limit = 50, module, action, search, from, to } = options;
  const offset = (page - 1) * limit;
  const conditions: string[] = [];
  const params: any[] = [];

  if (module) {
    params.push(module);
    conditions.push(`module = $${params.length}`);
  }

  if (action) {
    params.push(action);
    conditions.push(`action = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    conditions.push(
      `(description ILIKE $${params.length} OR action ILIKE $${params.length})`,
    );
  }

  if (from) {
    params.push(from);
    conditions.push(`created_at >= $${params.length}::timestamp`);
  }

  if (to) {
    params.push(to);
    conditions.push(`created_at <= $${params.length}::timestamp`);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Count query
  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM activity_logs ${whereClause}`,
    params,
  );
  const total = parseInt(countResult?.count || "0");

  // Data query
  params.push(limit, offset);
  const data = await query<ActivityLog>(
    `SELECT al.*, u.full_name as user_name, u.email as user_email
     FROM activity_logs al
     LEFT JOIN users u ON al.user_id = u.user_id
     ${whereClause}
     ORDER BY al.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
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
 * Get error trends for the last N days
 */
export async function getErrorTrends(days: number = 7): Promise<
  {
    date: string;
    count: number;
    module: string;
  }[]
> {
  const sql = `
    SELECT 
      DATE(created_at) as date,
      module,
      COUNT(*) as count
    FROM activity_logs
    WHERE action LIKE '%ERROR%' OR action LIKE '%FAIL%'
    AND created_at >= NOW() - INTERVAL '${days} days'
    GROUP BY DATE(created_at), module
    ORDER BY date DESC, count DESC
  `;
  return query(sql);
}

export default {
  logActivity,
  getLogsByUser,
  getLogsByModule,
  getAllLogs,
  getErrorTrends,
};
