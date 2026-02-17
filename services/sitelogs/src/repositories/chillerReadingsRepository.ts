/**
 * Chiller Readings Repository
 *
 * Data access layer for chiller_readings table.
 */

import { query, queryOne } from "@jouleops/shared";
import { cached, TTL } from "@jouleops/shared";

// ============================================================================
// Types
// ============================================================================

export interface ChillerReading {
  id: string; // UUID in database
  site_code: string;
  chiller_id?: string;
  equipment_id?: string;
  log_id?: string;
  executor_id?: string;
  reading_time?: Date;
  startdatetime?: Date;
  start_datetime?: Date;
  enddatetime?: Date;
  date_shift?: string;
  compressor_load_percentage?: number;
  compressor_load_percent?: number;
  set_point_celsius?: number;
  set_point?: number;
  condenser_inlet_temp?: number;
  condenser_outlet_temp?: number;
  evaporator_inlet_temp?: number;
  evaporator_outlet_temp?: number;
  compressor_suction_temp?: number;
  motor_temperature?: number;
  saturated_condenser_temp?: number;
  saturated_suction_temp?: number;
  discharge_pressure?: number;
  main_suction_pressure?: number;
  oil_pressure?: number;
  oil_pressure_difference?: number;
  condenser_inlet_pressure?: number;
  condenser_outlet_pressure?: number;
  evaporator_inlet_pressure?: number;
  evaporator_outlet_pressure?: number;
  inline_btu_meter?: number;
  status: string;
  remarks?: string;
  reviewed_by?: string;
  signature_text?: string;
  attachments?: string;
  sla_status?: string;
  delete?: boolean;
  sync?: boolean;
  lastsync?: Date;
  deletedat?: Date;
  createdat?: Date;
  updatedat?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface CreateChillerReadingInput {
  site_code: string;
  chiller_id?: string;
  equipment_id?: string;
  log_id?: string;
  executor_id?: string;
  reading_time?: Date;
  date_shift?: string;
  compressor_load_percentage?: number;
  status?: string;
  condenser_inlet_temp?: number;
  condenser_outlet_temp?: number;
  evaporator_inlet_temp?: number;
  evaporator_outlet_temp?: number;
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
 * Get chiller reading by ID (UUID)
 */
export async function getChillerReadingById(
  id: string,
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
  siteCode: string,
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

  if (siteCode !== "all") {
    conditions.push(`site_code = $${paramIndex}`);
    params.push(siteCode);
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

  // Get data with explicit columns (avoid SELECT *)
  const CHILLER_LIST_COLUMNS = `id, site_code, chiller_id, equipment_id, reading_time,
    date_shift, compressor_load_percentage, status, remarks,
    condenser_inlet_temp, condenser_outlet_temp,
    evaporator_inlet_temp, evaporator_outlet_temp,
    set_point_celsius, compressor_suction_temp,
    discharge_pressure, main_suction_pressure,
    sla_status, created_at, updated_at`;

  const data = await query<ChillerReading>(
    `SELECT ${CHILLER_LIST_COLUMNS} FROM chiller_readings ${whereClause}
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
  siteCode: string,
  dateShift: string,
): Promise<ChillerReading[]> {
  return query<ChillerReading>(
    `SELECT * FROM chiller_readings
     WHERE site_code = $1 AND date_shift = $2
     ORDER BY reading_time ASC`,
    [siteCode, dateShift],
  );
}

/**
 * Update a chiller reading
 */
export async function updateChillerReading(
  id: string,
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
 * Delete a chiller reading (UUID)
 */
export async function deleteChillerReading(id: string): Promise<boolean> {
  const result = await queryOne<{ id: string }>(
    `DELETE FROM chiller_readings WHERE id = $1 RETURNING id`,
    [id],
  );
  return result !== null;
}

/**
 * Get average readings for a chiller over a period
 * Uses SQL AVG() + cache-aside (5min TTL)
 */
export async function getChillerAverages(
  chillerId: string,
  dateFrom: string,
  dateTo: string,
): Promise<ChillerAverages | null> {
  const cacheKey = `chiller_avg:${chillerId}:${dateFrom}:${dateTo}`;

  return cached(
    cacheKey,
    async () => {
      const result = await queryOne<{
        cnt: string;
        avg_condenser_inlet: string | null;
        avg_condenser_outlet: string | null;
        avg_evaporator_inlet: string | null;
        avg_evaporator_outlet: string | null;
        avg_compressor_load: string | null;
      }>(
        `SELECT
         COUNT(*)::text AS cnt,
         ROUND(AVG(condenser_inlet_temp)::numeric, 2)::text AS avg_condenser_inlet,
         ROUND(AVG(condenser_outlet_temp)::numeric, 2)::text AS avg_condenser_outlet,
         ROUND(AVG(evaporator_inlet_temp)::numeric, 2)::text AS avg_evaporator_inlet,
         ROUND(AVG(evaporator_outlet_temp)::numeric, 2)::text AS avg_evaporator_outlet,
         ROUND(AVG(compressor_load_percentage)::numeric, 2)::text AS avg_compressor_load
       FROM chiller_readings
       WHERE chiller_id = $1
         AND reading_time >= $2
         AND reading_time <= $3`,
        [chillerId, dateFrom, dateTo],
      );

      const count = parseInt(result?.cnt || "0", 10);
      if (count === 0) return null;

      return {
        count,
        condenser_inlet_temp: +(result?.avg_condenser_inlet || 0),
        condenser_outlet_temp: +(result?.avg_condenser_outlet || 0),
        evaporator_inlet_temp: +(result?.avg_evaporator_inlet || 0),
        evaporator_outlet_temp: +(result?.avg_evaporator_outlet || 0),
        compressor_load_percentage: +(result?.avg_compressor_load || 0),
      };
    },
    TTL.MEDIUM,
  ); // 5 minute TTL
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
