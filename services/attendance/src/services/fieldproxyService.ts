/**
 * Fieldproxy Integration Service for Attendance
 *
 * Forwards punch-in and punch-out data to Fieldproxy sheets.
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

export interface PunchRecordPayload {
  user_id: string; // Employee code matching DB user_id
  shift_id?: string | null;
  site_id?: string | null; // site_code
  punch_in: string; // ISO date string
  punch_out?: string | null; // ISO date string
  location?: string | null; // Name of location
  overtime_flag?: boolean | null;
  punchinlocation?: [string, string] | null; // [lng, lat] strings
  punchoutlocation?: [string, string] | null; // [lng, lat] strings
  punch_intimestamp?: string | null;
  punch_outtimestamp?: string | null;
  delete?: boolean;
  deletedAt?: string | null;
  sync?: boolean;
  lastSync?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

/**
 * Fetches the latest punch records to determine the next sequential punch_id
 */
async function getNextPunchId(token: string): Promise<number> {
  const url = `${FIELDPROXY_BASE}/getFilteredSheetData?sheet_id=punch_records&page=1&per_page=10`;
  const res = await fetch(url, {
    method: "GET",
    headers: { "x-api-key": token },
  });

  const responseBody = (await res.json().catch(() => ({}))) as any;
  const data = Array.isArray(responseBody)
    ? responseBody[0]?.data
    : responseBody.data;

  if (Array.isArray(data) && data.length > 0) {
    const maxId = Math.max(
      ...data.map((row: any) => parseInt(row.punch_id, 10) || 0),
    );
    return maxId + 1;
  }

  return 1; // fallback if no records exist
}

export async function forwardPunchInToFieldproxy(log: any): Promise<any> {
  const token = await getAccessToken();

  // Get next sequential punch_id
  const nextPunchId = await getNextPunchId(token);

  const punchInTime = new Date(log.check_in_time).toISOString();
  let punchOutTime = null;
  if (log.check_out_time) {
    punchOutTime = new Date(log.check_out_time).toISOString();
  }

  const punchinlocation =
    log.check_in_longitude && log.check_in_latitude
      ? [String(log.check_in_longitude), String(log.check_in_latitude)]
      : null;

  const punchoutlocation =
    log.check_out_longitude && log.check_out_latitude
      ? [String(log.check_out_longitude), String(log.check_out_latitude)]
      : null;

  // Determine shift based on IST hour if not provided
  let shiftId = log.shift_id;
  if (!shiftId) {
    const istHour = new Date(log.check_in_time).toLocaleString("en-US", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      hour12: false,
    });
    const hour = parseInt(istHour, 10);
    if (hour >= 6 && hour < 14) shiftId = "I";
    else if (hour >= 14 && hour < 22) shiftId = "II";
    else shiftId = "III";
  }

  const body = {
    sheetId: "punch_records",
    sheetName: "punch_records",
    tableData: {
      punch_id: nextPunchId,
      user_id: log.user_id,
      shift_id: shiftId,
      site_id: log.site_code || "WFH",
      punch_in: punchInTime,
      punch_out: punchOutTime || null,
      location: log.check_in_address || "",
      punchinlocation: punchinlocation,
      punchoutlocation: punchoutlocation,
      punch_intimestamp: punchInTime,
      punch_outtimestamp: punchOutTime || null,
      createdAt: punchInTime,
      updatedAt: punchInTime,
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
      `Fieldproxy sheetsRow failed for punch_in: ${res.status} ${res.statusText} — ${JSON.stringify(responseData)}`,
    );
  }

  return { response: responseData, punch_id: nextPunchId };
}

/**
 * Gets the Fieldproxy internal row_id by searching for the exact punch in time
 */
async function getRowIdByUserAndPunchIn(
  userId: string,
  punchInTimeISO: string,
  token: string,
): Promise<{ id: string | null; response: any }> {
  // Try to find the user's latest record or matching record
  const whereClause = `user_id='${userId}'`;
  const url = `${FIELDPROXY_BASE}/getFilteredSheetData?sheet_id=punch_records&where_clause=${encodeURIComponent(whereClause)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { "x-api-key": token },
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
    // Attempt to match exact punch_in timestamp, or just grab the most recent one if exact match fails
    const matchingRow =
      data.find((row) => row.punch_in === punchInTimeISO) ||
      data.find((row) => !row.punch_out) ||
      data[0];
    return { id: String(matchingRow.id), response: responseBody };
  }

  return { id: null, response: responseBody };
}

/**
 * Updates a punch_record in Fieldproxy when user checks out.
 * If fieldproxy_punch_id is available, uses it for precise lookup.
 */
export async function updateCheckOutInFieldproxy(
  log: any,
): Promise<{ lookup: any; update?: any; error?: string }> {
  const token = await getAccessToken();

  let rowId: string | null = null;
  let lookupResponse: any = null;

  // 1. Try to find row using stored fieldproxy_punch_id (precise)
  if (log.fieldproxy_punch_id) {
    const whereClause = `punch_id='${log.fieldproxy_punch_id}'`;
    const url = `${FIELDPROXY_BASE}/getFilteredSheetData?sheet_id=punch_records&where_clause=${encodeURIComponent(whereClause)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { "x-api-key": token },
    });
    lookupResponse = (await res.json().catch(() => ({}))) as any;
    const data = Array.isArray(lookupResponse)
      ? lookupResponse[0]?.data
      : lookupResponse.data;
    if (Array.isArray(data) && data.length > 0) {
      rowId = String(data[0].id);
    }
  }

  // 2. Fallback: search by user_id
  if (!rowId) {
    const punchInTime = new Date(log.check_in_time).toISOString();
    const result = await getRowIdByUserAndPunchIn(
      log.user_id,
      punchInTime,
      token,
    );
    rowId = result.id;
    lookupResponse = result.response;
  }

  if (!rowId) {
    console.warn(
      `[FIELDPROXY] Could not find punch_record row for user_id: ${log.user_id}. Skipping punch_out update.`,
    );
    return { lookup: lookupResponse, error: "Row not found in Fieldproxy" };
  }

  // 3. Prepare payload
  const punchOutTime = log.check_out_time
    ? new Date(log.check_out_time).toISOString()
    : new Date().toISOString();
  const punchoutlocation =
    log.check_out_longitude && log.check_out_latitude
      ? [String(log.check_out_longitude), String(log.check_out_latitude)]
      : null;

  // Re-calculate shift_id or default to "I" if missing
  const nowIST = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
  const hour = nowIST.getUTCHours();
  let shiftId = "I";
  if (hour >= 14 && hour < 22) shiftId = "II";
  else if (hour >= 22 || hour < 6) shiftId = "III";

  const tableData: Record<string, any> = {
    user_id: log.user_id,
    shift_id: log.shift_id || shiftId,
    site_id: log.site_code || "WFH",
    punch_id: log.fieldproxy_punch_id || undefined,
    punch_out: punchOutTime,
    punch_outtimestamp: punchOutTime,
    location: log.check_out_address || log.address || "",
    punchoutlocation: punchoutlocation,
    updatedAt: punchOutTime,
  };

  const body = {
    rowId,
    sheetId: "punch_records",
    tableData,
  };

  console.log(`[FIELDPROXY] Updating row ${rowId} for user ${log.user_id}`);

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
      `Fieldproxy updateRows failed for punch_out: ${res.status} ${res.statusText} — ${JSON.stringify(updateResponse)}`,
    );
  }

  return { lookup: lookupResponse, update: updateResponse };
}
