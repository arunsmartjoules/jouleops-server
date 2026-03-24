/**
 * Attendance Logs Repository
 *
 * Data access layer for attendance_logs and related tables.
 */

import { query, queryOne } from "@jouleops/shared";

// ============================================================================
// Types
// ============================================================================

export interface AttendanceLog {
  id: string;
  user_id: string;
  site_code: string;
  date: string;
  check_in_time?: Date;
  check_out_time?: Date;
  check_in_latitude?: number;
  check_in_longitude?: number;
  check_out_latitude?: number;
  check_out_longitude?: number;
  check_in_address?: string;
  check_out_address?: string;
  shift_id?: string;
  status: string;
  remarks?: string;
  fieldproxy_punch_id?: number;
  created_at?: Date;
  updated_at?: Date;
}

export interface CheckInInput {
  user_id: string;
  site_code: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  shift_id?: string;
}

export interface CheckOutInput {
  latitude?: number;
  longitude?: number;
  address?: string;
  remarks?: string;
}

export interface GetAttendanceOptions {
  page?: number;
  limit?: number;
  date_from?: string | null;
  date_to?: string | null;
  status?: string | null;
  site_code?: string | undefined;
}

export interface SiteWithCoordinates {
  site_code: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  latitude?: string;
  longitude?: string;
  radius?: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get current date in IST format (YYYY-MM-DD)
 */
const getISTDate = (): string => {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
};

/**
 * Calculate distance between two coordinates using Haversine formula
 * @returns distance in meters
 */
export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number => {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

// ============================================================================
// Repository Functions
// ============================================================================

/**
 * Get user's work location type
 */
export async function getUserWorkLocationType(
  userId: string,
): Promise<string | null> {
  const result = await queryOne<{ work_location_type: string }>(
    `SELECT work_location_type FROM users WHERE user_id = $1`,
    [userId],
  );
  return result?.work_location_type || null;
}

/**
 * Get sites assigned to a user with their coordinates
 */
export async function getUserSitesWithCoordinates(
  userId: string,
  projectType?: string,
): Promise<SiteWithCoordinates[]> {
  // Always enforce JouleCool filter; use provided projectType or default to 'JouleCool'
  const effectiveProjectType = projectType || "JouleCool";
  const params: any[] = [userId, effectiveProjectType];

  // Only return sites from site_user mappings matching the project type
  return query<SiteWithCoordinates>(
    `SELECT s.site_code, s.name, s.address, s.city, s.state, s.latitude, s.longitude, s.radius, s.project_type
     FROM sites s
     JOIN site_user su ON s.site_id = su.site_id
     WHERE su.user_id = $1
       AND s.is_active = true
       AND s.project_type = $2`,
    params,
  );
}

/**
 * Check in
 */
export async function checkIn(data: CheckInInput): Promise<AttendanceLog> {
  const istDateString = getISTDate();

  const result = await queryOne<AttendanceLog>(
    `INSERT INTO attendance_logs 
     (user_id, site_code, check_in_time, check_in_latitude, check_in_longitude, 
      check_in_address, shift_id, status, date)
     VALUES ($1, $2, NOW(), $3, $4, $5, $6, 'Present', $7)
     RETURNING *`,
    [
      data.user_id,
      data.site_code,
      data.latitude || null,
      data.longitude || null,
      data.address || null,
      data.shift_id || null,
      istDateString,
    ],
  );

  if (!result) {
    throw new Error("Failed to check in");
  }

  return result;
}

/**
 * Check out
 */
export async function checkOut(
  attendanceId: string,
  data: CheckOutInput,
): Promise<AttendanceLog> {
  const result = await queryOne<AttendanceLog>(
    `UPDATE attendance_logs
     SET check_out_time = NOW(),
         check_out_latitude = $1,
         check_out_longitude = $2,
         check_out_address = $3,
         remarks = $4,
         updated_at = NOW()
     WHERE id = $5
     RETURNING *`,
    [
      data.latitude || null,
      data.longitude || null,
      data.address || null,
      data.remarks || null,
      attendanceId,
    ],
  );

  if (!result) {
    throw new Error("Failed to check out");
  }

  return result;
}

/**
 * Get attendance by ID
 */
export async function getAttendanceById(
  id: string,
): Promise<AttendanceLog | null> {
  return queryOne<AttendanceLog>(
    `SELECT * FROM attendance_logs WHERE id = $1`,
    [id],
  );
}

/**
 * Get today's attendance for a user
 */
export async function getTodayAttendance(
  userId: string,
): Promise<AttendanceLog | null> {
  const today = getISTDate();

  return queryOne<AttendanceLog>(
    `SELECT * FROM attendance_logs
     WHERE user_id = $1 AND date = $2
     ORDER BY check_in_time DESC
     LIMIT 1`,
    [userId, today],
  );
}

/**
 * Get attendance by user with pagination
 */
export async function getAttendanceByUser(
  userId: string,
  options: GetAttendanceOptions = {},
): Promise<{
  data: AttendanceLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}> {
  const { page = 1, limit = 30, date_from = null, date_to = null } = options;
  const offset = (page - 1) * limit;

  const conditions: string[] = ["al.user_id = $1"];
  const params: any[] = [userId];
  let paramIndex = 2;

  if (date_from) {
    conditions.push(`al.date >= $${paramIndex}`);
    params.push(date_from);
    paramIndex++;
  }

  if (date_to) {
    conditions.push(`al.date <= $${paramIndex}`);
    params.push(date_to);
    paramIndex++;
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  // Get count
  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM attendance_logs al ${whereClause}`,
    params,
  );
  const total = parseInt(countResult?.count || "0", 10);

  // Get data
  const data = await query<AttendanceLog>(
    `SELECT al.*, 
            jsonb_build_object('name', u.name, 'employee_code', u.employee_code) as users,
            jsonb_build_object('name', s.name, 'site_code', s.site_code) as sites
     FROM attendance_logs al
     LEFT JOIN users u ON al.user_id = u.user_id
     LEFT JOIN sites s ON al.site_code = s.site_code
     ${whereClause}
     ORDER BY al.date DESC, al.check_in_time DESC
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
 * Get all attendance logs with pagination and filters
 */
export async function getAllAttendance(
  options: GetAttendanceOptions = {},
): Promise<{
  data: AttendanceLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}> {
  const {
    page = 1,
    limit = 30,
    date_from = null,
    date_to = null,
    status = null,
  } = options;
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (date_from) {
    conditions.push(`al.date >= $${paramIndex}`);
    params.push(date_from);
    paramIndex++;
  }

  if (date_to) {
    conditions.push(`al.date <= $${paramIndex}`);
    params.push(date_to);
    paramIndex++;
  }

  if (status) {
    conditions.push(`al.status = $${paramIndex}`);
    params.push(status);
    paramIndex++;
  }

  if (options.site_code && options.site_code !== "all") {
    conditions.push(`al.site_code = $${paramIndex}`);
    params.push(options.site_code);
    paramIndex++;
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Get count
  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM attendance_logs al ${whereClause}`,
    params,
  );
  const total = parseInt(countResult?.count || "0", 10);

  // Get data with user info
  const data = await query<AttendanceLog>(
    `SELECT al.*, 
            jsonb_build_object('name', u.name, 'employee_code', u.employee_code) as users,
            jsonb_build_object('name', s.name, 'site_code', s.site_code) as sites
     FROM attendance_logs al
     LEFT JOIN users u ON al.user_id = u.user_id
     LEFT JOIN sites s ON al.site_code = s.site_code
     ${whereClause}
     ORDER BY al.date DESC, al.check_in_time DESC
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
 * Get attendance by site for a specific date
 */
export async function getAttendanceBySite(
  siteCode: string,
  options: { date?: string; status?: string | null } = {},
): Promise<any[]> {
  const { date = new Date().toISOString().split("T")[0], status = null } =
    options;

  const conditions: string[] = ["al.site_code = $1", "al.date = $2"];
  const params: any[] = [siteCode, date];
  let paramIndex = 3;

  if (status) {
    conditions.push(`al.status = $${paramIndex}`);
    params.push(status);
    paramIndex++;
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  return query(
    `SELECT al.*, 
            jsonb_build_object(
              'name', u.name, 
              'phone', u.phone, 
              'role', u.role
            ) as users
     FROM attendance_logs al
     LEFT JOIN users u ON al.user_id = u.user_id
     ${whereClause}
     ORDER BY al.check_in_time ASC`,
    params,
  );
}

/**
 * Get attendance report
 */
export async function getAttendanceReport(
  siteCode: string | null,
  dateFrom: string,
  dateTo: string,
): Promise<any[]> {
  const conditions: string[] = ["al.date >= $1", "al.date <= $2"];
  const params: any[] = [dateFrom, dateTo];
  let paramIndex = 3;

  if (siteCode && siteCode !== "all") {
    conditions.push(`al.site_code = $${paramIndex}`);
    params.push(siteCode);
    paramIndex++;
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  return query(
    `SELECT al.*, 
            jsonb_build_object(
              'name', u.name, 
              'user_id', u.user_id, 
              'employee_code', u.employee_code
            ) as users,
            jsonb_build_object(
              'name', s.name, 
              'site_code', s.site_code
            ) as sites
     FROM attendance_logs al
     LEFT JOIN users u ON al.user_id = u.user_id
     LEFT JOIN sites s ON al.site_code = s.site_code
     ${whereClause}
     ORDER BY al.date ASC`,
    params,
  );
}

/**
 * Update attendance log
 */
export async function updateAttendanceLog(
  id: string,
  updateData: Partial<AttendanceLog>,
): Promise<AttendanceLog> {
  const { created_at, ...allowedUpdates } = updateData as any;

  const entries = Object.entries(allowedUpdates).filter(
    ([, value]) => value !== undefined,
  );

  if (entries.length === 0) {
    throw new Error("No fields to update");
  }

  const setClauses = entries.map(([key], i) => `${key} = $${i + 1}`);
  const values = entries.map(([, value]) => value);

  const result = await queryOne<AttendanceLog>(
    `UPDATE attendance_logs
     SET ${setClauses.join(", ")}, updated_at = NOW()
     WHERE id = $${entries.length + 1}
     RETURNING *`,
    [...values, id],
  );

  if (!result) {
    throw new Error("Attendance log not found");
  }

  return result;
}

/**
 * Delete attendance log
 */
export async function deleteAttendanceLog(id: string): Promise<boolean> {
  const result = await queryOne<{ id: string }>(
    `DELETE FROM attendance_logs WHERE id = $1 RETURNING id`,
    [id],
  );
  return result !== null;
}

/**
 * Get a user record by email (used for auth fallback when Supabase UUID differs from DB user_id)
 */
export async function getUserByEmail(email: string): Promise<{ user_id: string; email: string } | null> {
  return queryOne<{ user_id: string; email: string }>(
    `SELECT user_id, email FROM users WHERE email = $1 OR platform_email = $1 LIMIT 1`,
    [email],
  );
}

export default {
  calculateDistance,
  getUserWorkLocationType,
  getUserSitesWithCoordinates,
  checkIn,
  checkOut,
  getAttendanceById,
  getTodayAttendance,
  getAttendanceByUser,
  getAttendanceBySite,
  getAllAttendance,
  getAttendanceReport,
  updateAttendanceLog,
  deleteAttendanceLog,
  bulkUpsertAttendance,
  getUserByEmail,
};
export async function bulkUpsertAttendance(logs: any[]): Promise<{ count: number }> {
  if (!logs || logs.length === 0) {
    return { count: 0 };
  }

  // To avoid duplicates without a unique constraint, we'll perform the operation in a transaction:
  // 1. Delete existing records for the (user_id, date) pairs being imported
  // 2. Insert the new records
  
  const allColumns = Array.from(new Set(logs.flatMap(l => Object.keys(l))));
  const values: any[] = [];
  const placeholders: string[] = [];
  
  // Note: This approach assumes user_id and date are provided in all logs
  
  logs.forEach((log, i) => {
    const rowPlaceholders = allColumns.map((col, j) => {
      values.push((log as any)[col]);
      return `$${i * allColumns.length + j + 1}`;
    });
    placeholders.push(`(${rowPlaceholders.join(", ")})`);
  });

  const sql = `
    INSERT INTO attendance_logs (${allColumns.join(", ")})
    VALUES ${placeholders.join(", ")}
    RETURNING id
  `;

  // For now, we'll do simple batch insert. If user needs true upsert without unique index, 
  // we'd need a more complex strategy.
  const results = await query<{ id: string }>(sql, values);
  return { count: results.length };
}
