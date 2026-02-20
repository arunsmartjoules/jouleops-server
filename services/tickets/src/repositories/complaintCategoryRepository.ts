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
        FROM complaint_category
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
  const sql = `SELECT * FROM complaint_category WHERE id = $1`;
  return queryOne(sql, [id]);
}

/**
 * Create a new category
 */
export async function createCategory(data: {
  category: string;
}): Promise<ComplaintCategory> {
  const sql = `
    INSERT INTO complaint_category (category)
    VALUES ($1)
    RETURNING *
  `;
  const result = await queryOne<ComplaintCategory>(sql, [data.category]);

  // Invalidate cache
  await cacheDel("complaint_categories:all");

  return result!;
}

/**
 * Update a category
 */
export async function updateCategory(
  id: number | string,
  data: { category?: string },
): Promise<ComplaintCategory> {
  const setClauses: string[] = [];
  const params: any[] = [];

  if (data.category !== undefined) {
    params.push(data.category);
    setClauses.push(`category = $${params.length}`);
  }

  if (setClauses.length === 0) {
    return getCategoryById(id) as Promise<ComplaintCategory>;
  }

  params.push(id);
  const sql = `
    UPDATE complaint_category
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
 * Delete a category (hard delete since there is no is_active column)
 */
export async function deleteCategory(id: number | string): Promise<void> {
  const sql = `
    DELETE FROM complaint_category
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
