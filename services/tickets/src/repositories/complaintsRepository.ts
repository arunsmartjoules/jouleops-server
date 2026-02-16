/**
 * Complaints/Tickets Repository
 *
 * Data access layer for complaints table.
 * Business logic (notifications) remains in the service layer.
 */

import { query, queryOne } from "@jouleops/shared";
import { cached, cacheDel as del, CACHE_PREFIX, TTL } from "@jouleops/shared";

// Build cache key helper
const buildKey = (prefix: string, id: string) => `${prefix}${id}`;

// ============================================================================
// Types
// ============================================================================

export interface Complaint {
  id: string; // UUID in database
  ticket_no: string;
  site_id: string;
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
  ticket_no: string;
  site_id: string;
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
}

// ============================================================================
// Repository Functions
// ============================================================================

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
      return queryOne<Complaint>(`SELECT * FROM complaints WHERE id = $1`, [
        id,
      ]);
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
  return queryOne<Complaint>(`SELECT * FROM complaints WHERE ticket_no = $1`, [
    ticketNo,
  ]);
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
  siteId: string,
  options: GetComplaintsOptions = {},
): Promise<{
  data: Complaint[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
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

  if (siteId !== "all") {
    conditions.push(
      `(site_id = $${paramIndex} OR site_id IN (SELECT site_code FROM sites WHERE site_id = $${paramIndex}))`,
    );
    params.push(siteId);
    paramIndex++;
  }

  if (status && status !== "All") {
    conditions.push(`status = $${paramIndex}`);
    params.push(status);
    paramIndex++;
  }

  if (category) {
    conditions.push(`category = $${paramIndex}`);
    params.push(category);
    paramIndex++;
  }

  if (fromDate) {
    conditions.push(`created_at >= $${paramIndex}`);
    params.push(fromDate);
    paramIndex++;
  }

  if (toDate) {
    conditions.push(`created_at <= $${paramIndex}`);
    params.push(toDate);
    paramIndex++;
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderDirection = sortOrder === "asc" ? "ASC" : "DESC";

  // Get total count
  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM complaints ${whereClause}`,
    params,
  );
  const total = parseInt(countResult?.count || "0", 10);

  // Get paginated data
  const dataParams = [...params, limit, offset];
  const data = await query<Complaint>(
    `SELECT * FROM complaints ${whereClause}
     ORDER BY ${sortBy} ${orderDirection}
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    dataParams,
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
 * Get recent complaints by group_id
 */
export async function getRecentComplaintsByGroup(
  groupId: string,
  limit: number = 5,
): Promise<Complaint[]> {
  return query<Complaint>(
    `SELECT * FROM complaints
     WHERE group_id = $1
     ORDER BY created_at DESC
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

  // Invalidate cache
  await del(buildKey(CACHE_PREFIX.TICKET, complaint.id));

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
 */
export async function getComplaintStats(siteId: string): Promise<{
  total: number;
  byStatus: Record<string, number>;
  byCategory: Record<string, number>;
}> {
  let sql = `SELECT status, category FROM complaints`;
  const params: any[] = [];

  if (siteId !== "all") {
    sql += ` WHERE (site_id = $1 OR site_id IN (SELECT site_code FROM sites WHERE site_id = $1))`;
    params.push(siteId);
  }

  const data = await query<{ status: string; category: string }>(sql, params);

  const stats = {
    total: data.length,
    byStatus: {} as Record<string, number>,
    byCategory: {} as Record<string, number>,
  };

  data.forEach((complaint) => {
    stats.byStatus[complaint.status] =
      (stats.byStatus[complaint.status] || 0) + 1;
    stats.byCategory[complaint.category] =
      (stats.byCategory[complaint.category] || 0) + 1;
  });

  return stats;
}

export default {
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
