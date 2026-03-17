/**
 * Admin Repository
 *
 * Handles admin/superadmin management operations
 */

import { query, queryOne } from "@jouleops/shared";

const SUPERADMIN_EMAIL = "arun.kumar@smartjoules.in";

export interface Admin {
  user_id: string;
  name?: string;
  full_name?: string;
  email: string;
  role: string;
  is_superadmin: boolean;
  is_active: boolean;
  created_at?: Date;
}

/**
 * List all admins and superadmins
 */
export async function listAdmins(): Promise<Admin[]> {
  const sql = `
    SELECT 
      user_id, 
      COALESCE(full_name, name) as name, 
      email, 
      role, 
      is_superadmin, 
      is_active, 
      created_at
    FROM users
    WHERE role = 'admin' OR is_superadmin = true OR email = $1
    ORDER BY is_superadmin DESC NULLS LAST, COALESCE(full_name, name)
  `;
  const admins = await query(sql, [SUPERADMIN_EMAIL]);

  // Mark the special email as superadmin if not already
  return admins.map((admin: Admin) => ({
    ...admin,
    is_superadmin: admin.is_superadmin || admin.email === SUPERADMIN_EMAIL,
  }));
}

/**
 * Get user by ID
 */
export async function getUserById(userId: string): Promise<Admin | null> {
  const sql = `
    SELECT user_id, COALESCE(full_name, name) as name, email, role, is_superadmin, is_active
    FROM users
    WHERE user_id = $1
  `;
  return queryOne(sql, [userId]);
}

/**
 * Promote a user to admin role
 */
export async function promoteToAdmin(userId: string): Promise<Admin> {
  const sql = `
    UPDATE users
    SET role = 'admin', updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1
    RETURNING user_id, COALESCE(full_name, name) as name, email, role, is_superadmin, is_active
  `;
  const result = await queryOne<Admin>(sql, [userId]);
  if (!result) throw new Error("User not found");
  return result;
}

/**
 * Demote an admin to staff
 */
export async function demoteAdmin(userId: string): Promise<Admin> {
  const sql = `
    UPDATE users
    SET role = 'staff', updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1
    RETURNING user_id, COALESCE(full_name, name) as name, email, role, is_superadmin, is_active
  `;
  const result = await queryOne<Admin>(sql, [userId]);
  if (!result) throw new Error("User not found");
  return result;
}

/**
 * Remove superadmin status from a user
 */
export async function removeSuperadmin(userId: string): Promise<void> {
  const sql = `
    UPDATE users
    SET is_superadmin = false, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1
  `;
  await query(sql, [userId]);
}

/**
 * Set a user as superadmin
 */
export async function setSuperadmin(userId: string): Promise<Admin> {
  const sql = `
    UPDATE users
    SET is_superadmin = true, role = 'admin', updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1
    RETURNING user_id, COALESCE(full_name, name) as name, email, role, is_superadmin, is_active
  `;
  const result = await queryOne<Admin>(sql, [userId]);
  if (!result) throw new Error("User not found");
  return result;
}

/**
 * Check if user is superadmin
 */
export async function isSuperadmin(userId: string): Promise<boolean> {
  const user = await getUserById(userId);
  return user?.is_superadmin || user?.email === SUPERADMIN_EMAIL;
}

/**
 * Get aggregated dashboard statistics
 */
export async function getDashboardStats() {
  const statsQueries = {
    totalUsers: "SELECT COUNT(*)::int FROM users",
    totalSites: "SELECT COUNT(*)::int FROM sites",
    totalAssets: "SELECT COUNT(*)::int FROM assets",
    totalTickets: "SELECT COUNT(*)::int FROM complaints",
    openTickets:
      "SELECT COUNT(*)::int FROM complaints WHERE status NOT IN ('Resolved', 'Completed', 'Cancelled')",
    criticalTickets:
      "SELECT COUNT(*)::int FROM complaints WHERE priority IN ('High', 'Critical')",
    checkInToday:
      "SELECT COUNT(*)::int FROM attendance_logs WHERE date = CURRENT_DATE",
    pendingPMs:
      "SELECT COUNT(*)::int FROM pm_instances WHERE status NOT IN ('Completed')",
    pendingSiteLogs:
      "SELECT COUNT(*)::int FROM site_logs WHERE status NOT IN ('Completed')",
  };

  const results: any = {};
  await Promise.all(
    Object.entries(statsQueries).map(async ([key, sql]) => {
      const res = await queryOne<{ count: number }>(sql);
      results[key] = res?.count || 0;
    }),
  );

  // Get ticket trends for last 7 days
  const trendSql = `
    SELECT 
      TO_CHAR(d, 'Mon DD') as date,
      (SELECT COUNT(*)::int FROM complaints WHERE created_at::date = d::date) as tickets,
      (SELECT COUNT(*)::int FROM attendance_logs WHERE date = d::date) as check_ins
    FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day'::interval) d
    ORDER BY d ASC
  `;
  const rawTrends = await query(trendSql);
  // Re-map to match ChartsSection expectations (date, tickets, checkIns)
  results.ticketTrends = rawTrends.map((t: any) => ({
    date: t.date,
    tickets: t.tickets,
    checkIns: t.check_ins,
  }));

  // Get category distribution
  const categorySql = `
    SELECT 
      COALESCE(NULLIF(category, ''), 'Uncategorized') as name, 
      COUNT(*)::int as value 
    FROM complaints 
    GROUP BY name 
    ORDER BY value DESC
  `;
  const allCategories = await query(categorySql);

  // Take top 5 and group others
  if (allCategories.length > 5) {
    const top5 = allCategories.slice(0, 5);
    const othersValue = allCategories
      .slice(5)
      .reduce((acc: number, curr: any) => acc + curr.value, 0);
    results.ticketsByCategory = [
      ...top5,
      { name: "Others", value: othersValue },
    ];
  } else {
    results.ticketsByCategory = allCategories;
  }

  return results;
}

export default {
  listAdmins,
  getUserById,
  promoteToAdmin,
  demoteAdmin,
  removeSuperadmin,
  setSuperadmin,
  isSuperadmin,
  getDashboardStats,
  SUPERADMIN_EMAIL,
};
