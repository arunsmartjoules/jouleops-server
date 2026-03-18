/**
 * Fieldproxy Integration Service
 *
 * Forwards complaint data to Fieldproxy sheets after creation.
 * Authenticates via Fieldproxy's Zapier API on every call.
 */

const FIELDPROXY_BASE = "https://webapi.fieldproxy.com/v3/zapier";

async function getAccessToken(): Promise<string> {
  const res = await fetch(`${FIELDPROXY_BASE}/generateApiKey`, {
    method: "POST",
    headers: {
      emailId: "arun.kumar@smartjoules.in",
      password: "uxA2PfRyUH2bNTW@3420",
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
  assigned_to?: string;
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
  if (complaint.title)            tableData.title             = complaint.title;
  if (complaint.status)           tableData.status            = complaint.status;
  if (complaint.location)         tableData.location          = complaint.location;
  if (complaint.area_asset)       tableData.location          = complaint.area_asset; // area_asset maps to location
  if (complaint.category)         tableData.category          = complaint.category;
  if (complaint.internal_remarks) tableData.internal_remarks  = complaint.internal_remarks;
  if (complaint.responded_at)     tableData.responded_at      = complaint.responded_at;
  if (complaint.resolved_at)      tableData.resolved_at       = complaint.resolved_at;
  if (complaint.assigned_to)      tableData.assigned_to       = complaint.assigned_to;

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
