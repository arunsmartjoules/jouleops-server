/**
 * Users Repository
 *
 * Data access layer for users table.
 * Upgraded to support advanced filtering, sorting, and pagination
 * via the buildQuery helper (merged from profiles service).
 */

import {
  query,
  queryOne,
  buildQuery,
  cached,
  cacheDel as del,
  CACHE_PREFIX,
  TTL,
} from "@jouleops/shared";

// Build cache key helper
const buildKey = (prefix: string, id: string) => `${prefix}${id}`;

// ============================================================================
// Types
// ============================================================================

export interface User {
  user_id: string;
  email: string;
  name: string;
  phone?: string;
  password?: string;
  role: string;
  is_active: boolean;
  is_superadmin?: boolean;
  site_code?: string;
  employee_code?: string;
  department?: string;
  designation?: string;
  work_location_type?: string;
  created_at: Date;
  updated_at?: Date;
}

export interface CreateUserInput {
  user_id: string;
  email: string;
  name: string;
  password?: string;
  phone?: string;
  role?: string;
  is_active?: boolean;
  site_code?: string;
  employee_code?: string;
  department?: string;
  designation?: string;
  work_location_type?: string;
}

export interface UpdateUserInput {
  email?: string;
  name?: string;
  password?: string;
  phone?: string;
  role?: string;
  is_active?: boolean;
  site_code?: string;
  employee_code?: string;
  department?: string;
  designation?: string;
  work_location_type?: string;
}

export interface GetUsersOptions {
  page?: number;
  limit?: number;
  role?: string | null;
  is_active?: boolean | null;
  search?: string;
  sort?: string;
  filters?: string;
}

// ============================================================================
// Repository Functions
// ============================================================================

/**
 * Create a new user
 */
export async function createUser(data: CreateUserInput): Promise<User> {
  const columns = Object.keys(data);
  const values = Object.values(data);
  const placeholders = columns.map((_, i) => `$${i + 1}`);

  const sql = `
    INSERT INTO users (${columns.join(", ")})
    VALUES (${placeholders.join(", ")})
    RETURNING *
  `;

  const user = await queryOne<User>(sql, values);

  if (!user) {
    throw new Error("Failed to create user");
  }

  return user;
}

/**
 * Get user by ID (with caching)
 */
export async function getUserById(userId: string): Promise<User | null> {
  const cacheKey = buildKey(CACHE_PREFIX.USER, userId);

  return cached(
    cacheKey,
    async () => {
      return queryOne<User>(`SELECT * FROM users WHERE user_id = $1`, [userId]);
    },
    TTL.MEDIUM,
  );
}

/**
 * Get user by ID without cache (for auth - needs password field)
 */
export async function getUserByIdUncached(
  userId: string,
): Promise<User | null> {
  return queryOne<User>(`SELECT * FROM users WHERE user_id = $1`, [userId]);
}

/**
 * Get user by email (no caching - used for auth)
 * Checks both email and platform_email columns since some users only have one set.
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  return queryOne<User>(
    `SELECT * FROM users WHERE email = $1 OR platform_email = $1 LIMIT 1`,
    [email],
  );
}

/**
 * Get user by phone
 */
export async function getUserByPhone(phone: string): Promise<User | null> {
  return queryOne<User>(`SELECT * FROM users WHERE phone = $1`, [phone]);
}

/**
 * Get user by email and employee code (for password reset)
 */
export async function getUserByEmailAndEmployeeCode(
  email: string,
  employeeCode: string,
): Promise<User | null> {
  return queryOne<User>(
    `SELECT * FROM users WHERE email = $1 AND employee_code = $2`,
    [email, employeeCode],
  );
}

/**
 * Get users by site code
 */
export async function getUsersBySite(
  siteCode: string,
  options: { role?: string | null; is_active?: boolean | null } = {},
): Promise<User[]> {
  const { role = null, is_active = true } = options;

  let sql = `SELECT * FROM users WHERE site_code = $1`;
  const params: any[] = [siteCode];
  let paramIndex = 2;

  if (role !== null) {
    sql += ` AND role = $${paramIndex}`;
    params.push(role);
    paramIndex++;
  }

  if (is_active !== null) {
    sql += ` AND is_active = $${paramIndex}`;
    params.push(is_active);
    paramIndex++;
  }

  sql += ` ORDER BY name ASC`;

  return query<User>(sql, params);
}

/**
 * Get all users with advanced pagination, filtering, and sorting
 */
