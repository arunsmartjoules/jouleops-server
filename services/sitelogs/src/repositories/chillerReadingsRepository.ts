/**
 * Chiller Readings Repository
 *
 * Data access layer for chiller_readings table.
 */

import { query, queryOne } from "@smartops/shared";

// ============================================================================
// Types
// ============================================================================

export interface ChillerReading {
  id: number;
  site_id: string;
  chiller_id: string;
  reading_time: Date;
  date_shift?: string;
  condenser_inlet_temp?: number;
  condenser_outlet_temp?: number;
  evaporator_inlet_temp?: number;
  evaporator_outlet_temp?: number;
  compressor_load_percentage?: number;
  // Additional fields as needed
  status?: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface CreateChillerReadingInput {
  site_id: string;
  chiller_id: string;
  reading_time?: Date;
  date_shift?: string;
  condenser_inlet_temp?: number;
  condenser_outlet_temp?: number;
  evaporator_inlet_temp?: number;
  evaporator_outlet_temp?: number;
  compressor_load_percentage?: number;
  status?: string;
}

export interface GetChillerReadingsOptions {
  page?: number;
  limit?: number;
  chiller_id?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface ChillerAverages {
  count: number;
  condenser_inlet_temp: number;
  condenser_outlet_temp: number;
  evaporator_inlet_temp: number;
  evaporator_outlet_temp: number;
  compressor_load_percentage: number;
}

// ============================================================================
// Repository Functions
// ============================================================================

/**
 * Create a chiller reading
 */
export async function createChillerReading(
  data: CreateChillerReadingInput,
): Promise<ChillerReading> {
  const columns = Object.keys(data).filter(
    (k) => data[k as keyof CreateChillerReadingInput] !== undefined,
  );
  const values = columns.map((k) => data[k as keyof CreateChillerReadingInput]);
  const placeholders = columns.map((_, i) => `$${i + 1}`);

  const reading = await queryOne<ChillerReading>(
    `INSERT INTO chiller_readings (${columns.join(", ")})
     VALUES (${placeholders.join(", ")})
     RETURNING *`,
    values,
  );

  if (!reading) {
    throw new Error("Failed to create chiller reading");
  }

  return reading;
}

/**
 * Get chiller reading by ID
 */
export async function getChillerReadingById(
  id: number,
): Promise<ChillerReading | null> {
  return queryOne<ChillerReading>(
    `SELECT * FROM chiller_readings WHERE id = $1`,
    [id],
  );
}

/**
 * Get chiller readings by site with pagination
 */
export async function getChillerReadingsBySite(
  siteId: string,
  options: GetChillerReadingsOptions = {},
): Promise<{
  data: ChillerReading[];
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
    chiller_id = null,
    date_from = null,
    date_to = null,
    sortBy = "reading_time",
    sortOrder = "desc",
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

  if (chiller_id) {
    conditions.push(`chiller_id = $${paramIndex}`);
    params.push(chiller_id);
    paramIndex++;
  }

  if (date_from) {
    conditions.push(`reading_time >= $${paramIndex}`);
    params.push(date_from);
    paramIndex++;
  }

  if (date_to) {
    conditions.push(`reading_time <= $${paramIndex}`);
    params.push(date_to);
    paramIndex++;
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderDirection = sortOrder === "asc" ? "ASC" : "DESC";

  // Get count
  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM chiller_readings ${whereClause}`,
    params,
  );
  const total = parseInt(countResult?.count || "0", 10);

  // Get data
  const data = await query<ChillerReading>(
    `SELECT * FROM chiller_readings ${whereClause}
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
 * Get chiller readings by chiller
 */
export async function getChillerReadingsByChiller(
  chillerId: string,
  options: {
    limit?: number;
    date_from?: string | null;
    date_to?: string | null;
  } = {},
): Promise<ChillerReading[]> {
  const { limit = 50, date_from = null, date_to = null } = options;

  const conditions: string[] = ["chiller_id = $1"];
  const params: any[] = [chillerId];
  let paramIndex = 2;

  if (date_from) {
    conditions.push(`reading_time >= $${paramIndex}`);
    params.push(date_from);
    paramIndex++;
  }

  if (date_to) {
    conditions.push(`reading_time <= $${paramIndex}`);
    params.push(date_to);
    paramIndex++;
  }

  return query<ChillerReading>(
    `SELECT * FROM chiller_readings
     WHERE ${conditions.join(" AND ")}
     ORDER BY reading_time DESC
     LIMIT $${paramIndex}`,
    [...params, limit],
  );
}

/**
 * Get latest reading by chiller
 */
export async function getLatestReadingByChiller(
  chillerId: string,
): Promise<ChillerReading | null> {
  return queryOne<ChillerReading>(
    `SELECT * FROM chiller_readings
     WHERE chiller_id = $1
     ORDER BY reading_time DESC
     LIMIT 1`,
    [chillerId],
  );
}

/**
 * Get readings by date and shift
 */
export async function getReadingsByDateShift(
  siteId: string,
  dateShift: string,
): Promise<ChillerReading[]> {
  return query<ChillerReading>(
    `SELECT * FROM chiller_readings
     WHERE site_id = $1 AND date_shift = $2
     ORDER BY reading_time ASC`,
    [siteId, dateShift],
  );
}

/**
 * Update a chiller reading
 */
export async function updateChillerReading(
  id: number,
  updateData: Partial<ChillerReading>,
): Promise<ChillerReading> {
  const { created_at, ...allowedUpdates } = updateData as any;

  const entries = Object.entries(allowedUpdates).filter(
    ([, value]) => value !== undefined,
  );

  if (entries.length === 0) {
    throw new Error("No fields to update");
  }

  const setClauses = entries.map(([key], i) => `${key} = $${i + 1}`);
  const values = entries.map(([, value]) => value);

  const reading = await queryOne<ChillerReading>(
    `UPDATE chiller_readings
     SET ${setClauses.join(", ")}, updated_at = NOW()
     WHERE id = $${entries.length + 1}
     RETURNING *`,
    [...values, id],
  );

  if (!reading) {
    throw new Error("Chiller reading not found");
  }

  return reading;
}

/**
 * Delete a chiller reading
 */
export async function deleteChillerReading(id: number): Promise<boolean> {
  const result = await queryOne<{ id: number }>(
    `DELETE FROM chiller_readings WHERE id = $1 RETURNING id`,
    [id],
  );
  return result !== null;
}

/**
 * Get average readings for a chiller over a period
 */
export async function getChillerAverages(
  chillerId: string,
  dateFrom: string,
  dateTo: string,
): Promise<ChillerAverages | null> {
  const data = await query<ChillerReading>(
    `SELECT * FROM chiller_readings
     WHERE chiller_id = $1
       AND reading_time >= $2
       AND reading_time <= $3`,
    [chillerId, dateFrom, dateTo],
  );

  if (data.length === 0) return null;

  const averages: ChillerAverages = {
    count: data.length,
    condenser_inlet_temp: 0,
    condenser_outlet_temp: 0,
    evaporator_inlet_temp: 0,
    evaporator_outlet_temp: 0,
    compressor_load_percentage: 0,
  };

  data.forEach((reading) => {
    averages.condenser_inlet_temp += reading.condenser_inlet_temp || 0;
    averages.condenser_outlet_temp += reading.condenser_outlet_temp || 0;
    averages.evaporator_inlet_temp += reading.evaporator_inlet_temp || 0;
    averages.evaporator_outlet_temp += reading.evaporator_outlet_temp || 0;
    averages.compressor_load_percentage +=
      reading.compressor_load_percentage || 0;
  });

  // Calculate averages
  averages.condenser_inlet_temp = +(
    averages.condenser_inlet_temp / data.length
  ).toFixed(2);
  averages.condenser_outlet_temp = +(
    averages.condenser_outlet_temp / data.length
  ).toFixed(2);
  averages.evaporator_inlet_temp = +(
    averages.evaporator_inlet_temp / data.length
  ).toFixed(2);
  averages.evaporator_outlet_temp = +(
    averages.evaporator_outlet_temp / data.length
  ).toFixed(2);
  averages.compressor_load_percentage = +(
    averages.compressor_load_percentage / data.length
  ).toFixed(2);

  return averages;
}

export default {
  createChillerReading,
  getChillerReadingById,
  getChillerReadingsBySite,
  getChillerReadingsByChiller,
  getLatestReadingByChiller,
  getReadingsByDateShift,
  updateChillerReading,
  deleteChillerReading,
  getChillerAverages,
};
