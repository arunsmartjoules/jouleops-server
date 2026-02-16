/**
 * Site Users Repository
 *
 * Handles site-user mapping (many-to-many relationship)
 */

import { query, queryOne } from "@jouleops/shared";
import { cached, del as cacheDel } from "@jouleops/shared";

const CACHE_TTL = 600; // 10 minutes

export interface SiteUser {
  id?: number;
  site_id: string;
  user_id: string;
  role_at_site?: string;
  is_primary?: boolean;
  created_at?: Date;
  updated_at?: Date;
  // Joined fields
  site_name?: string;
  site_code?: string;
  user_name?: string;
  user_email?: string;
  user_phone?: string;
  user_employee_code?: string;
  user_department?: string;
  user_designation?: string;
}

/**
 * Get all site-user mappings grouped by site
 */
export async function getAll(options: {
  page?: number;
  limit?: number;
  siteId?: string;
  userId?: string;
  search?: string;
}) {
  const { page = 1, limit = 50, siteId, userId, search } = options;
  const offset = (page - 1) * limit;
  const params: any[] = [];
  const conditions: string[] = [];

  if (siteId) {
    params.push(siteId);
    conditions.push(`su.site_id = $${params.length}`);
  }

  if (userId) {
    params.push(userId);
    conditions.push(`su.user_id = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    conditions.push(
      `(u.name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR s.name ILIKE $${params.length} OR s.site_code ILIKE $${params.length})`,
    );
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Count query (distinct users that have site assignments matching the filters)
  const countQuery = `
    SELECT COUNT(DISTINCT u.user_id) as count
    FROM site_user su
    JOIN users u ON su.user_id = u.user_id
    JOIN sites s ON su.site_id = s.site_id
    ${whereClause}
  `;
  const countResult = await queryOne(countQuery, params);
  const total = parseInt(countResult?.count || "0");

  // Data query (Grouped by user)
  params.push(limit, offset);
  const dataQuery = `
    SELECT 
      u.user_id,
      MAX(u.name) as user_name,
      MAX(u.email) as user_email,
      MAX(u.employee_code) as user_employee_code,
      MAX(u.department) as user_department,
      MAX(u.designation) as user_designation,
      json_agg(json_build_object(
        'site_id', s.site_id,
        'site_name', s.name,
        'site_code', s.site_code,
        'role_at_site', su.role_at_site,
        'is_primary', su.is_primary
      ) ORDER BY su.is_primary DESC, s.name) as sites
    FROM site_user su
    JOIN users u ON su.user_id = u.user_id
    JOIN sites s ON su.site_id = s.site_id
    ${whereClause}
    GROUP BY u.user_id
    ORDER BY MAX(su.created_at) DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;
  const data = await query(dataQuery, params);

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
 * Get users assigned to a specific site
 */
export async function getBySite(siteId: string) {
  const cacheKey = `site_users:site:${siteId}`;
  return cached(
    cacheKey,
    async () => {
      const sql = `
        SELECT 
          su.*,
          u.name as user_name,
          u.email as user_email,
          u.phone as user_phone,
          u.employee_code as user_employee_code,
          u.department as user_department,
          u.designation as user_designation,
          u.role,
          u.is_active
        FROM site_user su
        JOIN users u ON su.user_id = u.user_id
        WHERE su.site_id = $1
        ORDER BY su.is_primary DESC, u.name
      `;
      return query(sql, [siteId]);
    },
    CACHE_TTL,
  );
}

/**
 * Get sites assigned to a specific user
 */
export async function getByUser(userId: string) {
  const cacheKey = `site_users:user:${userId}`;
  return cached(
    cacheKey,
    async () => {
      const sql = `
        SELECT 
          su.*,
          s.name as site_name,
          s.site_code,
          s.address,
          s.city,
          s.latitude,
          s.longitude,
          s.radius
        FROM site_user su
        JOIN sites s ON su.site_id = s.site_id
        WHERE su.user_id = $1 AND s.is_active = true
        ORDER BY su.is_primary DESC, s.name
      `;
      return query(sql, [userId]);
    },
    CACHE_TTL,
  );
}

/**
 * Assign a user to a site
 */
export async function assignUser(
  siteId: string,
  userId: string,
  roleAtSite: string = "staff",
  isPrimary: boolean = false,
): Promise<SiteUser> {
  const sql = `
    INSERT INTO site_user (site_id, user_id, role_at_site, is_primary, created_at, updated_at)
    VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (site_id, user_id) 
    DO UPDATE SET role_at_site = $3, is_primary = $4, updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `;
  const result = await queryOne<SiteUser>(sql, [
    siteId,
    userId,
    roleAtSite,
    isPrimary,
  ]);

  // Invalidate cache
  await Promise.all([
    cacheDel(`site_users:site:${siteId}`),
    cacheDel(`site_users:user:${userId}`),
  ]);

  return result!;
}

/**
 * Update assignment
 */
export async function updateAssignment(
  siteId: string,
  userId: string,
  updates: { role_at_site?: string; is_primary?: boolean },
): Promise<SiteUser> {
  const setClauses: string[] = ["updated_at = CURRENT_TIMESTAMP"];
  const params: any[] = [];

  if (updates.role_at_site !== undefined) {
    params.push(updates.role_at_site);
    setClauses.push(`role_at_site = $${params.length}`);
  }

  if (updates.is_primary !== undefined) {
    params.push(updates.is_primary);
    setClauses.push(`is_primary = $${params.length}`);
  }

  params.push(siteId, userId);
  const sql = `
    UPDATE site_user
    SET ${setClauses.join(", ")}
    WHERE site_id = $${params.length - 1} AND user_id = $${params.length}
    RETURNING *
  `;
  const result = await queryOne<SiteUser>(sql, params);

  // Invalidate cache
  await Promise.all([
    cacheDel(`site_users:site:${siteId}`),
    cacheDel(`site_users:user:${userId}`),
  ]);

  return result!;
}

/**
 * Remove assignment
 */
export async function removeAssignment(
  siteId: string,
  userId: string,
): Promise<void> {
  const sql = `DELETE FROM site_user WHERE site_id = $1 AND user_id = $2`;
  await query(sql, [siteId, userId]);

  // Invalidate cache
  await Promise.all([
    cacheDel(`site_users:site:${siteId}`),
    cacheDel(`site_users:user:${userId}`),
  ]);
}

export default {
  getAll,
  getBySite,
  getByUser,
  assignUser,
  updateAssignment,
  removeAssignment,
};
