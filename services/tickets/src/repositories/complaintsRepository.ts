/**
 * Complaints/Tickets Repository
 *
 * Data access layer for complaints table.
 * Business logic (notifications) remains in the service layer.
 */

import { query, queryOne, buildQuery } from "@jouleops/shared";
import type { FilterRule } from "@jouleops/shared";
import {
  cached,
  cacheDel as del,
  cacheInvalidate,
  CACHE_PREFIX,
  TTL,
} from "@jouleops/shared";

// Build cache key helper
const buildKey = (prefix: string, id: string) => `${prefix}${id}`;

// ============================================================================
// Types
// ============================================================================

export interface Complaint {
  id: string; // UUID in database
  ticket_no: string;
  site_code: string;
  site_name?: string;
  title: string;
  status: string;
  category?: string;
  location?: string;
  area_asset?: string;
  created_user?: string;
  message_id?: string;
  sender_id?: string;
  group_id?: string;
  internal_remarks?: string;
  customer_inputs?: string;
  notes?: string;
  contact_name?: string;
  contact_number?: string;
  current_temperature?: number;
  current_rh?: number;
  standard_temperature?: number;
  standard_rh?: number;
  spare_type?: string;
  spare_quantity?: number;
  start_datetime?: Date;
  end_datetime?: Date;
  responded_at?: Date;
  resolved_at?: Date;
  flag_incident: boolean;
  assigned_to?: string;
  escalation_source?: string;
  sub_ticket_id?: string;
  reason?: string;
  support_users?: string;
  support_users_name?: string;
  attachments?: string;
  remarks?: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateComplaintInput {
  ticket_no?: string;
  site_code: string;
  title: string;
  status?: string;
  category?: string;
  location?: string;
  area_asset?: string;
  created_user?: string;
  message_id?: string;
  sender_id?: string;
  group_id?: string;
  internal_remarks?: string;
  current_temperature?: number;
  current_rh?: number;
  flag_incident?: boolean;
  assigned_to?: string;
  support_users?: string;
}

export interface UpdateComplaintInput {
  title?: string;
  status?: string;
  category?: string;
  location?: string;
  area_asset?: string;
  assigned_to?: string;
  remarks?: string;
  internal_remarks?: string;
  resolved_at?: Date;
  end_datetime?: Date;
  reason?: string;
  support_users?: string;
}

export interface GetComplaintsOptions {
  page?: number | string;
  limit?: number | string;
  status?: string | null;
  category?: string | null;
  search?: string | null;
  filters?: FilterRule[] | string | null;
  fromDate?: string | null;
  toDate?: string | null;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  cursor?: string | null;
  ticket_no?: string | null;
  message_id?: string | null;
  group_id?: string | null;
  id?: string | null;
}

// ============================================================================
// Repository Functions
// ============================================================================

/**
 * Generate a unique ticket number for a site.
 * Format: {SITE_PREFIX}-{MMYY}-{SEQ} e.g. "NSK-0226-01"
 * Sequence resets per site per month.
 */
export async function generateTicketNo(siteCode: string): Promise<string> {
  const site = await queryOne<{ site_prefix: string | null }>(
    `SELECT site_prefix FROM sites WHERE site_code = $1`,
    [siteCode],
  );
  const prefix = site?.site_prefix?.trim() || "SITE";

  // 2. Current month/year (MM + YY)
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yy = String(now.getFullYear()).slice(-2);
  const monthYear = `${mm}${yy}`;

  // 3. Count existing tickets for this site in the current month
  const pattern = `${prefix}-${monthYear}-%`;
  const countResult = await queryOne<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt FROM complaints WHERE site_code = $1 AND ticket_no LIKE $2`,
    [siteCode, pattern],
  );
  const seq = parseInt(countResult?.cnt || "0", 10) + 1;
  const seqStr = String(seq).padStart(2, "0");

  return `${prefix}-${monthYear}-${seqStr}`;
}

/**
 * Create a new complaint
 */
export async function createComplaint(
  data: CreateComplaintInput,
): Promise<Complaint> {
  const columns = Object.keys(data).filter(
    (k) => data[k as keyof CreateComplaintInput] !== undefined,
  );
  const values = columns.map((k) => data[k as keyof CreateComplaintInput]);
  const placeholders = columns.map((_, i) => `$${i + 1}`);

  const sql = `
    INSERT INTO complaints (${columns.join(", ")})
    VALUES (${placeholders.join(", ")})
    RETURNING *
  `;

  const complaint = await queryOne<Complaint>(sql, values);

  if (!complaint) {
    throw new Error("Failed to create complaint");
  }

  // Invalidate stats cache for this site
  cacheInvalidate("complaint_stats:*").catch(() => {});

  return complaint;
}

/**
 * Get complaint by ID (UUID)
 */
export async function getComplaintById(id: string): Promise<Complaint | null> {
  const cacheKey = buildKey(CACHE_PREFIX.TICKET, id);

  return cached(
    cacheKey,
    async () => {
      return queryOne<Complaint>(
        `SELECT c.*, s.name as site_name
         FROM complaints c
         LEFT JOIN sites s ON c.site_code = s.site_code
         WHERE c.id = $1`,
        [id],
      );
    },
    TTL.SHORT,
  );
}

/**
 * Get complaint by ticket_no (human readable)
 */
export async function getComplaintByTicketNo(
  ticketNo: string,
): Promise<Complaint | null> {
  return queryOne<Complaint>(
    `SELECT c.*, s.name as site_name
     FROM complaints c
     LEFT JOIN sites s ON c.site_code = s.site_code
     WHERE c.ticket_no = $1`,
    [ticketNo],
  );
}

/**
 * Flexible get complaint - tries multiple ID fields
 */
export async function getComplaint(
  identifier: string,
): Promise<Complaint | null> {
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      identifier,
    );

  if (isUuid) {
    return getComplaintById(identifier);
  }

  // Try ticket_no
  return queryOne<Complaint>(`SELECT * FROM complaints WHERE ticket_no = $1`, [
    identifier,
  ]);
}

/**
 * Get complaint by message_id
 */
export async function getComplaintByMessageId(
  messageId: string,
): Promise<Complaint | null> {
  return queryOne<Complaint>(`SELECT * FROM complaints WHERE message_id = $1`, [
    messageId,
  ]);
}

/**
 * Get complaints by site with pagination and filtering
 */
export async function getComplaintsBySite(
  siteCode: string,
  options: GetComplaintsOptions = {},
): Promise<{
  data: Complaint[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  nextCursor?: string | null;
}> {
  const {
    page = 1,
    limit = 20,
    status = null,
    category = null,
    fromDate = null,
    toDate = null,
    search = null,
    filters: optFilters = null,
  } = options;

  // 1. Normalize filters
  const filters: FilterRule[] = [];
  if (optFilters) {
    if (typeof optFilters === "string") {
      try {
        filters.push(...JSON.parse(optFilters));
      } catch (e) {
        console.error("[COMPLAINTS-REPO] Failed to parse filters", e);
      }
    } else if (Array.isArray(optFilters)) {
      filters.push(...optFilters);
    }
  }

  // 2. Add specific filters
  if (siteCode !== "all") {
    filters.push({ fieldId: "site_code", operator: "=", value: siteCode });
  }
  if (status && status !== "All" && status !== "all") {
    filters.push({ fieldId: "status", operator: "=", value: status });
  }
  if (category && category !== "All" && category !== "all") {
    filters.push({ fieldId: "category", operator: "=", value: category });
  }
  if (fromDate) {
    filters.push({ fieldId: "created_at", operator: ">=", value: fromDate });
  }
  if (toDate) {
    filters.push({ fieldId: "created_at", operator: "<=", value: toDate });
  }

  // 3. Add explicit identifier filters
  if (options.ticket_no) {
    filters.push({
      fieldId: "ticket_no",
      operator: "=",
      value: options.ticket_no,
    });
  }
  if (options.message_id) {
    filters.push({
      fieldId: "message_id",
      operator: "=",
      value: options.message_id,
    });
  }
  if (options.group_id) {
    filters.push({
      fieldId: "group_id",
      operator: "=",
      value: options.group_id,
    });
  }
  if (options.id) {
    filters.push({ fieldId: "id", operator: "=", value: options.id });
  }

  // 3. Build Query using shared utility
  const { whereClause, orderClause, limitClause, values } = buildQuery(
    {
      ...options,
      search: search ?? undefined,
      filters: filters.length > 0 ? filters : undefined,
    },
    {
      tableAlias: "c",
      searchFields: [
        "ticket_no",
        "title",
        "site_code",
        "location",
        "area_asset",
        "assigned_to",
        "message_id",
        "group_id",
      ],
      allowedFields: [
        "id",
        "ticket_no",
        "site_code",
        "title",
        "status",
        "category",
        "location",
        "area_asset",
        "assigned_to",
        "message_id",
        "group_id",
        "created_at",
        "updated_at",
      ],
      defaultSort: "created_at",
      defaultSortOrder: "desc",
    },
  );

  // 4. Get Total Count (Skip limit/offset values which are the last two)
  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM complaints c ${whereClause}`,
    values.slice(0, -2),
  );
  const total = parseInt(countResult?.count || "0", 10);

