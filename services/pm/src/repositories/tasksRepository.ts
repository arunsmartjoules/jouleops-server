/**
 * Tasks Repository
 *
 * Data access layer for tasks table.
 */

import { query, queryOne } from "@jouleops/shared";
import { cacheDel as del, CACHE_PREFIX } from "@jouleops/shared";

// Local helper for buildKey as it's not exported from shared
const buildKey = (...parts: string[]): string => parts.join(":");

// ============================================================================
// Types
// ============================================================================

export interface Task {
  task_id: string;
  site_code: string;
  title: string;
  description?: string;
  task_status: string;
  priority?: string;
  assigned_to?: string;
  due_date?: Date;
  start_time?: Date;
  end_time?: Date;
  created_by?: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface CreateTaskInput {
  task_id: string;
  site_code: string;
  title: string;
  description?: string;
  task_status?: string;
  priority?: string;
  assigned_to?: string;
  due_date?: Date;
  created_by?: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  task_status?: string;
  priority?: string;
  assigned_to?: string;
  due_date?: Date;
  start_time?: Date;
  end_time?: Date;
}

export interface GetTasksOptions {
  page?: number;
  limit?: number;
  task_status?: string | null;
  priority?: string | null;
  assigned_to?: string | null;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  fields?: string[];
}

// ============================================================================
// Repository Functions
// ============================================================================

/**
 * Create a new task
 */
export async function createTask(data: CreateTaskInput): Promise<Task> {
  const columns = Object.keys(data).filter(
    (k) => data[k as keyof CreateTaskInput] !== undefined,
  );
  const values = columns.map((k) => data[k as keyof CreateTaskInput]);
  const placeholders = columns.map((_, i) => `$${i + 1}`);

  const sql = `
    INSERT INTO tasks (${columns.join(", ")})
    VALUES (${placeholders.join(", ")})
    RETURNING *
  `;

  const task = await queryOne<Task>(sql, values);

  if (!task) {
    throw new Error("Failed to create task");
  }

  return task;
}

/**
 * Get task by ID
 */
export async function getTaskById(
  taskId: string,
  fields?: string[],
): Promise<Task | null> {
  const selectFields = fields && fields.length > 0 ? fields.join(", ") : "*";
  return queryOne<Task>(
    `SELECT ${selectFields} FROM tasks WHERE task_id = $1`,
    [taskId],
  );
}

/**
 * Get tasks by site with pagination and filtering
 */
export async function getTasksBySite(
  siteCode: string,
  options: GetTasksOptions = {},
): Promise<{
  data: Task[];
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
    task_status = null,
    priority = null,
    assigned_to = null,
    sortBy = "created_at",
    sortOrder = "desc",
    fields = [],
  } = options;

  const selectFields = fields && fields.length > 0 ? fields.join(", ") : "*";

  const offset = (page - 1) * limit;

  const conditions: string[] = ["site_code = $1"];
  const params: any[] = [siteCode];
  let paramIndex = 2;

  if (task_status) {
    conditions.push(`task_status = $${paramIndex}`);
    params.push(task_status);
    paramIndex++;
  }

  if (priority) {
    conditions.push(`priority = $${paramIndex}`);
    params.push(priority);
    paramIndex++;
  }

  if (assigned_to) {
    conditions.push(`assigned_to = $${paramIndex}`);
    params.push(assigned_to);
    paramIndex++;
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;
  const orderDirection = sortOrder === "asc" ? "ASC" : "DESC";

  // Get count
  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM tasks ${whereClause}`,
    params,
  );
  const total = parseInt(countResult?.count || "0", 10);

  // Get data
  const data = await query<Task>(
    `SELECT ${selectFields} FROM tasks ${whereClause}
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
 * Get tasks by user
 */
export async function getTasksByUser(
  userId: string,
  options: {
    task_status?: string | null;
    limit?: number;
    fields?: string[];
  } = {},
): Promise<Task[]> {
  const { task_status = null, limit = 20, fields = [] } = options;
  const selectFields = fields && fields.length > 0 ? fields.join(", ") : "*";

  const conditions: string[] = ["assigned_to = $1"];
  const params: any[] = [userId];
  let paramIndex = 2;

  if (task_status) {
    conditions.push(`task_status = $${paramIndex}`);
    params.push(task_status);
    paramIndex++;
  }

  return query<Task>(
    `SELECT ${selectFields} FROM tasks
     WHERE ${conditions.join(" AND ")}
     ORDER BY due_date ASC
     LIMIT $${paramIndex}`,
    [...params, limit],
  );
}

/**
 * Get tasks due today
 */
export async function getTasksDueToday(
  siteCode: string,
  fields?: string[],
): Promise<Task[]> {
  const selectFields = fields && fields.length > 0 ? fields.join(", ") : "*";
  return query<Task>(
    `SELECT ${selectFields} FROM tasks
     WHERE site_code = $1
       AND due_date >= CURRENT_DATE
       AND due_date < CURRENT_DATE + INTERVAL '1 day'
     ORDER BY due_date ASC`,
    [siteCode],
  );
}

/**
 * Update a task
 */
export async function updateTask(
  taskId: string,
  updateData: UpdateTaskInput,
): Promise<Task> {
  const entries = Object.entries(updateData).filter(
    ([, value]) => value !== undefined,
  );

  if (entries.length === 0) {
    throw new Error("No fields to update");
  }

  const setClauses = entries.map(([key], i) => `${key} = $${i + 1}`);
  const values = entries.map(([, value]) => value);

  const task = await queryOne<Task>(
    `UPDATE tasks
     SET ${setClauses.join(", ")}, updated_at = NOW()
     WHERE task_id = $${entries.length + 1}
     RETURNING *`,
    [...values, taskId],
  );

  if (!task) {
    throw new Error("Task not found");
  }

  return task;
}

/**
 * Update task status with automatic timestamps
 */
export async function updateTaskStatus(
  taskId: string,
  status: string,
): Promise<Task> {
  const updates: UpdateTaskInput = { task_status: status };

  if (status === "Completed") {
    updates.end_time = new Date();
  } else if (status === "In Progress") {
    updates.start_time = new Date();
  }

  return updateTask(taskId, updates);
}

/**
 * Delete a task
 */
export async function deleteTask(taskId: string): Promise<boolean> {
  const result = await queryOne<{ task_id: string }>(
    `DELETE FROM tasks WHERE task_id = $1 RETURNING task_id`,
    [taskId],
  );
  return result !== null;
}

/**
 * Get task statistics
 */
export async function getTaskStats(siteCode: string): Promise<{
  total: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
}> {
  const data = await query<{ task_status: string; priority: string }>(
    `SELECT task_status, priority FROM tasks WHERE site_code = $1`,
    [siteCode],
  );

  const stats = {
    total: data.length,
    byStatus: {} as Record<string, number>,
    byPriority: {} as Record<string, number>,
  };

  data.forEach((task) => {
    stats.byStatus[task.task_status] =
      (stats.byStatus[task.task_status] || 0) + 1;
    stats.byPriority[task.priority] =
      (stats.byPriority[task.priority] || 0) + 1;
  });

  return stats;
}

export default {
  createTask,
  getTaskById,
  getTasksBySite,
  getTasksByUser,
  getTasksDueToday,
  updateTask,
  updateTaskStatus,
  deleteTask,
  getTaskStats,
};
