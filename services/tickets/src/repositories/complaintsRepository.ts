/**
 * Complaints/Tickets Repository
 *
 * Data access layer for complaints table.
 * Business logic (notifications) remains in the service layer.
 */

import { query, queryOne } from "@jouleops/shared";
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
  page?: number;
  limit?: number;
  status?: string | null;
  category?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  cursor?: string | null; // keyset cursor: "created_at,id" for deep pagination
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
    sortBy = "created_at",
    sortOrder = "desc",
  } = options;

  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (siteCode !== "all") {
    conditions.push(`c.site_code = $${paramIndex}`);
    params.push(siteCode);
    paramIndex++;
  }

  if (status && status !== "All") {
    conditions.push(`c.status = $${paramIndex}`);
    params.push(status);
    paramIndex++;
  }

  if (category) {
    conditions.push(`c.category = $${paramIndex}`);
    params.push(category);
    paramIndex++;
  }

  if (fromDate) {
    conditions.push(`c.created_at >= $${paramIndex}`);
    params.push(fromDate);
    paramIndex++;
  }

  if (toDate) {
    conditions.push(`c.created_at <= $${paramIndex}`);
    params.push(toDate);
    paramIndex++;
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderDirection = sortOrder === "asc" ? "ASC" : "DESC";

  // Keyset pagination: if cursor provided, use it instead of OFFSET
  const { cursor = null } = options;
  let cursorCondition = "";
  const cursorParams: any[] = [];

  if (cursor) {
    // cursor format: "created_at_iso,uuid"
    const [cursorDate, cursorId] = cursor.split(",");
    if (cursorDate && cursorId) {
      const op = sortOrder === "desc" ? "<" : ">";
      cursorCondition = `AND (c.created_at, c.id) ${op} ($${paramIndex}, $${paramIndex + 1})`;
      cursorParams.push(cursorDate, cursorId);
      paramIndex += 2;
    }
  }

  // Get total count (only when no cursor — caller already has total from first page)
  let total = 0;
  if (!cursor) {
    const countResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM complaints c ${whereClause}`,
      params,
    );
    total = parseInt(countResult?.count || "0", 10);
  }

  // Get paginated data
  const dataParams = [...params, ...cursorParams, limit];
  const offsetClause = cursor ? "" : `OFFSET $${paramIndex + 1}`;
  if (!cursor) {
    dataParams.push(offset);
  }

  const data = await query<Complaint>(
    `SELECT c.*, s.name as site_name
     FROM complaints c
     LEFT JOIN sites s ON c.site_code = s.site_code
     ${whereClause} 
     ${cursorCondition}
     ORDER BY c.${sortBy} ${orderDirection}, c.id ${orderDirection}
     LIMIT $${paramIndex}${cursor ? "" : ` ${offsetClause}`}`,
    dataParams,
  );

  // Build next cursor from last item
  const lastItem = data[data.length - 1];
  const nextCursor = lastItem
    ? `${new Date(lastItem.created_at).toISOString()},${lastItem.id}`
    : null;

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: total ? Math.ceil(total / limit) : 0,
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