  // 5. Get Paginated Data
  const data = await query<Complaint>(
    `SELECT c.*, s.name as site_name
     FROM complaints c
     LEFT JOIN sites s ON c.site_code = s.site_code
     ${whereClause}
     ${orderClause}
     ${limitClause}`,
    values,
  );

  // 6. Next Cursor (optional for keyset pagination support)
  const lastItem = data[data.length - 1];
  const nextCursor = lastItem
    ? `${new Date(lastItem.created_at).toISOString()},${lastItem.id}`
    : null;

  const numPage = Number(page);
  const numLimit = Number(limit);

  return {
    data,
    pagination: {
      page: numPage,
      limit: numLimit,
      total,
      totalPages: Math.ceil(total / numLimit),
    },
    nextCursor,
  };
}

/**
 * Get recent complaints by group_id
 */
export async function getRecentComplaintsByGroup(
  groupId: string,
  limit: number = 5,
): Promise<Complaint[]> {
  return query<Complaint>(
    `SELECT c.*, s.name as site_name
     FROM complaints c
     LEFT JOIN sites s ON c.site_code = s.site_code
     WHERE c.group_id = $1
     ORDER BY c.created_at DESC
     LIMIT $2`,
    [groupId, limit],
  );
}

/**
 * Update a complaint
 */
