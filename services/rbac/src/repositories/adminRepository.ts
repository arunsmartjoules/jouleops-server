/**
 * Admin Repository
 *
 * Handles admin/superadmin management operations
 */

import { query, queryOne } from "@smartops/shared";

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

export default {
  listAdmins,
  getUserById,
  promoteToAdmin,
  demoteAdmin,
  removeSuperadmin,
  setSuperadmin,
  isSuperadmin,
  SUPERADMIN_EMAIL,
};
