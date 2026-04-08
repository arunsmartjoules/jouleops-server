/**
 * Fieldproxy Integration Service for Site Logs & Chiller Readings
 *
 * Site Logs: Records already exist in Fieldproxy — only UPDATE.
 *   - Sheet: "log_task_line" (lookup by scheduled_date + task_name + log_name)
 *   - After updating log_task_line, also update "task_management" (lookup by source_reference_id = log_id)
 *
 * Chiller Readings: CREATE on insert, UPDATE on update.
 *   - Sheet: "chiller_readings_log"
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

// ============================================================================
// Helpers
// ============================================================================

async function getRowIdByField(
  sheetId: string,
  field: string,
  value: string,
  token: string,
): Promise<{ id: string | null; response: any }> {
  const whereClause = `${field}='${value}'`;
  const url = `${FIELDPROXY_BASE}/getFilteredSheetData?sheet_id=${sheetId}&where_clause=${encodeURIComponent(whereClause)}`;

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
    return { id: String(data[0].id), response: responseBody };
  }

  return { id: null, response: responseBody };
}

function escapeWhereValue(value: string): string {
  return value.replace(/'/g, "''");
}

async function getRowIdByWhereClause(
  sheetId: string,
  whereClause: string,
  token: string,
): Promise<{ id: string | null; response: any }> {
  const url = `${FIELDPROXY_BASE}/getFilteredSheetData?sheet_id=${sheetId}&where_clause=${encodeURIComponent(whereClause)}`;

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
    return { id: String(data[0].id), response: responseBody };
  }

  return { id: null, response: responseBody };
}

async function updateRow(
  sheetId: string,
  rowId: string,
  tableData: Record<string, any>,
  token: string,
): Promise<any> {
  const body = { rowId, sheetId, tableData };

  const res = await fetch(`${FIELDPROXY_BASE}/updateRows`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": token,
    },
    body: JSON.stringify(body),
  });

  const responseData = (await res.json().catch(() => ({}))) as any;

  if (!res.ok) {
    throw new Error(
      `Fieldproxy updateRows failed [${sheetId}]: ${res.status} ${res.statusText} — ${JSON.stringify(responseData)}`,
    );
  }

  return responseData;
}

async function createRow(
  sheetId: string,
  tableData: Record<string, any>,
  token: string,
): Promise<any> {
  const body = { sheetId, sheetName: sheetId, tableData };

  const res = await fetch(`${FIELDPROXY_BASE}/sheetsRow`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": token,
    },
    body: JSON.stringify(body),
  });

  const responseData = (await res.json().catch(() => ({}))) as any;

  if (!res.ok) {
    throw new Error(
      `Fieldproxy sheetsRow failed [${sheetId}]: ${res.status} ${res.statusText} — ${JSON.stringify(responseData)}`,
    );
  }

  return responseData;
}

// ============================================================================
// Site Logs — log_task_line sheet
// log_name determines which columns to update:
//   "Temp RH"   → temperature, rh, remarks
//   "Water"     → tds, ph, hardness, remarks
//   "Chemical"  → chemical_dosing, main_remarks, remarks
// ============================================================================

export interface SiteLogSyncPayload {
  log_id?: string;
  log_name?: string;
  task_name?: string;
  scheduled_date?: string | null;
  // Temp RH
  temperature?: number | null;
  rh?: number | null;
  // Water
  tds?: number | null;
  ph?: number | null;
  hardness?: number | null;
  // Chemical
  chemical_dosing?: string | null;
  main_remarks?: string | null;
  // Shared
  remarks?: string | null;
  signature?: string | null;
  attachment?: string | null;
  entry_time?: Date | string | null;
  end_time?: Date | string | null;
  executor_id?: string | null;
  status?: string | null;
}

function buildSiteLogTableData(log: SiteLogSyncPayload): Record<string, any> {
  const tableData: Record<string, any> = {};
  const logName = (log.log_name ?? "").toLowerCase();

  if (logName.includes("temp") || logName.includes("rh")) {
    if (log.temperature != null) tableData.temperature = String(log.temperature);
    if (log.rh != null) tableData.rh = String(log.rh);
  } else if (logName.includes("water")) {
    if (log.tds != null) tableData.tds = String(log.tds);
    if (log.ph != null) tableData.ph = String(log.ph);
    if (log.hardness != null) tableData.hardness = String(log.hardness);
  } else if (logName.includes("chemical")) {
    if (log.chemical_dosing != null) tableData.chemical_dosing = log.chemical_dosing;
    if (log.main_remarks != null) tableData.main_remarks = log.main_remarks;
  } else {
    // Unknown type — send all non-null fields
    if (log.temperature != null) tableData.temperature = String(log.temperature);
    if (log.rh != null) tableData.rh = String(log.rh);
    if (log.tds != null) tableData.tds = String(log.tds);
    if (log.ph != null) tableData.ph = String(log.ph);
    if (log.hardness != null) tableData.hardness = String(log.hardness);
    if (log.chemical_dosing != null) tableData.chemical_dosing = log.chemical_dosing;
    if (log.main_remarks != null) tableData.main_remarks = log.main_remarks;
  }

  if (log.remarks != null) tableData.remarks = log.remarks;
  if (log.entry_time != null) tableData.entry_time = new Date(log.entry_time).toISOString();
  if (log.end_time != null) tableData.end_time = new Date(log.end_time).toISOString();
  if (log.executor_id != null) tableData.exicuter_id = log.executor_id; // fieldproxy uses "exicuter_id"

  if (log.signature != null) {
    try {
      tableData.signature = typeof log.signature === "string" ? log.signature : JSON.stringify(log.signature);
    } catch {
      tableData.signature = log.signature;
    }
  }

  if (log.attachment != null) {
    try {
      tableData.attachment = typeof log.attachment === "string" ? log.attachment : JSON.stringify(log.attachment);
    } catch {
      tableData.attachment = log.attachment;
    }
  }

  return tableData;
}

/**
 * Updates a site log in Fieldproxy (log_task_line sheet),
 * then updates the corresponding task_management row.
 */
