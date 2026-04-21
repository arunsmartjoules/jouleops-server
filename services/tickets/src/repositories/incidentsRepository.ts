import { buildQuery, cached, CACHE_PREFIX, cacheDel, cacheInvalidate, query, queryOne, TTL } from "@jouleops/shared";
import type { FilterRule } from "@jouleops/shared";

export type IncidentStatus = "Open" | "Inprogress" | "Resolved";
export type IncidentRcaStatus = "Open" | "RCA Under Review" | "RCA Submitted";

export interface Incident {
  id: string;
  incident_id: string;
  source: "Incident" | "Tickets";
  ticket_id?: string | null;
  site_code: string;
  asset_location?: string | null;
  raised_by?: string | null;
  incident_created_time?: Date | null;
  incident_updated_time?: Date | null;
  incident_resolved_time?: Date | null;
  fault_symptom: string;
  fault_type: string;
  severity: string;
  operating_condition?: string | null;
  immediate_action_taken?: string | null;
  attachments?: any[] | null;
  rca_attachments?: any[] | null;
  remarks?: string | null;
  status: IncidentStatus;
  rca_status: IncidentRcaStatus;
  assigned_by?: string | null;
  assignment_type?: string | null;
  vendor_tagged?: string | null;
  rca_maker?: string | null;
  rca_checker?: string | null;
  assigned_to?: string[] | string | null;
  /** Mobile-generated UUID for dedupe on offline queue replay / double-submit */
  client_request_id?: string | null;
  created_at: Date;
  updated_at: Date;
}

const INCIDENT_QUERY_CONFIG = {
  tableAlias: "i",
  searchFields: ["incident_id", "fault_symptom", "asset_location", "site_code", "raised_by"],
  allowedFields: [
    "id",
    "incident_id",
    "source",
    "site_code",
    "status",
    "rca_status",
    "severity",
    "fault_type",
    "raised_by",
    "created_at",
    "updated_at",
  ],
  defaultSort: "created_at",
  defaultSortOrder: "desc" as const,
};

export async function generateIncidentId(): Promise<string> {
  const result = await queryOne<{ cnt: string }>("SELECT COUNT(*)::text AS cnt FROM incidents");
  const next = parseInt(result?.cnt || "0", 10) + 1;
  return `incident_id_${String(next).padStart(3, "0")}`;
}

