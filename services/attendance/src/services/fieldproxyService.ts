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

export async function forwardPunchInToFieldproxy(log: any): Promise<any> {
  const token = await getAccessToken();

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

  const body = {
    sheetId: "punch_records",
    sheetName: "punch_records",
    tableData: {
      punch_id: log.id,
      user_id: log.user_id,
      shift_id: log.shift_id || null,
      site_id: log.site_code || null,
      punch_in: punchInTime,
      punch_out: punchOutTime,
      location: log.check_in_address || null,
      punchinlocation: punchinlocation,
      punchoutlocation: punchoutlocation,
      punch_intimestamp: punchInTime,
      punch_outtimestamp: punchOutTime,
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

  return responseData;
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
 * Updates a punch_record in Fieldproxy when user checks out
 */
export async function updateCheckOutInFieldproxy(
  log: any,
): Promise<{ lookup: any; update?: any; error?: string }> {
  const token = await getAccessToken();

  const punchInTime = new Date(log.check_in_time).toISOString();

  // 1. Get rowId
  const { id: rowId, response: lookupResponse } =
    await getRowIdByUserAndPunchIn(log.user_id, punchInTime, token);

  if (!rowId) {
    console.warn(
      `[FIELDPROXY] Could not find punch_record row for user_id: ${log.user_id}. Skipping punch_out update.`,
    );
    return { lookup: lookupResponse, error: "Row not found in Fieldproxy" };
  }

  // 2. Prepare payload
  const punchOutTime = log.check_out_time
    ? new Date(log.check_out_time).toISOString()
    : new Date().toISOString();
  const punchoutlocation =
    log.check_out_longitude && log.check_out_latitude
      ? [String(log.check_out_longitude), String(log.check_out_latitude)]
      : null;

  const tableData: Record<string, any> = {
    punch_out: punchOutTime,
    punch_outtimestamp: punchOutTime,
    punchoutlocation: punchoutlocation,
    updatedAt: punchOutTime,
  };

  const body = {
    rowId,
    sheetId: "punch_records",
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
      `Fieldproxy updateRows failed for punch_out: ${res.status} ${res.statusText} — ${JSON.stringify(updateResponse)}`,
    );
  }

  return { lookup: lookupResponse, update: updateResponse };
}
