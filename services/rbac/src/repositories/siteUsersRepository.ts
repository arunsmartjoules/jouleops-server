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
  site_code: string;
  user_id: string;
  role_at_site?: string;
  is_primary?: boolean;
  created_at?: Date;
  updated_at?: Date;
  // Joined fields
  site_name?: string;
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
  siteCode?: string;
  userId?: string;
  search?: string;
}) {
  const { page = 1, limit = 50, siteCode, userId, search } = options;
  const offset = (page - 1) * limit;
  const params: any[] = [];
  const conditions: string[] = [];

  if (siteCode) {
    params.push(siteCode);
    conditions.push(`s.site_code = $${params.length}`);
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
        'site_code', s.site_code,
        'site_name', s.name,
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
export async function getBySite(siteCode: string) {
  const cacheKey = `site_users:site:${siteCode}`;
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
        JOIN sites s ON su.site_id = s.site_id
        WHERE s.site_code = $1
        ORDER BY su.is_primary DESC, u.name
      `;
      return query(sql, [siteCode]);
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
          su.site_id, su.user_id, su.role_at_site, su.is_primary, su.created_at,
          s.name as site_name, s.site_code, s.address, s.city, s.latitude, s.longitude, s.radius, s.project_type
        FROM site_user su
        JOIN sites s ON su.site_id = s.site_id
        WHERE su.user_id = $1 AND s.is_active = true
        UNION
        SELECT
          s.site_id, u.user_id, 'staff' as role_at_site, true as is_primary, u.created_at,
          s.name as site_name, s.site_code, s.address, s.city, s.latitude, s.longitude, s.radius, s.project_type
        FROM users u
        JOIN sites s ON u.site_code = s.site_code
        WHERE u.user_id = $1 AND s.is_active = true
          AND NOT EXISTS (SELECT 1 FROM site_user su2 WHERE su2.user_id = u.user_id)
        ORDER BY is_primary DESC, site_name
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
  siteCode: string,
  userId: string,
  roleAtSite: string = "staff",
  isPrimary: boolean = false,
): Promise<SiteUser> {
  const site = await queryOne<{ site_id: string }>(
    `SELECT site_id FROM sites WHERE site_code = $1`,
    [siteCode],
  );
  if (!site) throw new Error(`Site with code ${siteCode} not found`);

  const sql = `
    INSERT INTO site_user (site_id, user_id, role_at_site, is_primary, created_at)
    VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
    ON CONFLICT (site_id, user_id) 
    DO UPDATE SET role_at_site = $3, is_primary = $4
    RETURNING *
  `;
  const result = await queryOne<SiteUser>(sql, [
    site.site_id,
    userId,
    roleAtSite,
    isPrimary,
  ]);

  // Invalidate cache
  await Promise.all([
    cacheDel(`site_users:site:${siteCode}`),
    cacheDel(`site_users:user:${userId}`),
  ]);

  return result!;
}

/**
 * Bulk assign user(s) to site(s)
 */
export async function assignBulkUsers(
  assignments: Array<{
    site_code: string;
    user_id: string;
    role_at_site?: string;
    is_primary?: boolean;
  }>,
): Promise<{ assigned: number; errors: any[] }> {
  if (assignments.length === 0) return { assigned: 0, errors: [] };

  const uniqueSiteCodes = [...new Set(assignments.map((a) => a.site_code))];
  const uniqueUserIds = [...new Set(assignments.map((a) => a.user_id))];

  // 1. Fetch site_ids for all siteCodes in one query
  const placeholders = uniqueSiteCodes.map((_, i) => `$${i + 1}`).join(", ");
  const sites = await query<{ site_id: string; site_code: string }>(
    `SELECT site_id, site_code FROM sites WHERE site_code IN (${placeholders})`,
    uniqueSiteCodes,
  );

  const siteCodeToIdMap = new Map(sites.map((s) => [s.site_code, s.site_id]));

  // 2. Prepare multi-row INSERT
  let valuesSql: string[] = [];
  let insertParams: any[] = [];
  let paramIndex = 1;

  const errors: any[] = [];
  let validAssignments = 0;

  for (const a of assignments) {
    const siteId = siteCodeToIdMap.get(a.site_code);
    if (!siteId) {
      errors.push({ ...a, error: `Site code ${a.site_code} not found` });
      continue;
    }

    valuesSql.push(
      `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, CURRENT_TIMESTAMP)`,
    );
    insertParams.push(
      siteId,
      a.user_id,
      a.role_at_site || "staff",
      a.is_primary || false,
    );
    paramIndex += 4;
    validAssignments++;
  }

  if (valuesSql.length === 0) {
    return { assigned: 0, errors };
  }

  const sql = `
    INSERT INTO site_user (site_id, user_id, role_at_site, is_primary, created_at)
    VALUES ${valuesSql.join(", ")}
    ON CONFLICT (site_id, user_id) 
    DO UPDATE SET role_at_site = EXCLUDED.role_at_site, is_primary = EXCLUDED.is_primary
  `;

  await query(sql, insertParams);

  // 3. Batch Invalidate Cache
  const cacheKeysToDel: string[] = [];
  uniqueSiteCodes.forEach((code) =>
    cacheKeysToDel.push(`site_users:site:${code}`),
  );
  uniqueUserIds.forEach((id) => cacheKeysToDel.push(`site_users:user:${id}`));

  await Promise.all(cacheKeysToDel.map((key) => cacheDel(key)));

  return { assigned: validAssignments, errors };
}

/**
 * Update assignment
 */
export async function updateAssignment(
  siteCode: string,
  userId: string,
  updates: { role_at_site?: string; is_primary?: boolean },
): Promise<SiteUser> {
  const site = await queryOne<{ site_id: string }>(
    `SELECT site_id FROM sites WHERE site_code = $1`,
    [siteCode],
  );
  if (!site) throw new Error(`Site with code ${siteCode} not found`);

  const setClauses: string[] = [];
  const params: any[] = [];

  if (updates.role_at_site !== undefined) {
    params.push(updates.role_at_site);
    setClauses.push(`role_at_site = $${params.length}`);
  }

  if (updates.is_primary !== undefined) {
    params.push(updates.is_primary);
    setClauses.push(`is_primary = $${params.length}`);
  }

  if (setClauses.length === 0) {
    throw new Error("No updates provided");
  }

  params.push(site.site_id, userId);
  const sql = `
    UPDATE site_user
    SET ${setClauses.join(", ")}
    WHERE site_id = $${params.length - 1} AND user_id = $${params.length}
    RETURNING *
  `;
  const result = await queryOne<SiteUser>(sql, params);

  // Invalidate cache
  await Promise.all([
    cacheDel(`site_users:site:${siteCode}`),
    cacheDel(`site_users:user:${userId}`),
  ]);

  return result!;
}

/**
 * Remove assignment
 */
export async function removeAssignment(
  siteCode: string,
  userId: string,
): Promise<void> {
  const sql = `DELETE FROM site_user WHERE site_id = (SELECT site_id FROM sites WHERE site_code = $1 LIMIT 1) AND user_id = $2`;
  await query(sql, [siteCode, userId]);

  // Invalidate cache
  await Promise.all([
    cacheDel(`site_users:site:${siteCode}`),
    cacheDel(`site_users:user:${userId}`),
  ]);
}

export default {
  getAll,
  getBySite,
  getByUser,
  assignUser,
  assignBulkUsers,
  updateAssignment,
  removeAssignment,
};
