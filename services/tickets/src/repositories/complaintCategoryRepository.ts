/**
 * Complaint Category Repository
 *
 * Handles complaint categories
 */

import { query, queryOne, cached, cacheDel } from "@jouleops/shared";

const CACHE_TTL = 3600; // 1 hour (categories rarely change)

export interface ComplaintCategory {
  id: number;
  category: string;
  description?: string;
  is_active?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

/**
 * Get all categories
 */
export async function getAllCategories(): Promise<ComplaintCategory[]> {
  const cacheKey = "complaint_categories:all";
  return cached(
    cacheKey,
    async () => {
      const sql = `
        SELECT *
        FROM complaint_categories
        WHERE is_active = true OR is_active IS NULL
        ORDER BY category
      `;
      return query(sql);
    },
    CACHE_TTL,
  );
}

/**
 * Get category by ID
 */
export async function getCategoryById(
  id: number | string,
): Promise<ComplaintCategory | null> {
  const sql = `SELECT * FROM complaint_categories WHERE id = $1`;
  return queryOne(sql, [id]);
}

/**
 * Create a new category
 */
export async function createCategory(data: {
  category: string;
  description?: string;
}): Promise<ComplaintCategory> {
  const sql = `
    INSERT INTO complaint_categories (category, description, is_active, created_at, updated_at)
    VALUES ($1, $2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING *
  `;
  const result = await queryOne<ComplaintCategory>(sql, [
    data.category,
    data.description,
  ]);

  // Invalidate cache
  await cacheDel("complaint_categories:all");

  return result!;
}

/**
 * Update a category
 */
export async function updateCategory(
  id: number | string,
  data: { category?: string; description?: string },
): Promise<ComplaintCategory> {
  const setClauses: string[] = ["updated_at = CURRENT_TIMESTAMP"];
  const params: any[] = [];

  if (data.category !== undefined) {
    params.push(data.category);
    setClauses.push(`category = $${params.length}`);
  }

  if (data.description !== undefined) {
    params.push(data.description);
    setClauses.push(`description = $${params.length}`);
  }

  params.push(id);
  const sql = `
    UPDATE complaint_categories
    SET ${setClauses.join(", ")}
    WHERE id = $${params.length}
    RETURNING *
  `;
  const result = await queryOne<ComplaintCategory>(sql, params);

  // Invalidate cache
  await cacheDel("complaint_categories:all");

  return result!;
}

/**
 * Delete a category (soft delete by marking inactive)
 */
export async function deleteCategory(id: number | string): Promise<void> {
  const sql = `
    UPDATE complaint_categories
    SET is_active = false, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
  `;
  await query(sql, [id]);

  // Invalidate cache
  await cacheDel("complaint_categories:all");
}

export default {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
};
