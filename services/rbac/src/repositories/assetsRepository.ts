/**
 * Assets Repository
 *
 * Data access layer for assets table.
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

export interface Asset {
  asset_id: string;
  site_id: string;
  asset_name: string;
  category?: string;
  asset_type?: string;
  equipment_type?: string;
  status: string;
  criticality?: string;
  location?: string;
  floor?: string;
  make?: string;
  model?: string;
  serial_number?: string;
  installation_date?: Date | string;
  warranty_start_date?: Date | string;
  warranty_end_date?: Date | string;
  vendor_id?: string;
  amc_cmc_provider?: string;
  item_name?: string;
  item_type?: string;
  item_code?: string;
  inventory_id?: string;
  qr_id?: string;
  area_type?: string;
  area_floor_id?: string;
  specifications?: Record<string, any>;
  created_by?: string;
  updated_by?: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface CreateAssetInput extends Partial<
  Omit<Asset, "id" | "created_at" | "updated_at">
> {
  site_id: string;
  asset_name: string;
}

export interface UpdateAssetInput extends Partial<
  Omit<Asset, "asset_id" | "id" | "created_at" | "updated_at">
> {}

export interface GetAssetsOptions {
  page?: number;
  limit?: number;
  asset_type?: string | null;
  equipment_type?: string | null;
  category?: string | null;
  status?: string | null;
  floor?: string | null;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  search?: string;
}

export interface AssetStats {
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
}

// ============================================================================
// Repository Functions
// ============================================================================

/**
 * Create a new asset
 */
export async function createAsset(data: CreateAssetInput): Promise<Asset> {
  const sanitizedData: any = { ...data };

  // Auto-generate asset_id if not provided
  if (!sanitizedData.asset_id) {
    const randomNum = Math.floor(100000 + Math.random() * 900000);
    sanitizedData.asset_id = `AST-${randomNum}`;
  }

  Object.keys(sanitizedData).forEach((key) => {
    if (sanitizedData[key] === "") {
      sanitizedData[key] = null;
    }
  });

  const columns = Object.keys(sanitizedData).filter(
    (k) => sanitizedData[k] !== undefined,
  );
  const values = columns.map((k) => {
    const val = sanitizedData[k];
    return k === "specifications" && val ? JSON.stringify(val) : val;
  });
  const placeholders = columns.map((_, i) => `$${i + 1}`);

  const sql = `
    INSERT INTO assets (${columns.join(", ")})
    VALUES (${placeholders.join(", ")})
    RETURNING *
  `;

  const asset = await queryOne<Asset>(sql, values);

  if (!asset) {
    throw new Error("Failed to create asset");
  }

  return asset;
}

/**
 * Get asset by ID (with caching)
 */
export async function getAssetById(assetId: string): Promise<Asset | null> {
  const cacheKey = buildKey(CACHE_PREFIX.ASSET, assetId);

  return cached(
    cacheKey,
    async () => {
      return queryOne<Asset>(`SELECT * FROM assets WHERE asset_id = $1`, [
        assetId,
      ]);
    },
    TTL.MEDIUM,
  );
}

/**
 * Get asset by QR ID (with caching)
 */
export async function getAssetByQrId(qrId: string): Promise<Asset | null> {
  const cacheKey = buildKey("asset_qr:", qrId);

  return cached(
    cacheKey,
    async () => {
      return queryOne<Asset>(`SELECT * FROM assets WHERE qr_id = $1`, [qrId]);
    },
    TTL.MEDIUM,
  );
}

/**
 * Get assets by site with pagination and filtering
 */