export async function updateSiteLogInFieldproxy(
  log: SiteLogSyncPayload,
): Promise<{ logTaskLine: any; taskManagement: any; error?: string }> {
  if (!log.scheduled_date || !log.task_name || !log.log_name) {
    return {
      logTaskLine: null,
      taskManagement: null,
      error:
        "Missing scheduled_date/task_name/log_name for log_task_line lookup",
    };
  }

  const token = await getAccessToken();

  // ── 1. Update log_task_line ──────────────────────────────────────────────
  const whereClause = `scheduled_date='${escapeWhereValue(log.scheduled_date)}' AND task_name='${escapeWhereValue(log.task_name)}' AND log_name='${escapeWhereValue(log.log_name)}'`;
  const { id: logRowId, response: logLookup } = await getRowIdByWhereClause(
    "log_task_line",
    whereClause,
    token,
  );

  let logTaskLineResult: any = logLookup;

  if (!logRowId) {
    console.warn(
      `[FIELDPROXY] log_task_line row not found for scheduled_date=${log.scheduled_date}, task_name=${log.task_name}, log_name=${log.log_name}`,
    );
    const createData = buildSiteLogTableData(log);
    createData.scheduled_date = log.scheduled_date;
    createData.task_name = log.task_name;
    createData.log_name = log.log_name;
    if (log.log_id != null) createData.log_id = log.log_id;

    logTaskLineResult = await createRow("log_task_line", createData, token);
    console.log(
      `[FIELDPROXY] Created log_task_line row for scheduled_date=${log.scheduled_date}, task_name=${log.task_name}, log_name=${log.log_name}`,
    );
  } else {
    const tableData = buildSiteLogTableData(log);

    if (Object.keys(tableData).length > 0) {
      logTaskLineResult = await updateRow("log_task_line", logRowId, tableData, token);
      console.log(`[FIELDPROXY] Updated log_task_line row ${logRowId} for task ${log.task_name}`);
    } else {
      logTaskLineResult = { skipped: "No fields to update" };
    }
  }

  // ── 2. Update task_management ────────────────────────────────────────────
  let taskManagementResult: any = { skipped: "Missing log_id for task_management lookup" };
  if (log.log_id) {
    const { id: taskRowId, response: taskLookup } = await getRowIdByField(
      "task_management",
      "source_reference_id",
      log.log_id,
      token,
    );

    taskManagementResult = taskLookup;

    if (!taskRowId) {
      console.warn(`[FIELDPROXY] task_management row not found for source_reference_id: ${log.log_id}`);
      taskManagementResult = { error: "Row not found in task_management" };
    } else {
      const taskData: Record<string, any> = {};

      if (log.status != null) taskData.task_status = log.status;
      if (log.executor_id != null) taskData.assigned_to = log.executor_id;
      if (log.signature != null) taskData.signature = typeof log.signature === "string" ? log.signature : JSON.stringify(log.signature);
      if (log.entry_time != null) taskData.time_log_start = new Date(log.entry_time).toISOString();

      if (Object.keys(taskData).length > 0) {
        taskManagementResult = await updateRow("task_management", taskRowId, taskData, token);
        console.log(`[FIELDPROXY] Updated task_management row ${taskRowId} for log_id: ${log.log_id}`);
      } else {
        taskManagementResult = { skipped: "No fields to update" };
      }
    }
  }

  return { logTaskLine: logTaskLineResult, taskManagement: taskManagementResult };
}

