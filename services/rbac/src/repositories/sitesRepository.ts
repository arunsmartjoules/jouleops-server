/**
 * Sites Repository
 *
 * Data access layer for sites table.
 */

import {
  query,
  queryOne,
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

export interface Site {
  site_code: string;
  name: string;
  location?: string;
  city?: string;
  address?: string;
  is_active: boolean;
  whatsapp_group_id?: string;
  site_prefix?: string;
  project_type?: string;
  client?: string;
  status?: string;
  task_executor?: string;
  radius?: number;
  latitude?: number;
  longitude?: number;
  created_at?: Date;
  updated_at?: Date;
}

export interface CreateSiteInput {
  site_code: string;
  name: string;
  location?: string;
  city?: string;
  address?: string;
  is_active?: boolean;
  whatsapp_group_id?: string;
  site_prefix?: string;
  project_type?: string;
  client?: string;
  status?: string;
  task_executor?: string;
  radius?: number;
  latitude?: number;
  longitude?: number;
}

export interface UpdateSiteInput {
  name?: string;
  location?: string;
  city?: string;
  address?: string;
  is_active?: boolean;
  whatsapp_group_id?: string;
  site_prefix?: string;
  project_type?: string;
  client?: string;
  site_code?: string;
  status?: string;
  task_executor?: string;
  radius?: number;
  latitude?: number;
  longitude?: number;
}

export interface GetSitesOptions {
  is_active?: boolean | null;
  city?: string | null;
  search?: string;
  project_type?: string | null;
}

// ============================================================================
// Repository Functions
// ============================================================================

/**
 * Create a new site
 */
export async function createSite(data: CreateSiteInput): Promise<Site> {
  const columns = Object.keys(data);
  const values = Object.values(data);
  const placeholders = columns.map((_, i) => `$${i + 1}`);

  const sql = `
    INSERT INTO sites (${columns.join(", ")})
    VALUES (${placeholders.join(", ")})
    RETURNING *
  `;

  const site = await queryOne<Site>(sql, values);

  if (!site) {
    throw new Error("Failed to create site");
  }

  return site;
}

/**
 * Get site by ID (with caching)
 */
export async function getSiteById(siteCode: string): Promise<Site | null> {
  const cacheKey = buildKey(CACHE_PREFIX.SITE, siteCode);

  return cached(
    cacheKey,
    async () => {
      return queryOne<Site>(`SELECT * FROM sites WHERE site_code = $1`, [
        siteCode,
      ]);
    },
    TTL.MEDIUM,
  );
}

/**
 * Get all sites with filtering
 */
export async function getAllSites(
  options: GetSitesOptions = {},
): Promise<Site[]> {
  const {
    is_active = null,
    city = null,
    search = "",
    project_type = null,
  } = options;

  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (is_active !== null) {
    conditions.push(`is_active = $${paramIndex}`);
    params.push(is_active);
    paramIndex++;
  }

  if (project_type) {
    conditions.push(`project_type = $${paramIndex}`);
    params.push(project_type);
    paramIndex++;
  }

  if (city) {
    conditions.push(`city ILIKE $${paramIndex}`);
    params.push(`%${city}%`);
    paramIndex++;
  }

  if (search) {
    conditions.push(
      `(name ILIKE $${paramIndex} OR location ILIKE $${paramIndex})`,
    );
    params.push(`%${search}%`);
    paramIndex++;
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  return query<Site>(
    `SELECT * FROM sites ${whereClause} ORDER BY name ASC`,
    params,
  );
}

/**
 * Update a site
 */
export async function updateSite(
  siteCode: string,
  updateData: UpdateSiteInput,
): Promise<Site> {
  const entries = Object.entries(updateData).filter(
    ([key, value]) => value !== undefined && key !== "updated_at",
  );

  if (entries.length === 0) {
    throw new Error("No fields to update");
  }

  const setClauses = entries.map(([key], i) => `${key} = $${i + 1}`);
  const values = entries.map(([, value]) => value);

  const sql = `
    UPDATE sites
    SET ${setClauses.join(", ")}, updated_at = NOW()
    WHERE site_code = $${entries.length + 1}
    RETURNING *
  `;

  const site = await queryOne<Site>(sql, [...values, siteCode]);

  if (!site) {
    throw new Error("Site not found");
  }

  // Invalidate cache
  await del(buildKey(CACHE_PREFIX.SITE, siteCode));

  return site;
}

/**
 * Delete a site
 */
export async function deleteSite(siteCode: string): Promise<boolean> {
  const result = await queryOne<{ site_code: string }>(
    `DELETE FROM sites WHERE site_code = $1 RETURNING site_code`,
    [siteCode],
  );

  await del(buildKey(CACHE_PREFIX.SITE, siteCode));

  return result !== null;
}

/**
 * Bulk update sites
 */
export async function bulkUpdateSites(
  siteCodes: string[],
  updateData: UpdateSiteInput,
): Promise<Site[]> {
  if (siteCodes.length === 0) {
    return [];
  }

  const entries = Object.entries(updateData).filter(
    ([key, value]) => value !== undefined && key !== "updated_at",
  );

  if (entries.length === 0) {
    throw new Error("No fields to update");
  }

  const setClauses = entries.map(([key], i) => `${key} = $${i + 1}`);
  const values = entries.map(([, value]) => value);
  const placeholders = siteCodes.map((_, i) => `$${entries.length + 1 + i}`);

  const sql = `
    UPDATE sites
    SET ${setClauses.join(", ")}, updated_at = NOW()
    WHERE site_code IN (${placeholders.join(", ")})
    RETURNING *
  `;

  const sites = await query<Site>(sql, [...values, ...siteCodes]);

  // Invalidate cache for all updated sites
  for (const id of siteCodes) {
    await del(buildKey(CACHE_PREFIX.SITE, id));
  }

  return sites;
}

/**
 * Bulk delete sites
 */
export async function bulkDeleteSites(siteCodes: string[]): Promise<boolean> {
  if (siteCodes.length === 0) {
    return true;
  }

  const placeholders = siteCodes.map((_, i) => `$${i + 1}`);

  const results = await query<{ site_code: string }>(
    `DELETE FROM sites WHERE site_code IN (${placeholders.join(", ")}) RETURNING site_code`,
    siteCodes,
  );

  // Invalidate cache
  for (const id of siteCodes) {
    await del(buildKey(CACHE_PREFIX.SITE, id));
  }

  return results.length > 0;
}

export default {
  createSite,
  getSiteById,
  getAllSites,
  updateSite,
  deleteSite,
  bulkUpdateSites,
  bulkDeleteSites,
};
