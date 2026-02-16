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
  site_id: string;
  name: string;
  location?: string;
  city?: string;
  address?: string;
  is_active: boolean;
  whatsapp_group_id?: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface CreateSiteInput {
  site_id: string;
  name: string;
  location?: string;
  city?: string;
  address?: string;
  is_active?: boolean;
  whatsapp_group_id?: string;
}

export interface UpdateSiteInput {
  name?: string;
  location?: string;
  city?: string;
  address?: string;
  is_active?: boolean;
  whatsapp_group_id?: string;
}

export interface GetSitesOptions {
  is_active?: boolean | null;
  city?: string | null;
  search?: string;
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
export async function getSiteById(siteId: string): Promise<Site | null> {
  const cacheKey = buildKey(CACHE_PREFIX.SITE, siteId);

  return cached(
    cacheKey,
    async () => {
      return queryOne<Site>(`SELECT * FROM sites WHERE site_id = $1`, [siteId]);
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
  const { is_active = null, city = null, search = "" } = options;

  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (is_active !== null) {
    conditions.push(`is_active = $${paramIndex}`);
    params.push(is_active);
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
  siteId: string,
  updateData: UpdateSiteInput,
): Promise<Site> {
  const entries = Object.entries(updateData).filter(
    ([, value]) => value !== undefined,
  );

  if (entries.length === 0) {
    throw new Error("No fields to update");
  }

  const setClauses = entries.map(([key], i) => `${key} = $${i + 1}`);
  const values = entries.map(([, value]) => value);

  const sql = `
    UPDATE sites
    SET ${setClauses.join(", ")}, updated_at = NOW()
    WHERE site_id = $${entries.length + 1}
    RETURNING *
  `;

  const site = await queryOne<Site>(sql, [...values, siteId]);

  if (!site) {
    throw new Error("Site not found");
  }

  // Invalidate cache
  await del(buildKey(CACHE_PREFIX.SITE, siteId));

  return site;
}

/**
 * Delete a site
 */
export async function deleteSite(siteId: string): Promise<boolean> {
  const result = await queryOne<{ site_id: string }>(
    `DELETE FROM sites WHERE site_id = $1 RETURNING site_id`,
    [siteId],
  );

  await del(buildKey(CACHE_PREFIX.SITE, siteId));

  return result !== null;
}

/**
 * Bulk update sites
 */
export async function bulkUpdateSites(
  siteIds: string[],
  updateData: UpdateSiteInput,
): Promise<Site[]> {
  if (siteIds.length === 0) {
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
  const placeholders = siteIds.map((_, i) => `$${entries.length + 1 + i}`);

  const sql = `
    UPDATE sites
    SET ${setClauses.join(", ")}, updated_at = NOW()
    WHERE site_id IN (${placeholders.join(", ")})
    RETURNING *
  `;

  const sites = await query<Site>(sql, [...values, ...siteIds]);

  // Invalidate cache for all updated sites
  for (const id of siteIds) {
    await del(buildKey(CACHE_PREFIX.SITE, id));
  }

  return sites;
}

/**
 * Bulk delete sites
 */
export async function bulkDeleteSites(siteIds: string[]): Promise<boolean> {
  if (siteIds.length === 0) {
    return true;
  }

  const placeholders = siteIds.map((_, i) => `$${i + 1}`);

  const results = await query<{ site_id: string }>(
    `DELETE FROM sites WHERE site_id IN (${placeholders.join(", ")}) RETURNING site_id`,
    siteIds,
  );

  // Invalidate cache
  for (const id of siteIds) {
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
