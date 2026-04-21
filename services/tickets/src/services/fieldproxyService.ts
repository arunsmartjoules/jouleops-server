/**
 * Fieldproxy Integration Service
 *
 * Forwards complaint data to Fieldproxy sheets after creation.
 * Authenticates via Fieldproxy's Zapier API on every call.
 */

const FIELDPROXY_BASE = "https://webapi.fieldproxy.com/v3/zapier";

async function getAccessToken(): Promise<string> {
  const emailId = process.env.FIELDPROXY_EMAIL?.trim();
  const password = process.env.FIELDPROXY_PASSWORD?.trim();
  if (!emailId || !password) {
    throw new Error(
      "Fieldproxy auth: set FIELDPROXY_EMAIL and FIELDPROXY_PASSWORD in the environment",
    );
  }

  const res = await fetch(`${FIELDPROXY_BASE}/generateApiKey`, {
    method: "POST",
    headers: {
      emailId,
      password,
    },
  });

  if (!res.ok) {
    throw new Error(`Fieldproxy auth failed: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as Record<string, any>;

  // Token may be nested under various keys — try common ones
  const token =
    json.token ??
    json.api_key ??
    json.apiKey ??
    json.access_token ??
    json.data?.token ??
    json.data?.api_key ??
    json.data?.apiKey ??
    json.data?.access_token;

  if (!token) {
    throw new Error(
      `Fieldproxy auth: could not find token in response: ${JSON.stringify(json)}`,
    );
  }

  return String(token);
}

export interface ComplaintForwardPayload {
  site_code?: string;
  title?: string;
  location?: string;
  status?: string;
  sender_id?: string;
  message_id?: string;
  group_id?: string;
  ticket_no?: string;
  created_user?: string;
  // Update fields
  area_asset?: string;
  category?: string;
  internal_remarks?: string;
  responded_at?: string;
  resolved_at?: string;
  before_temp?: number | null;
  after_temp?: number | null;
  assigned_to?: string;
}

export interface IncidentForwardPayload {
  incident_id?: string | null;
  source?: string | null;
  site?: string | null;
  asset_location?: string | null;
  raised_by?: string | null;
  timestamp?: string | null;
  fault_symptom?: string | null;
  fault_type?: string | null;
  severity?: string | null;
  operating_condition?: string | null;
  immediate_action_taken?: string | null;
  attachments?: unknown;
  remarks?: string | null;
  status?: string | null;
  assigned_by?: string | null;
  assignment_type?: string | null;
  vendor_tagged?: string | null;
  rca_status?: string | null;
  rca_maker?: string | null;
  rca_checker?: string | null;
  assigned_to?: string | null;
  incident_created_time?: string | null;
  incident_updated_time?: string | null;
  incident_resolved_time?: string | null;
  rca_attachments?: unknown;
}

export async function forwardComplaintToFieldproxy(
  complaint: ComplaintForwardPayload,
): Promise<any> {
  const token = await getAccessToken();

  const body = {
    sheetId: "complaints",
    sheetName: "complaints",
    tableData: {
      site_id: complaint.site_code ?? null,
      title: complaint.title ?? null,
      location: complaint.location ?? null,
      area_asset: complaint.area_asset ?? null,
      category: complaint.category ?? null,
      status: complaint.status ?? null,
      sender_id: complaint.sender_id ?? null,
      message_id: complaint.message_id ?? null,
      group_id: complaint.group_id ?? null,
      ticket_no: complaint.ticket_no ?? null,
      created_user: complaint.created_user ?? null,
    },
  };

  const res = await fetch(`${FIELDPROXY_BASE}/sheetsRow`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": token,
    },
    body: JSON.stringify(body),
  });

  const responseData = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      `Fieldproxy sheetsRow failed: ${res.status} ${res.statusText} — ${JSON.stringify(responseData)}`,
    );
  }

  return responseData;
}

/**
 * Gets the Fieldproxy internal row_id by searching for ticket_no
 */
async function getRowIdByTicketNo(
  ticketNo: string,
  token: string,
): Promise<{ id: string | null; response: any }> {
  // Use the format verified by user in Postman (no extra double quotes)
  const whereClause = `ticket_no='${ticketNo}'`;
  const url = `${FIELDPROXY_BASE}/getFilteredSheetData?sheet_id=complaints&where_clause=${encodeURIComponent(whereClause)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "x-api-key": token,
    },
  });

  const responseBody = (await res.json().catch(() => ({}))) as any;

  if (!res.ok) {
    throw new Error(
      `Fieldproxy getFilteredSheetData failed: ${res.status} — ${JSON.stringify(responseBody)}`,
    );
  }

  const data = Array.isArray(responseBody)
    ? responseBody[0]?.data
    : responseBody.data;

  if (Array.isArray(data) && data.length > 0) {
    return { id: String(data[0].id), response: responseBody };
  }

  return { id: null, response: responseBody };
}

