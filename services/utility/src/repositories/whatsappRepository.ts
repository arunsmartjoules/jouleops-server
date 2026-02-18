/**
 * WhatsApp Repository
 *
 * Handles WhatsApp group mappings and message logs
 */

import { query, queryOne } from "@jouleops/shared";
import { cached, del as cacheDel } from "@jouleops/shared";

const CACHE_TTL = 600; // 10 minutes

export interface WhatsAppGroupMapping {
  id: string; // Changed from number to string (UUID)
  site_code?: string;
  site_name?: string;
  whatsapp_group_id: string;
  whatsapp_group_name?: string;
  is_active?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface WhatsAppTemplate {
  id: string; // Changed from number to string (UUID)
  template_key: string;
  template_name?: string;
  template_content?: string;
  variables?: any;
  is_active?: boolean;
  updated_by?: string;
  updated_at?: Date;
}

export interface WhatsAppMessageLog {
  id: number;
  template_key?: string;
  recipient?: string;
  message_content?: string;
  status?: string;
  error_message?: string;
  sent_at?: Date;
  metadata?: any;
}

// --- Group Mappings ---

/**
 * Get all WhatsApp group mappings
 */
export async function getMappings(): Promise<WhatsAppGroupMapping[]> {
  const cacheKey = "whatsapp:mappings";
  return cached(
    cacheKey,
    async () => {
      const sql = `
        SELECT wm.id, wm.site_code, wm.whatsapp_group_id, wm.whatsapp_group_name, wm.is_active, wm.created_at, wm.updated_at,
               COALESCE(wm.site_name, s.name) as site_name
        FROM whatsapp_group_mappings wm
        LEFT JOIN sites s ON wm.site_code = s.site_code
        ORDER BY site_name, wm.created_at DESC
      `;
      return query(sql);
    },
    CACHE_TTL,
  );
}

/**
 * Create a new group mapping
 */
export async function createMapping(
  data: Partial<WhatsAppGroupMapping>,
): Promise<WhatsAppGroupMapping> {
  const sql = `
    INSERT INTO whatsapp_group_mappings (site_code, whatsapp_group_id, whatsapp_group_name, is_active, created_at, updated_at)
    VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING *
  `;
  const result = await queryOne<WhatsAppGroupMapping>(sql, [
    data.site_code,
    data.whatsapp_group_id,
    data.whatsapp_group_name,
    data.is_active ?? true,
  ]);

  // Invalidate cache
  await cacheDel("whatsapp:mappings");

  // Fetch with site name
  if (result && data.site_code) {
    const siteQuery = await queryOne<{ site_name: string }>(
      `SELECT name as site_name FROM sites WHERE site_code = $1`,
      [data.site_code],
    );
    result.site_name = siteQuery?.site_name;
  }

  return result!;
}

/**
 * Update a group mapping
 */
export async function updateMapping(
  id: number | string,
  data: Partial<WhatsAppGroupMapping>,
): Promise<WhatsAppGroupMapping> {
  const setClauses: string[] = ["updated_at = CURRENT_TIMESTAMP"];
  const params: any[] = [];

  if (data.site_code !== undefined) {
    params.push(data.site_code);
    setClauses.push(`site_code = $${params.length}`);
  }

  if (data.whatsapp_group_id !== undefined) {
    params.push(data.whatsapp_group_id);
    setClauses.push(`whatsapp_group_id = $${params.length}`);
  }

  if (data.whatsapp_group_name !== undefined) {
    params.push(data.whatsapp_group_name);
    setClauses.push(`whatsapp_group_name = $${params.length}`);
  }

  if (data.is_active !== undefined) {
    params.push(data.is_active);
    setClauses.push(`is_active = $${params.length}`);
  }

  params.push(id);
  const sql = `
    UPDATE whatsapp_group_mappings
    SET ${setClauses.join(", ")}
    WHERE id = $${params.length}
    RETURNING *
  `;
  const result = await queryOne<WhatsAppGroupMapping>(sql, params);

  // Invalidate cache
  await cacheDel("whatsapp:mappings");

  // Fetch site name
  if (result?.site_code) {
    const siteQuery = await queryOne<{ site_name: string }>(
      `SELECT name as site_name FROM sites WHERE site_code = $1`,
      [result.site_code],
    );
    result.site_name = siteQuery?.site_name;
  }

  return result!;
}

/**
 * Delete a group mapping
 */
export async function deleteMapping(id: number | string): Promise<void> {
  const sql = `DELETE FROM whatsapp_group_mappings WHERE id = $1`;
  await query(sql, [id]);

  // Invalidate cache
  await cacheDel("whatsapp:mappings");
}

/**
 * Bulk delete group mappings
 */
export async function bulkDeleteMappings(ids: string[]): Promise<void> {
  if (!ids || ids.length === 0) return;

  const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
  const sql = `DELETE FROM whatsapp_group_mappings WHERE id IN (${placeholders})`;
  await query(sql, ids);

  // Invalidate cache
  await cacheDel("whatsapp:mappings");
}

// --- Templates ---

/**
 * Get all WhatsApp templates
 */
export async function getTemplates(): Promise<WhatsAppTemplate[]> {
  const cacheKey = "whatsapp:templates";
  return cached(
    cacheKey,
    async () => {
      const sql = `
        SELECT *
        FROM whatsapp_message_templates
        WHERE is_active = true OR is_active IS NULL
        ORDER BY template_key
      `;
      return query(sql);
    },
    CACHE_TTL,
  );
}

/**
 * Update a template
 */
export async function updateTemplate(
  id: number | string,
  data: Partial<WhatsAppTemplate>,
): Promise<WhatsAppTemplate> {
  const setClauses: string[] = ["updated_at = CURRENT_TIMESTAMP"];
  const params: any[] = [];

  if (data.template_name !== undefined) {
    params.push(data.template_name);
    setClauses.push(`template_name = $${params.length}`);
  }

  if (data.template_content !== undefined) {
    params.push(data.template_content);
    setClauses.push(`template_content = $${params.length}`);
  }

  if (data.variables !== undefined) {
    params.push(JSON.stringify(data.variables));
    setClauses.push(`variables = $${params.length}`);
  }

  if (data.is_active !== undefined) {
    params.push(data.is_active);
    setClauses.push(`is_active = $${params.length}`);
  }

  if (data.updated_by !== undefined) {
    params.push(data.updated_by);
    setClauses.push(`updated_by = $${params.length}`);
  }

  params.push(id);
  const sql = `
    UPDATE whatsapp_message_templates
    SET ${setClauses.join(", ")}
    WHERE id = $${params.length}
    RETURNING *
  `;
  const result = await queryOne<WhatsAppTemplate>(sql, params);

  // Invalidate cache
  await cacheDel("whatsapp:templates");

  return result!;
}

// --- Message Logs ---

/**
 * Get recent message logs
 */
export async function getMessageLogs(
  limit: number = 100,
): Promise<WhatsAppMessageLog[]> {
  const sql = `
    SELECT *
    FROM whatsapp_message_logs
    ORDER BY sent_at DESC
    LIMIT $1
  `;
  return query(sql, [limit]);
}

/**
 * Create a message log entry
 */
export async function createMessageLog(
  data: Partial<WhatsAppMessageLog>,
): Promise<WhatsAppMessageLog> {
  const sql = `
    INSERT INTO whatsapp_message_logs (template_key, recipient, message_content, status, error_message, sent_at, metadata)
    VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6)
    RETURNING *
  `;
  const result = await queryOne<WhatsAppMessageLog>(sql, [
    data.template_key,
    data.recipient,
    data.message_content,
    data.status || "sent",
    data.error_message,
    data.metadata ? JSON.stringify(data.metadata) : null,
  ]);
  return result!;
}

export default {
  getMappings,
  createMapping,
  updateMapping,
  deleteMapping,
  getTemplates,
  updateTemplate,
  getMessageLogs,
  createMessageLog,
  bulkDeleteMappings,
};