export async function createIncident(data: Partial<Incident>): Promise<Incident> {
  const crid =
    typeof (data as any).client_request_id === "string" && (data as any).client_request_id.trim()
      ? String((data as any).client_request_id).trim()
      : null;
  if (crid) {
    const dup = await queryOne<Incident>(
      "SELECT * FROM incidents WHERE client_request_id = $1 LIMIT 1",
      [crid],
    );
    if (dup) return dup;
  }

  const incident_id = data.incident_id || (await generateIncidentId());
  const now = new Date();
  const payload = {
    ...data,
    incident_id,
    status: data.status || "Open",
    rca_status: data.rca_status || "Open",
    incident_created_time: data.incident_created_time || now,
  };

  const columns = Object.keys(payload).filter((k) => (payload as any)[k] !== undefined);
  const values = columns.map((k) => (payload as any)[k]);
  const placeholders = columns.map((_, i) => `$${i + 1}`);

  const incident = await queryOne<Incident>(
    `INSERT INTO incidents (${columns.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
    values,
  );
  if (!incident) throw new Error("Failed to create incident");
  cacheInvalidate("incident_stats:*").catch(() => {});
  return incident;
}

export async function listIncidents(
  options: {
    page?: string | number;
    limit?: string | number;
    site_code?: string;
    status?: string;
    rca_status?: string;
    fromDate?: string;
    toDate?: string;
    search?: string;
    filters?: FilterRule[] | string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  } = {},
) {
  const { page = 1, limit = 20, site_code, status, rca_status, fromDate, toDate } = options;
  const filters: FilterRule[] = [];
  if (site_code && site_code !== "all") filters.push({ fieldId: "site_code", operator: "=", value: site_code });
  if (status && status !== "All") filters.push({ fieldId: "status", operator: "=", value: status });
  if (rca_status && rca_status !== "All") filters.push({ fieldId: "rca_status", operator: "=", value: rca_status });
  if (fromDate) filters.push({ fieldId: "incident_created_time", operator: ">=", value: fromDate });
  if (toDate) filters.push({ fieldId: "incident_created_time", operator: "<=", value: toDate });
  if (options.filters) {
    if (typeof options.filters === "string") {
      try {
        filters.push(...JSON.parse(options.filters));
      } catch {}
    } else {
      filters.push(...options.filters);
    }
  }

  const { whereClause, orderClause, limitClause, values } = buildQuery(
    { ...options, page, limit, filters: filters.length ? filters : undefined },
    INCIDENT_QUERY_CONFIG,
  );
  const countValues = values.slice(0, -2);
  const countRes = await queryOne<{ count: string }>(`SELECT COUNT(*) AS count FROM incidents i ${whereClause}`, countValues);
  const total = parseInt(countRes?.count || "0", 10);
  const data = await query<Incident>(`SELECT i.* FROM incidents i ${whereClause} ${orderClause} ${limitClause}`, values);
  return {
    data,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit)),
    },
  };
}

export async function getIncidentById(id: string): Promise<Incident | null> {
  const key = `${CACHE_PREFIX.TICKET}incident:${id}`;
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      id || "",
    );
  return cached(
    key,
    async () =>
      isUuid
        ? queryOne<Incident>("SELECT * FROM incidents WHERE id = $1", [id])
        : queryOne<Incident>("SELECT * FROM incidents WHERE incident_id = $1", [id]),
    TTL.SHORT,
  );
}

export async function updateIncident(id: string, updateData: Partial<Incident>): Promise<Incident> {
  const entries = Object.entries(updateData).filter(([, v]) => v !== undefined);
  if (!entries.length) throw new Error("No fields to update");
  const setClause = entries.map(([k], i) => `${k} = $${i + 1}`).join(", ");
  const values = entries.map(([, v]) => v);
  const incident = await queryOne<Incident>(
    `UPDATE incidents SET ${setClause}, updated_at = NOW() WHERE id = $${entries.length + 1} RETURNING *`,
    [...values, id],
  );
  if (!incident) throw new Error("Incident not found");
  await cacheDel(`${CACHE_PREFIX.TICKET}incident:${incident.id}`);
  cacheInvalidate("incident_stats:*").catch(() => {});
  return incident;
}

export async function updateIncidentStatus(
  id: string,
  status: IncidentStatus,
  remarks?: string | null,
  options?: {
    incident_updated_time?: Date | null;
    incident_resolved_time?: Date | null;
    assigned_to?: string[] | string | null;
    assigned_by?: string | null;
  },
) {
  const existing = await getIncidentById(id);
  if (!existing) throw new Error("Incident not found");
  const patch: Partial<Incident> = { status };
  if (status === "Inprogress") {
    patch.incident_updated_time = options?.incident_updated_time || new Date();
    if (options?.assigned_to !== undefined) patch.assigned_to = options.assigned_to;
    if (options?.assigned_by !== undefined) patch.assigned_by = options.assigned_by;
  }
  if (status === "Resolved") {
    patch.incident_resolved_time = options?.incident_resolved_time || new Date();
    patch.remarks = remarks || existing.remarks || null;
    if (options?.assigned_to !== undefined) patch.assigned_to = options.assigned_to;
    if (options?.assigned_by !== undefined) patch.assigned_by = options.assigned_by;
  }
  return updateIncident(existing.id, patch);
}

export async function updateIncidentRcaStatus(id: string, rca_status: IncidentRcaStatus) {
  const existing = await getIncidentById(id);
  if (!existing) throw new Error("Incident not found");
  return updateIncident(existing.id, { rca_status });
}

export async function appendIncidentAttachment(id: string, attachment: any) {
  const existing = await getIncidentById(id);
  if (!existing) throw new Error("Incident not found");
  const current = Array.isArray(existing.attachments) ? existing.attachments : [];
  return updateIncident(existing.id, { attachments: [...current, attachment] });
}

export async function getIncidentStats(site_code?: string) {
  const key = `incident_stats:${site_code || "all"}`;
  return cached(
    key,
    async () => {
      const where = site_code && site_code !== "all" ? "WHERE site_code = $1" : "";
      const values = where ? [site_code] : [];
      const rows = await query<{ status: string; cnt: string }>(
        `SELECT status, COUNT(*)::text AS cnt FROM incidents ${where} GROUP BY status`,
        values,
      );
      const byStatus: Record<string, number> = {};
      rows.forEach((r) => {
        byStatus[r.status] = parseInt(r.cnt, 10);
      });
      return {
        total: rows.reduce((acc, r) => acc + parseInt(r.cnt, 10), 0),
        byStatus,
      };
    },
    TTL.SHORT,
  );
}

export default {
  generateIncidentId,
  createIncident,
  listIncidents,
  getIncidentById,
  updateIncident,
  updateIncidentStatus,
  updateIncidentRcaStatus,
  appendIncidentAttachment,
  getIncidentStats,
};