/**
 * Updates a ticket in Fieldproxy.
 * Maps: status, area_asset (→ location), category, internal_remarks,
 *       responded_at, resolved_at, assigned_to, title, location
 */
export async function updateComplaintInFieldproxy(
  ticketNo: string,
  complaint: Partial<ComplaintForwardPayload>,
): Promise<{ lookup: any; update?: any; error?: string }> {
  const token = await getAccessToken();

  // 1. Get rowId
  const { id: rowId, response: lookupResponse } = await getRowIdByTicketNo(
    ticketNo,
    token,
  );

  if (!rowId) {
    console.warn(
      `[FIELDPROXY] Could not find row for ticket_no: ${ticketNo}. Skipping update.`,
    );
    return { lookup: lookupResponse, error: "Row not found in Fieldproxy" };
  }

  // 2. Prepare payload — map our fields to Fieldproxy tableData keys
  const tableData: Record<string, any> = {};
  if (complaint.title !== undefined)            tableData.title             = complaint.title;
  if (complaint.status !== undefined)           tableData.status            = complaint.status;
  if (complaint.location !== undefined)         tableData.location          = complaint.location;
  if (complaint.area_asset !== undefined)       tableData.area_asset        = complaint.area_asset;
  if (complaint.category !== undefined)         tableData.category          = complaint.category;
  if (complaint.internal_remarks !== undefined) tableData.internal_remarks  = complaint.internal_remarks;
  if (complaint.responded_at !== undefined)     tableData.responded_at      = complaint.responded_at;
  if (complaint.resolved_at !== undefined)      tableData.resolved_at       = complaint.resolved_at;
  if (complaint.before_temp !== undefined)      tableData.before_temp       = complaint.before_temp;
  if (complaint.after_temp !== undefined)       tableData.after_temp        = complaint.after_temp;
  if (complaint.assigned_to !== undefined)      tableData.assigned_to       = complaint.assigned_to;

  if (Object.keys(tableData).length === 0) {
    return { lookup: lookupResponse, error: "No fields to update" };
  }

  const body = {
    rowId,
    sheetId: "complaints",
    tableData,
  };

  const res = await fetch(`${FIELDPROXY_BASE}/updateRows`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": token,
    },
    body: JSON.stringify(body),
  });

  const updateResponse = (await res.json().catch(() => ({}))) as any;

  if (!res.ok) {
    throw new Error(
      `Fieldproxy updateRows failed: ${res.status} ${res.statusText} — ${JSON.stringify(updateResponse)}`,
    );
  }

  return { lookup: lookupResponse, update: updateResponse };
}

export async function forwardIncidentToFieldproxy(
  incident: IncidentForwardPayload,
): Promise<any> {
  const token = await getAccessToken();
  const body = {
    sheetId: "incident_master",
    sheetName: "incident_master",
    tableData: {
      incident_id: incident.incident_id ?? null,
      source: incident.source ?? null,
      site: incident.site ?? null,
      asset_location: incident.asset_location ?? null,
      raised_by: incident.raised_by ?? null,
      timestamp: incident.timestamp ?? null,
      fault_symptom: incident.fault_symptom ?? null,
      fault_type: incident.fault_type ?? null,
      severity: incident.severity ?? null,
      operating_condition: incident.operating_condition ?? null,
      immediate_action_taken: incident.immediate_action_taken ?? null,
      attachments: incident.attachments ?? null,
      remarks: incident.remarks ?? null,
      status: incident.status ?? null,
      assigned_by: incident.assigned_by ?? null,
      assignment_type: incident.assignment_type ?? null,
      vendor_tagged: incident.vendor_tagged ?? null,
      rca_status: incident.rca_status ?? null,
      rca_maker: incident.rca_maker ?? null,
      rca_checker: incident.rca_checker ?? null,
      assigned_to: incident.assigned_to ?? null,
      incident_created_time: incident.incident_created_time ?? null,
      incident_updated_time: incident.incident_updated_time ?? null,
      incident_resolved_time: incident.incident_resolved_time ?? null,
      rca_attachments: incident.rca_attachments ?? null,
    },
  };

  const res = await fetch(`${FIELDPROXY_BASE}/sheetsRow`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": token,
    },
    body: JSON.stringify(body),
  });

  const responseData = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `Fieldproxy incident sheetsRow failed: ${res.status} ${res.statusText} — ${JSON.stringify(responseData)}`,
    );
  }
  return responseData;
}