export async function getAssetsBySite(
  siteId: string,
  options: GetAssetsOptions = {},
): Promise<{
  data: Asset[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}> {
  const {
    page = 1,
    limit = 50,
    asset_type = null,
    equipment_type = null,
    category = null,
    status = null,
    floor = null,
    sortBy = "asset_name",
    sortOrder = "asc",
    search = "",
  } = options;

  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (siteId !== "all") {
    conditions.push(`site_id = $${paramIndex}`);
    params.push(siteId);
    paramIndex++;
  }

  if (asset_type) {
    conditions.push(`asset_type = $${paramIndex}`);
    params.push(asset_type);
    paramIndex++;
  }

  if (equipment_type) {
    conditions.push(`equipment_type = $${paramIndex}`);
    params.push(equipment_type);
    paramIndex++;
  }

  if (category) {
    conditions.push(`category = $${paramIndex}`);
    params.push(category);
    paramIndex++;
  }

  if (status) {
    conditions.push(`status = $${paramIndex}`);
    params.push(status);
    paramIndex++;
  }

  if (floor) {
    conditions.push(`floor = $${paramIndex}`);
    params.push(floor);
    paramIndex++;
  }

  if (search) {
    conditions.push(
      `(asset_name ILIKE $${paramIndex} OR asset_id ILIKE $${paramIndex} OR serial_number ILIKE $${paramIndex} OR make ILIKE $${paramIndex} OR model ILIKE $${paramIndex})`,
    );
    params.push(`%${search}%`);
    paramIndex++;
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderDirection = sortOrder === "asc" ? "ASC" : "DESC";

  // Get total count
  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM assets ${whereClause}`,
    params,
  );
  const total = parseInt(countResult?.count || "0", 10);

  // Get paginated data
  const dataParams = [...params, limit, offset];
  const data = await query<Asset>(
    `SELECT * FROM assets ${whereClause}
     ORDER BY ${sortBy} ${orderDirection}
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    dataParams,
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
 * Get assets by type for a site
 */
export async function getAssetsByType(
  siteId: string,
  assetType: string,
): Promise<Asset[]> {
  return query<Asset>(
    `SELECT * FROM assets
     WHERE site_id = $1 AND asset_type = $2 AND status = 'Active'
     ORDER BY asset_name ASC`,
    [siteId, assetType],
  );
}

/**
 * Get assets by location for a site
 */
export async function getAssetsByLocation(
  siteId: string,
  location: string,
): Promise<Asset[]> {
  return query<Asset>(
    `SELECT * FROM assets
     WHERE site_id = $1 AND location ILIKE $2
     ORDER BY asset_name ASC`,
    [siteId, `%${location}%`],
  );
}

/**
 * Search assets within a site
 */
export async function searchAssets(
  siteId: string,
  searchTerm: string,
): Promise<Asset[]> {
  return query<Asset>(
    `SELECT * FROM assets
     WHERE site_id = $1
       AND (asset_name ILIKE $2 OR asset_id ILIKE $2 OR location ILIKE $2)
     ORDER BY asset_name ASC
     LIMIT 20`,
    [siteId, `%${searchTerm}%`],
  );
}

/**
 * Get assets under warranty
 */
export async function getAssetsUnderWarranty(siteId: string): Promise<Asset[]> {
  return query<Asset>(
    `SELECT * FROM assets
     WHERE site_id = $1 AND warranty_end_date >= CURRENT_DATE
     ORDER BY warranty_end_date ASC`,
    [siteId],
  );
}

/**
 * Get assets with warranty expiring within N days
 */
export async function getAssetsWarrantyExpiring(
  siteId: string,
  days: number = 30,
): Promise<Asset[]> {
  return query<Asset>(
    `SELECT * FROM assets
     WHERE site_id = $1
       AND warranty_end_date >= CURRENT_DATE
       AND warranty_end_date <= CURRENT_DATE + $2::integer
     ORDER BY warranty_end_date ASC`,
    [siteId, days],
  );
}

/**
 * Update an asset
 */
export async function updateAsset(
  asset_id: string,
  updateData: UpdateAssetInput,
): Promise<Asset> {
  const sanitizedData: any = { ...updateData };
  Object.keys(sanitizedData).forEach((key) => {
    if (sanitizedData[key] === "") {
      sanitizedData[key] = null;
    }
  });

  const entries = Object.entries(sanitizedData).filter(
    ([key, value]) =>
      value !== undefined &&
      !["updated_at", "created_at", "asset_id", "id"].includes(key),
  );

  if (entries.length === 0) {
    throw new Error("No fields to update");
  }

  const setClauses = entries.map(([key], i) => `${key} = $${i + 1}`);
  const values = entries.map(([key, value]) =>
    key === "specifications" && value ? JSON.stringify(value) : value,
  );

  const sql = `
    UPDATE assets
    SET ${setClauses.join(", ")}, updated_at = NOW()
    WHERE asset_id = $${entries.length + 1}
    RETURNING *
  `;

  const asset = await queryOne<Asset>(sql, [...values, asset_id]);

  if (!asset) {
    throw new Error("Asset not found");
  }

  // Invalidate cache
  await del(buildKey(CACHE_PREFIX.ASSET, asset_id));

  return asset;
}

/**
 * Update asset status
 */
export async function updateAssetStatus(
  asset_id: string,
  status: string,
): Promise<Asset> {
  return updateAsset(asset_id, { status });
}

/**
 * Delete an asset
 */
export async function deleteAsset(asset_id: string): Promise<boolean> {
  const result = await queryOne<{ asset_id: string }>(
    `DELETE FROM assets WHERE asset_id = $1 RETURNING asset_id`,
    [asset_id],
  );

  await del(buildKey(CACHE_PREFIX.ASSET, asset_id));

  return result !== null;
}

/**
 * Get asset statistics for a site
 */
export async function getAssetStats(siteId: string): Promise<AssetStats> {
  const data = await query<{ status: string; asset_type: string | null }>(
    `SELECT status, asset_type FROM assets WHERE site_id = $1`,
    [siteId],
  );

  const stats: AssetStats = {
    total: data.length,
    byStatus: {},
    byType: {},
  };

  data.forEach((asset) => {
    stats.byStatus[asset.status] = (stats.byStatus[asset.status] || 0) + 1;
    if (asset.asset_type) {
      stats.byType[asset.asset_type] =
        (stats.byType[asset.asset_type] || 0) + 1;
    }
  });

  return stats;
}

export default {
  createAsset,
  getAssetById,
  getAssetByQrId,
  getAssetsBySite,
  getAssetsByType,
  getAssetsByLocation,
  searchAssets,
  getAssetsUnderWarranty,
  getAssetsWarrantyExpiring,
  updateAsset,
  updateAssetStatus,
  deleteAsset,
  getAssetStats,
  bulkUpsertAssets,
};

/**
 * Bulk upsert assets
 */
export async function bulkUpsertAssets(assets: any[]): Promise<{ count: number }> {
  if (!assets || assets.length === 0) {
    return { count: 0 };
  }

  // Sanitizing and auto-generating asset_ids if missing
  const processedAssets = assets.map(asset => {
    const sanitized = { ...asset };
    if (!sanitized.asset_id) {
      const randomNum = Math.floor(100000 + Math.random() * 900000);
      sanitized.asset_id = `AST-${randomNum}`;
    }
    Object.keys(sanitized).forEach(key => {
      if (sanitized[key] === "") sanitized[key] = null;
    });
    return sanitized;
  });

  const allColumns = Array.from(new Set(processedAssets.flatMap(a => Object.keys(a))));
  const values: any[] = [];
  const placeholders: string[] = [];
  
  processedAssets.forEach((asset, i) => {
    const rowPlaceholders = allColumns.map((col, j) => {
      let val = (asset as any)[col];
      if (col === "specifications" && val) val = JSON.stringify(val);
      values.push(val);
      return `$${i * allColumns.length + j + 1}`;
    });
    placeholders.push(`(${rowPlaceholders.join(", ")})`);
  });

  const sql = `
    INSERT INTO assets (${allColumns.join(", ")})
    VALUES ${placeholders.join(", ")}
    RETURNING asset_id
  `;

  // For now, we'll do simple batch insert. 
  const results = await query<{ asset_id: string }>(sql, values);
  
  // Invalidate cache for all affected assets
  for (const res of results) {
    await del(buildKey(CACHE_PREFIX.ASSET, res.asset_id));
  }
  
  return { count: results.length };
}
