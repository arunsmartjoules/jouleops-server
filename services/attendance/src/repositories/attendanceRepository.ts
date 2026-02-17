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
  // Get assigned site IDs
  const userSites = await query<{ site_code: string }>(
    `SELECT site_code FROM site_user WHERE user_id = $1`,
    [userId],
  );

  if (!userSites || userSites.length === 0) return [];

  const siteCodes = userSites.map((us) => us.site_code);
  const placeholders = siteCodes.map((_, i) => `$${i + 1}`).join(", ");

  let whereClause = `WHERE site_code IN (${placeholders})`;
  const params: any[] = [...siteCodes];

  if (projectType) {
    whereClause += ` AND project_type = $${params.length + 1}`;
    params.push(projectType);
  }

  // Fetch site details with coordinates
  return query<SiteWithCoordinates>(
    `SELECT site_code, name, address, city, state, latitude, longitude, radius, project_type
     FROM sites ${whereClause}`,
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
};