export async function updateComplaint(
  id: string,
  updateData: UpdateComplaintInput,
): Promise<Complaint> {
  const entries = Object.entries(updateData).filter(
    ([, value]) => value !== undefined,
  );

  if (entries.length === 0) {
    throw new Error("No fields to update");
  }

  const setClauses = entries.map(([key], i) => `${key} = $${i + 1}`);
  const values = entries.map(([, value]) => value);

  const sql = `
    UPDATE complaints
    SET ${setClauses.join(", ")}, updated_at = NOW()
    WHERE id = $${entries.length + 1}
    RETURNING *
  `;

  const complaint = await queryOne<Complaint>(sql, [...values, id]);

  if (!complaint) {
    throw new Error("Complaint not found");
  }

  // Invalidate caches
  await del(buildKey(CACHE_PREFIX.TICKET, complaint.id));
  cacheInvalidate("complaint_stats:*").catch(() => {});

  return complaint;
}

/**
 * Update complaint status with timestamps
 */
export async function updateComplaintStatus(
  id: string,
  status: string,
  remarks?: string,
): Promise<Complaint> {
  const updates: any = { status };

  if (remarks) {
    updates.internal_remarks = remarks;
    updates.remarks = remarks;
  }

  if (status === "Resolved") {
    updates.resolved_at = new Date();
  } else if (status === "Closed") {
    updates.closed_at = new Date();
  }

  return updateComplaint(id, updates);
}

/**
 * Delete a complaint - uses flexible ID lookup
 */
export async function deleteComplaint(identifier: string): Promise<boolean> {
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      identifier,
    );

  if (isUuid) {
    const deleted = await queryOne<{ id: string }>(
      `DELETE FROM complaints WHERE id = $1 RETURNING id`,
      [identifier],
    );
    if (deleted) {
      await del(buildKey(CACHE_PREFIX.TICKET, identifier));
      return true;
    }
  }

  // Try ticket_no
  const byTicketNo = await queryOne<{ id: number }>(
    `DELETE FROM complaints WHERE ticket_no = $1 RETURNING id`,
    [identifier],
  );

  if (byTicketNo) {
    await del(buildKey(CACHE_PREFIX.TICKET, identifier));
    return true;
  }

  return false;
}

/**
 * Get complaint statistics
 * Uses SQL GROUP BY + cache-aside (60s TTL)
 */
export async function getComplaintStats(siteCode: string): Promise<{
  total: number;
  byStatus: Record<string, number>;
  byCategory: Record<string, number>;
}> {
  const cacheKey = `complaint_stats:${siteCode}`;

  return cached(
    cacheKey,
    async () => {
      // Build WHERE clause with pre-resolved site_code
      let whereClause = "";
      const params: any[] = [];

      if (siteCode !== "all") {
        whereClause = `WHERE site_code = $1`;
        params.push(siteCode);
      }

      // Run all three queries in parallel
      const [countResult, statusRows, categoryRows] = await Promise.all([
        queryOne<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt FROM complaints ${whereClause}`,
          params,
        ),
        query<{ status: string; cnt: string }>(
          `SELECT status, COUNT(*)::text AS cnt FROM complaints ${whereClause} GROUP BY status`,
          params,
        ),
        query<{ category: string; cnt: string }>(
          `SELECT category, COUNT(*)::text AS cnt FROM complaints ${whereClause} GROUP BY category`,
          params,
        ),
      ]);

      const byStatus: Record<string, number> = {};
      statusRows.forEach((r) => {
        byStatus[r.status] = parseInt(r.cnt, 10);
      });

      const byCategory: Record<string, number> = {};
      categoryRows.forEach((r) => {
        byCategory[r.category] = parseInt(r.cnt, 10);
      });

      return {
        total: parseInt(countResult?.cnt || "0", 10),
        byStatus,
        byCategory,
      };
    },
    TTL.SHORT,
  ); // 60 second TTL
}

export default {
  generateTicketNo,
  createComplaint,
  getComplaintById,
  getComplaintByTicketNo,
  getComplaint,
  getComplaintByMessageId,
  getComplaintsBySite,
  getRecentComplaintsByGroup,
  updateComplaint,
  updateComplaintStatus,
  deleteComplaint,
  getComplaintStats,
};