export async function getAllUsers(options: GetUsersOptions = {}): Promise<{
  data: User[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}> {
  const { search, filters, ...rest } = options;

  const { whereClause, orderClause, limitClause, values } = buildQuery(
    { ...rest, search, filters },
    {
      searchFields: [
        "name",
        "email",
        "employee_code",
        "designation",
        "department",
      ],
      allowedFields: [
        "role",
        "is_active",
        "site_code",
        "department",
        "work_location_type",
      ],
      defaultSort: "name",
      defaultSortOrder: "asc",
    },
  );

  // Get total count (skip limit/offset values which are the last two)
  const countSql = `SELECT COUNT(*) as count FROM users ${whereClause}`;
  const countResult = await queryOne<{ count: string }>(
    countSql,
    values.slice(0, -2),
  );
  const total = parseInt(countResult?.count || "0", 10);

  // Get paginated data
  const dataSql = `SELECT * FROM users ${whereClause} ${orderClause} ${limitClause}`;
  const data = await query<User>(dataSql, values);

  const limit = options.limit || 50;
  const page = options.page || 1;

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
 * Update a user
 */
export async function updateUser(
  userId: string,
  updateData: UpdateUserInput,
): Promise<User> {
  const entries = Object.entries(updateData).filter(
    ([, value]) => value !== undefined,
  );

  if (entries.length === 0) {
    throw new Error("No fields to update");
  }

  const setClauses = entries.map(([key], i) => `${key} = $${i + 1}`);
  const values = entries.map(([, value]) => value);

  const sql = `
    UPDATE users
    SET ${setClauses.join(", ")}, updated_at = NOW()
    WHERE user_id = $${entries.length + 1}
    RETURNING *
  `;

  const user = await queryOne<User>(sql, [...values, userId]);

  if (!user) {
    throw new Error("User not found");
  }

  // Invalidate cache
  await del(buildKey(CACHE_PREFIX.USER, userId));

  return user;
}

/**
 * Delete a user
 */
export async function deleteUser(userId: string): Promise<boolean> {
  const result = await queryOne<{ user_id: string }>(
    `DELETE FROM users WHERE user_id = $1 RETURNING user_id`,
    [userId],
  );

  // Invalidate cache
  await del(buildKey(CACHE_PREFIX.USER, userId));

  return result !== null;
}

/**
 * Bulk update users
 */
export async function bulkUpdateUsers(
  userIds: string[],
  updateData: UpdateUserInput,
): Promise<User[]> {
  if (userIds.length === 0) {
    return [];
  }

  const entries = Object.entries(updateData).filter(
    ([, value]) => value !== undefined,
  );

  if (entries.length === 0) {
    throw new Error("No fields to update");
  }

  const setClauses = entries.map(([key], i) => `${key} = $${i + 1}`);
  const values = entries.map(([, value]) => value);

  const placeholders = userIds.map((_, i) => `$${entries.length + 1 + i}`);

  const sql = `
    UPDATE users
    SET ${setClauses.join(", ")}, updated_at = NOW()
    WHERE user_id IN (${placeholders.join(", ")})
    RETURNING *
  `;

  const users = await query<User>(sql, [...values, ...userIds]);

  // Invalidate cache for all updated users
  for (const id of userIds) {
    await del(buildKey(CACHE_PREFIX.USER, id));
  }

  return users;
}

/**
 * Bulk delete users
 */
export async function bulkDeleteUsers(userIds: string[]): Promise<boolean> {
  if (userIds.length === 0) {
    return true;
  }

  const placeholders = userIds.map((_, i) => `$${i + 1}`);

  const results = await query<{ user_id: string }>(
    `DELETE FROM users WHERE user_id IN (${placeholders.join(", ")}) RETURNING user_id`,
    userIds,
  );

  // Invalidate cache for all deleted users
  for (const id of userIds) {
    await del(buildKey(CACHE_PREFIX.USER, id));
  }

  return results.length > 0;
}

export default {
  createUser,
  getUserById,
  getUserByIdUncached,
  getUserByEmail,
  getUserByPhone,
  getUserByEmailAndEmployeeCode,
  getUsersBySite,
  getAllUsers,
  updateUser,
  deleteUser,
  bulkUpdateUsers,
  bulkDeleteUsers,
  bulkUpsertUsers,
};

/**
 * Bulk upsert users
 */
export async function bulkUpsertUsers(users: CreateUserInput[]): Promise<{ count: number }> {
  if (!users || users.length === 0) {
    return { count: 0 };
  }

  const allColumns = Array.from(new Set(users.flatMap(u => Object.keys(u))));
  const updateColumns = allColumns.filter(col => col !== 'email' && col !== 'user_id' && col !== 'created_at');
  
  const placeholders: string[] = [];
  const values: any[] = [];
  
  users.forEach((user, i) => {
    const rowPlaceholders = allColumns.map((col, j) => {
      values.push((user as any)[col]);
      return `$${i * allColumns.length + j + 1}`;
    });
    placeholders.push(`(${rowPlaceholders.join(", ")})`);
  });

  const updateClause = updateColumns.map(col => `${col} = EXCLUDED.${col}`).join(", ");

  const sql = `
    INSERT INTO users (${allColumns.join(", ")})
    VALUES ${placeholders.join(", ")}
    ON CONFLICT (email) DO UPDATE SET
    ${updateClause}, updated_at = NOW()
    RETURNING user_id
  `;

  const results = await query<{ user_id: string }>(sql, values);
  
  // Invalidate cache for all affected users
  for (const res of results) {
    await del(buildKey(CACHE_PREFIX.USER, res.user_id));
  }
  
  return { count: results.length };
}