async function getRowIdByIncidentId(
  incidentId: string,
  token: string,
): Promise<{ id: string | null; response: any }> {
  const whereClause = `incident_id='${incidentId}'`;
  const url = `${FIELDPROXY_BASE}/getFilteredSheetData?sheet_id=incident_master&where_clause=${encodeURIComponent(whereClause)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "x-api-key": token,
    },
  });
  const responseBody = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    throw new Error(
      `Fieldproxy incident getFilteredSheetData failed: ${res.status} — ${JSON.stringify(responseBody)}`,
    );
  }
  const data = Array.isArray(responseBody) ? responseBody[0]?.data : responseBody.data;
  if (Array.isArray(data) && data.length > 0) {
    return { id: String(data[0].id), response: responseBody };
  }
  return { id: null, response: responseBody };
}

export async function updateIncidentInFieldproxy(
  incidentId: string,
  incident: Partial<IncidentForwardPayload>,
): Promise<{ lookup: any; update?: any; error?: string }> {
  const token = await getAccessToken();
  const { id: rowId, response: lookupResponse } = await getRowIdByIncidentId(incidentId, token);
  if (!rowId) {
    return { lookup: lookupResponse, error: "Row not found in Fieldproxy" };
  }

  const tableData: Record<string, any> = {};
  if (incident.source !== undefined) tableData.source = incident.source;
  if (incident.site !== undefined) tableData.site = incident.site;
  if (incident.asset_location !== undefined) tableData.asset_location = incident.asset_location;
  if (incident.raised_by !== undefined) tableData.raised_by = incident.raised_by;
  if (incident.timestamp !== undefined) tableData.timestamp = incident.timestamp;
  if (incident.fault_symptom !== undefined) tableData.fault_symptom = incident.fault_symptom;
  if (incident.fault_type !== undefined) tableData.fault_type = incident.fault_type;
  if (incident.severity !== undefined) tableData.severity = incident.severity;
  if (incident.operating_condition !== undefined) tableData.operating_condition = incident.operating_condition;
  if (incident.immediate_action_taken !== undefined) tableData.immediate_action_taken = incident.immediate_action_taken;
  if (incident.attachments !== undefined) tableData.attachments = incident.attachments;
  if (incident.remarks !== undefined) tableData.remarks = incident.remarks;
  if (incident.status !== undefined) tableData.status = incident.status;
  if (incident.assigned_by !== undefined) tableData.assigned_by = incident.assigned_by;
  if (incident.assignment_type !== undefined) tableData.assignment_type = incident.assignment_type;
  if (incident.vendor_tagged !== undefined) tableData.vendor_tagged = incident.vendor_tagged;
  if (incident.rca_status !== undefined) tableData.rca_status = incident.rca_status;
  if (incident.rca_maker !== undefined) tableData.rca_maker = incident.rca_maker;
  if (incident.rca_checker !== undefined) tableData.rca_checker = incident.rca_checker;
  if (incident.assigned_to !== undefined) tableData.assigned_to = incident.assigned_to;
  if (incident.incident_created_time !== undefined) tableData.incident_created_time = incident.incident_created_time;
  if (incident.incident_updated_time !== undefined) tableData.incident_updated_time = incident.incident_updated_time;
  if (incident.incident_resolved_time !== undefined) tableData.incident_resolved_time = incident.incident_resolved_time;
  if (incident.rca_attachments !== undefined) tableData.rca_attachments = incident.rca_attachments;

  if (Object.keys(tableData).length === 0) {
    return { lookup: lookupResponse, error: "No fields to update" };
  }

  const body = {
    rowId,
    sheetId: "incident_master",
    tableData,
  };
  const res = await fetch(`${FIELDPROXY_BASE}/updateRows`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": token,
    },
    body: JSON.stringify(body),
  });
  const updateResponse = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    throw new Error(
      `Fieldproxy incident updateRows failed: ${res.status} ${res.statusText} — ${JSON.stringify(updateResponse)}`,
    );
  }
  return { lookup: lookupResponse, update: updateResponse };
}