// ============================================================================
// Chiller Readings — chiller_readings_log sheet
// CREATE on insert, UPDATE on update.
// ============================================================================

export interface ChillerReadingSyncPayload {
  id?: string | number;
  log_id?: string | null;
  site_id?: string | null;
  chiller_id?: string | null;
  date_shift?: string | null;
  executor_id?: string | null;
  reading_time?: Date | string | null;
  condenser_inlet_temp?: number | null;
  condenser_outlet_temp?: number | null;
  evaporator_inlet_temp?: number | null;
  evaporator_outlet_temp?: number | null;
  compressor_suction_temp?: number | null;
  motor_temperature?: number | null;
  saturated_condenser_temp?: number | null;
  saturated_suction_temp?: number | null;
  discharge_pressure?: number | null;
  main_suction_pressure?: number | null;
  oil_pressure?: number | null;
  oil_pressure_difference?: number | null;
  compressor_load_percentage?: number | null;
  inline_btu_meter?: number | null;
  set_point_celsius?: number | null;
  condenser_inlet_pressure?: number | null;
  condenser_outlet_pressure?: number | null;
  evaporator_inlet_pressure?: number | null;
  evaporator_outlet_pressure?: number | null;
  remarks?: string | null;
  sla_status?: string | null;
  signature_text?: string | null;
  attachments?: string | null;
  startdatetime?: Date | string | null;
  enddatetime?: Date | string | null;
}

