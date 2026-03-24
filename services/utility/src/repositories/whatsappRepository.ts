/**
 * WhatsApp Repository
 *
 * Handles WhatsApp group mappings and message logs
 */

import { query, queryOne } from "@jouleops/shared";
import { cached, del as cacheDel, encrypt, decrypt } from "@jouleops/shared";

const CACHE_TTL = 600; // 10 minutes

export interface WhatsAppChannel {
  id: string;
  channel_name: string;
  api_token: string;
  is_active?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface WhatsAppGroupMapping {
  id: string; // Changed from number to string (UUID)
  site_code?: string;
  site_name?: string;
  whatsapp_group_id: string;
  whatsapp_group_name?: string;
  channel_id?: string;
  channel_name?: string;
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

// --- Channels ---

/**
 * Get all WhatsApp channels
 */
export async function getChannels(): Promise<WhatsAppChannel[]> {
  const sql = `
    SELECT id, channel_name, api_token, is_active, created_at, updated_at
    FROM whatsapp_channels
    ORDER BY created_at ASC
  `;
  return query(sql);
}

/**
 * Create a new channel
 */
export async function createChannel(
  data: Partial<WhatsAppChannel>,
): Promise<WhatsAppChannel> {
  const sql = `
    INSERT INTO whatsapp_channels (channel_name, api_token, is_active, created_at, updated_at)
    VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING *
  `;
  const result = await queryOne<WhatsAppChannel>(sql, [
    data.channel_name,
    data.api_token ? encrypt(data.api_token) : null,
    data.is_active ?? true,
  ]);
  return result!;
}

/**
 * Update a channel
 */
export async function updateChannel(
  id: string,
  data: Partial<WhatsAppChannel>,
): Promise<WhatsAppChannel> {
  const setClauses: string[] = ["updated_at = CURRENT_TIMESTAMP"];
  const params: any[] = [];

  if (data.channel_name !== undefined) {
    params.push(data.channel_name);
    setClauses.push(`channel_name = $${params.length}`);
  }

  if (data.api_token !== undefined) {
    params.push(encrypt(data.api_token));
    setClauses.push(`api_token = $${params.length}`);
  }

  if (data.is_active !== undefined) {
    params.push(data.is_active);
    setClauses.push(`is_active = $${params.length}`);
  }

  params.push(id);
  const sql = `
    UPDATE whatsapp_channels
    SET ${setClauses.join(", ")}
    WHERE id = $${params.length}
    RETURNING *
  `;
  return queryOne<WhatsAppChannel>(sql, params) as Promise<WhatsAppChannel>;
}

/**
 * Delete a channel
 */
export async function deleteChannel(id: string): Promise<void> {
  const sql = `DELETE FROM whatsapp_channels WHERE id = $1`;
  await query(sql, [id]);
}

// --- Group Mappings ---

/**
 * Get WhatsApp group mappings with optional filters
 */
export async function getMappings(filters?: {
  whatsapp_group_id?: string;
  site_code?: string;
}): Promise<WhatsAppGroupMapping[]> {
  const hasFilters =
    filters && (filters.whatsapp_group_id || filters.site_code);

  if (!hasFilters) {
    const cacheKey = "whatsapp:mappings";
    return cached(
      cacheKey,
      async () => {
        const sql = `
          SELECT wm.id, wm.site_code, wm.whatsapp_group_id, wm.whatsapp_group_name, wm.channel_id, wm.is_active, wm.created_at, wm.updated_at,
                 COALESCE(wm.site_name, s.name) as site_name,
                 c.channel_name
          FROM whatsapp_group_mappings wm
          LEFT JOIN sites s ON wm.site_code = s.site_code
          LEFT JOIN whatsapp_channels c ON wm.channel_id = c.id
          ORDER BY site_name, wm.created_at DESC
        `;
        return query(sql);
      },
      CACHE_TTL,
    );
  }

  // Handle filtering (bypass cache)
  const whereClauses: string[] = [];
  const params: any[] = [];

  if (filters?.whatsapp_group_id) {
    params.push(filters.whatsapp_group_id);
    whereClauses.push(`wm.whatsapp_group_id = $${params.length}`);
  }

  if (filters?.site_code) {
    params.push(filters.site_code);
    whereClauses.push(`wm.site_code = $${params.length}`);
  }

  const sql = `
    SELECT wm.id, wm.site_code, wm.whatsapp_group_id, wm.whatsapp_group_name, wm.channel_id, wm.is_active, wm.created_at, wm.updated_at,
           COALESCE(wm.site_name, s.name) as site_name,
           c.channel_name
    FROM whatsapp_group_mappings wm
    LEFT JOIN sites s ON wm.site_code = s.site_code
    LEFT JOIN whatsapp_channels c ON wm.channel_id = c.id
    ${whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : ""}
    ORDER BY site_name, wm.created_at DESC
  `;

  return query(sql, params);
}

/**
 * Create a new group mapping
 */
export async function createMapping(
  data: Partial<WhatsAppGroupMapping>,
): Promise<WhatsAppGroupMapping> {
  const sql = `
    INSERT INTO whatsapp_group_mappings (site_code, whatsapp_group_id, whatsapp_group_name, channel_id, is_active, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING *
  `;
  const result = await queryOne<WhatsAppGroupMapping>(sql, [
    data.site_code,
    data.whatsapp_group_id,
    data.whatsapp_group_name,
    data.channel_id,
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

  if (data.channel_id !== undefined) {
    params.push(data.channel_id);
    setClauses.push(`channel_id = $${params.length}`);
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
 * Get a specific template by its key string
 */
export async function getTemplateByKey(
  template_key: string,
): Promise<WhatsAppTemplate | null> {
  const sql = `
    SELECT *
    FROM whatsapp_message_templates
    WHERE template_key = $1 AND (is_active = true OR is_active IS NULL)
  `;
  return queryOne<WhatsAppTemplate>(sql, [template_key]);
}

/**
 * Resolve the active WhatsApp token and group ID for a specific site
 */
export async function getActiveMappingWithToken(site_code: string): Promise<{
  whatsapp_group_id: string;
  whatsapp_group_name: string;
  api_token: string;
  channel_id: string;
} | null> {
  const sql = `
    SELECT wm.whatsapp_group_id, wm.whatsapp_group_name, c.api_token, c.id as channel_id
    FROM whatsapp_group_mappings wm
    JOIN whatsapp_channels c ON wm.channel_id = c.id
    WHERE wm.site_code = $1 AND wm.is_active = true AND c.is_active = true
    LIMIT 1
  `;
  const result = await queryOne<{
    whatsapp_group_id: string;
    whatsapp_group_name: string;
    api_token: string;
    channel_id: string;
  }>(sql, [site_code]);

  if (result && result.api_token) {
    result.api_token = decrypt(result.api_token);
  }

  return result;
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

/**
 * Create a new template
 */
export async function createTemplate(
  data: Partial<WhatsAppTemplate>,
): Promise<WhatsAppTemplate> {
  const sql = `
    INSERT INTO whatsapp_message_templates (
      template_name, template_key, template_content, 
      variables, is_active, created_by, updated_by
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7
    ) RETURNING *
  `;

  const params = [
    data.template_name || null,
    data.template_key,
    data.template_content,
    data.variables ? JSON.stringify(data.variables) : null,
    data.is_active !== undefined ? data.is_active : true,
    (data as any).created_by || "system",
    (data as any).created_by || "system",
  ];

  const result = await queryOne<WhatsAppTemplate>(sql, params);

  // Invalidate cache
  await cacheDel("whatsapp:templates");

  return result!;
}

/**
 * Delete a template
 */
export async function deleteTemplate(id: number | string): Promise<void> {
  const sql = `DELETE FROM whatsapp_message_templates WHERE id = $1`;
  await query(sql, [id]);

  // Invalidate cache
  await cacheDel("whatsapp:templates");
}

export default {
  getChannels,
  createChannel,
  updateChannel,
  deleteChannel,
  getMappings,
  createMapping,
  updateMapping,
  deleteMapping,
  bulkDeleteMappings,
  getTemplates,
  getTemplateByKey,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getActiveMappingWithToken,
};