function buildChillerTableData(reading: ChillerReadingSyncPayload): Record<string, any> {
  const d: Record<string, any> = {};

  if (reading.site_id != null) d.site_id = reading.site_id;
  if (reading.chiller_id != null) d.chiller_id = reading.chiller_id;
  if (reading.date_shift != null) d.date_shift = reading.date_shift;
  if (reading.executor_id != null) d.executor_id = reading.executor_id;
  if (reading.reading_time != null) d.reading_time = new Date(reading.reading_time).toISOString();
  if (reading.condenser_inlet_temp != null) d.condenser_inlet_temp = reading.condenser_inlet_temp;
  if (reading.condenser_outlet_temp != null) d.condenser_outlet_temp = reading.condenser_outlet_temp;
  if (reading.evaporator_inlet_temp != null) d.evaporator_inlet_temp = reading.evaporator_inlet_temp;
  if (reading.evaporator_outlet_temp != null) d.evaporator_outlet_temp = reading.evaporator_outlet_temp;
  if (reading.compressor_suction_temp != null) d.compressor_suction_temp = reading.compressor_suction_temp;
  if (reading.motor_temperature != null) d.motor_temperature = reading.motor_temperature;
  if (reading.saturated_condenser_temp != null) d.saturated_condenser_temp = reading.saturated_condenser_temp;
  if (reading.saturated_suction_temp != null) d.saturated_suction_temp = reading.saturated_suction_temp;
  if (reading.discharge_pressure != null) d.discharge_pressure = reading.discharge_pressure;
  if (reading.main_suction_pressure != null) d.main_suction_pressure = reading.main_suction_pressure;
  if (reading.oil_pressure != null) d.oil_pressure = reading.oil_pressure;
  if (reading.oil_pressure_difference != null) d.oil_pressure_difference = reading.oil_pressure_difference;
  if (reading.compressor_load_percentage != null) d.compressor_load_percentage = reading.compressor_load_percentage;
  if (reading.inline_btu_meter != null) d.inline_btu_meter = reading.inline_btu_meter;
  if (reading.set_point_celsius != null) d.set_point_celsius = reading.set_point_celsius;
  if (reading.condenser_inlet_pressure != null) d.condenser_inlet_pressure = reading.condenser_inlet_pressure;
  if (reading.condenser_outlet_pressure != null) d.condenser_outlet_pressure = reading.condenser_outlet_pressure;
  if (reading.evaporator_inlet_pressure != null) d.evaporator_inlet_pressure = reading.evaporator_inlet_pressure;
  if (reading.evaporator_outlet_pressure != null) d.evaporator_outlet_pressure = reading.evaporator_outlet_pressure;
  if (reading.remarks != null) d.remarks = reading.remarks;
  if (reading.sla_status != null) d.sla_status = reading.sla_status;
  if (reading.signature_text != null) d.signature_text = reading.signature_text;
  if (reading.attachments != null) d.attachments = reading.attachments;
  if (reading.startdatetime != null) d.startdatetime = new Date(reading.startdatetime).toISOString();
  if (reading.enddatetime != null) d.enddatetime = new Date(reading.enddatetime).toISOString();

  return d;
}

/**
 * Creates a new chiller reading row in Fieldproxy.
 */
export async function createChillerReadingInFieldproxy(
  reading: ChillerReadingSyncPayload,
): Promise<any> {
  const token = await getAccessToken();
  const tableData = buildChillerTableData(reading);

  const result = await createRow("chiller_readings_log", tableData, token);
  console.log(`[FIELDPROXY] Created chiller_readings_log for chiller: ${reading.chiller_id}`);
  return result;
}

/**
 * Updates an existing chiller reading row in Fieldproxy.
 * Looks up by log_id (our internal reference stored in Fieldproxy).
 */
export async function updateChillerReadingInFieldproxy(
  reading: ChillerReadingSyncPayload,
): Promise<{ lookup: any; update?: any; error?: string }> {
  if (!reading.log_id) {
    return { lookup: null, error: "Missing log_id — cannot look up Fieldproxy row" };
  }

  const token = await getAccessToken();

  const { id: rowId, response: lookupResponse } = await getRowIdByField(
    "chiller_readings_log",
    "log_id",
    reading.log_id,
    token,
  );

  if (!rowId) {
    console.warn(`[FIELDPROXY] chiller_readings_log row not found for log_id: ${reading.log_id}`);
    return { lookup: lookupResponse, error: "Row not found in chiller_readings_log" };
  }

  const tableData = buildChillerTableData(reading);

  if (Object.keys(tableData).length === 0) {
    return { lookup: lookupResponse, error: "No fields to update" };
  }

  const updateResponse = await updateRow("chiller_readings_log", rowId, tableData, token);
  console.log(`[FIELDPROXY] Updated chiller_readings_log row ${rowId} for log_id: ${reading.log_id}`);

  return { lookup: lookupResponse, update: updateResponse };
}
