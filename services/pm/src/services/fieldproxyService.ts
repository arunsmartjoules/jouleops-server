/**
 * Fieldproxy Integration Service — PM Module
 *
 * Forwards PM instance data to Fieldproxy sheets after updates.
 * Updates two sheets:
 *   1. pm_instance   — PM execution data (status, progress, images, signature)
 *   2. task_management — Task tracking (status, time logs, assigned_to)
 *
 * Authenticates via Fieldproxy's Zapier API on every call.
 * Follows the same pattern as the tickets fieldproxyService.
 */

const FIELDPROXY_BASE = "https://webapi.fieldproxy.com/v3/zapier";

// ─── Auth ─────────────────────────────────────────────────────────────────────

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

// ─── Generic Row Lookup ───────────────────────────────────────────────────────

/**
 * Gets the Fieldproxy internal row_id by searching with a where_clause.
 */
async function getRowIdByWhereClause(
  sheetId: string,
  whereClause: string,
  token: string,
): Promise<{ id: string | null; response: any }> {
  const url = `${FIELDPROXY_BASE}/getFilteredSheetData?sheet_id=${sheetId}&where_clause=${encodeURIComponent(whereClause)}`;

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

// ─── Update Rows Helper ──────────────────────────────────────────────────────

async function updateSheetRow(
  rowId: string,
  sheetId: string,
  tableData: Record<string, any>,
  token: string,
): Promise<any> {
  const body = {
    rowId,
    sheetId,
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

  return updateResponse;
}

// ─── Status Mapping ──────────────────────────────────────────────────────────

/**
 * Map our internal status to Fieldproxy pm_instance status.
 * Our DB: Pending, In-progress, In Progress, Completed, Cancelled
 * Fieldproxy: Pending, Inprogress, Completed
 */
function mapToPMInstanceStatus(status: string): string {
  const normalized = status.toLowerCase().replace(/[-\s]/g, "");
  switch (normalized) {
    case "inprogress":
      return "Inprogress";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "pending":
    default:
      return "Pending";
  }
}

/**
 * Map our internal status to Fieldproxy task_management task_status.
 * Fieldproxy task_management: Open, Inprogress, Completed
 */
function mapToTaskStatus(status: string): string {
  const normalized = status.toLowerCase().replace(/[-\s]/g, "");
  switch (normalized) {
    case "inprogress":
      return "Inprogress";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "pending":
    case "open":
    default:
      return "Open";
  }
}

function isRemoteUrl(value?: string | null): boolean {
  if (!value) return false;
  const v = String(value).trim().toLowerCase();
  return v.startsWith("http://") || v.startsWith("https://");
}

function normalizeProgress(value?: string | null): string | undefined {
  if (!value) return undefined;
  const raw = String(value).trim();
  if (!raw) return undefined;

  // Mobile often stores progress as "answered/total" (e.g. "6/6").
  // Fieldproxy pm_instance commonly expects a scalar.
  if (raw.includes("/")) {
    const [answered] = raw.split("/");
    const n = Number(answered);
    if (!Number.isNaN(n)) return String(n);
  }
  return raw;
}

// ─── PM Instance Payload ─────────────────────────────────────────────────────

export interface PMFieldproxyPayload {
  instance_id: string;        // Our pm_instances.instance_id (e.g. "INST033558")
  status?: string;            // Our status — will be mapped
  progress?: string;          // Number of completed checklist items
  before_image?: string;      // Image URL
  after_image?: string;       // Image URL
  sjpl_sign?: string;         // Signature URL (mapped from our client_sign)
  start_datetime?: string;    // ISO timestamp — when user started PM
  end_datetime?: string;      // ISO timestamp — when user completed PM
  assigned_to?: string;       // employee_code of the user
}

// ─── Update PM Instance in Fieldproxy ────────────────────────────────────────

/**
 * Updates the pm_instance sheet in Fieldproxy.
 * Looks up the row by instance_id, then updates only the provided fields.
 */
export async function updatePMInstanceInFieldproxy(
  payload: PMFieldproxyPayload,
): Promise<{ lookup: any; update?: any; error?: string }> {
  const token = await getAccessToken();

  // 1. Get rowId
  const whereClause = `instance_id='${payload.instance_id}'`;
  const { id: rowId, response: lookupResponse } = await getRowIdByWhereClause(
    "pm_instance",
    whereClause,
    token,
  );

  if (!rowId) {
    console.warn(
      `[FIELDPROXY_PM] Could not find row for instance_id: ${payload.instance_id}. Skipping update.`,
    );
    return { lookup: lookupResponse, error: "Row not found in Fieldproxy" };
  }

  // 2. Prepare tableData — only include fields that are provided
  const tableData: Record<string, any> = {};
  if (payload.status)         tableData.status         = mapToPMInstanceStatus(payload.status);
  const normalizedProgress = normalizeProgress(payload.progress || null);
  if (normalizedProgress)     tableData.progress       = normalizedProgress;
  if (isRemoteUrl(payload.before_image)) tableData.before_image = payload.before_image;
  if (isRemoteUrl(payload.after_image))  tableData.after_image  = payload.after_image;
  if (isRemoteUrl(payload.sjpl_sign))    tableData.sjpl_sign    = payload.sjpl_sign;
  if (payload.start_datetime) tableData.start_datetime = payload.start_datetime;
  if (payload.end_datetime)   tableData.end_datetime   = payload.end_datetime;
  if (payload.assigned_to)    tableData.assigned_to    = payload.assigned_to;

  if (Object.keys(tableData).length === 0) {
    return { lookup: lookupResponse, error: "No fields to update" };
  }

  // 3. Update (with graceful fallback if media columns are rejected)
  try {
    const updateResponse = await updateSheetRow(rowId, "pm_instance", tableData, token);
    return { lookup: lookupResponse, update: updateResponse };
  } catch (err: any) {
    const retryData = { ...tableData };
    delete retryData.before_image;
    delete retryData.after_image;
    delete retryData.sjpl_sign;

    // Retry only when there are meaningful non-media fields to keep instance status in sync.
    if (Object.keys(retryData).length > 0) {
      const retryResponse = await updateSheetRow(rowId, "pm_instance", retryData, token);
      return {
        lookup: lookupResponse,
        update: retryResponse,
        error: `Media fields skipped after initial failure: ${err?.message || String(err)}`,
      };
    }

    throw err;
  }
}

// ─── Update Task Management in Fieldproxy ────────────────────────────────────

export interface TaskManagementFieldproxyPayload {
  instance_id: string;        // Our pm_instances.instance_id — used as source_reference_id lookup
  task_status?: string;       // Mapped from pm_instance status
  time_log_start?: string;    // ISO timestamp — when user started PM
  time_log_end?: string;      // ISO timestamp — when user completed PM
  assigned_to?: string;       // employee_code of the user
}

// ─── Create PM Instance Task Line in Fieldproxy ──────────────────────────────

export interface PMInstanceTaskLinePayload {
  instance_id: string;
  task_name: string;
  status?: string | null;
  checklist_id: string;
  task_line_id?: string;
}

/**
 * Creates a row in Fieldproxy sheet "pm_instance_task_line".
 * This is append-only and should be called for each checklist upsert.
 */
export async function createPMInstanceTaskLineInFieldproxy(
  payload: PMInstanceTaskLinePayload,
): Promise<any> {
  const token = await getAccessToken();

  const body = {
    sheetId: "pm_instance_task_line",
    sheetName: "pm_instance_task_line",
    tableData: {
      task_line_id:
        payload.task_line_id ||
        `${payload.instance_id}:${payload.checklist_id}`,
      instance_id: payload.instance_id,
      task_name: payload.task_name,
      status: payload.status ?? null,
      checklist_id: payload.checklist_id,
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
      `Fieldproxy sheetsRow failed [pm_instance_task_line]: ${res.status} ${res.statusText} — ${JSON.stringify(responseData)}`,
    );
  }

  return responseData;
}

/**
 * Updates the task_management sheet in Fieldproxy.
 * Looks up the row by source_reference_id = instance_id, then updates.
 */
export async function updateTaskManagementInFieldproxy(
  payload: TaskManagementFieldproxyPayload,
): Promise<{ lookup: any; update?: any; error?: string }> {
  const token = await getAccessToken();

  // 1. Get rowId
  const whereClause = `source_reference_id='${payload.instance_id}'`;
  const { id: rowId, response: lookupResponse } = await getRowIdByWhereClause(
    "task_management",
    whereClause,
    token,
  );

  if (!rowId) {
    console.warn(
      `[FIELDPROXY_PM] Could not find task_management row for source_reference_id: ${payload.instance_id}. Skipping update.`,
    );
    return { lookup: lookupResponse, error: "Row not found in Fieldproxy" };
  }

  // 2. Prepare tableData — only include fields that are provided
  const tableData: Record<string, any> = {};
  if (payload.task_status)    tableData.task_status    = mapToTaskStatus(payload.task_status);
  if (payload.time_log_start) tableData.time_log_start = payload.time_log_start;
  if (payload.time_log_end)   tableData.time_log_end   = payload.time_log_end;
  if (payload.assigned_to)    tableData.assigned_to    = payload.assigned_to;

  if (Object.keys(tableData).length === 0) {
    return { lookup: lookupResponse, error: "No fields to update" };
  }

  // 3. Update
  const updateResponse = await updateSheetRow(rowId, "task_management", tableData, token);

  return { lookup: lookupResponse, update: updateResponse };
}

// ─── Convenience: Sync Both Sheets ──────────────────────────────────────────

/**
 * Syncs PM data to both pm_instance and task_management sheets.
 * Returns results for both operations.
 */
export async function syncPMToFieldproxy(
  pmPayload: PMFieldproxyPayload,
  taskPayload?: Partial<TaskManagementFieldproxyPayload>,
): Promise<{
  pmInstance: { lookup: any; update?: any; error?: string };
  taskManagement: { lookup: any; update?: any; error?: string };
}> {
  // Update pm_instance
  const pmResult = await updatePMInstanceInFieldproxy(pmPayload);

  // Update task_management
  const taskData: TaskManagementFieldproxyPayload = {
    instance_id: pmPayload.instance_id,
    task_status: pmPayload.status,
    time_log_start: pmPayload.start_datetime || taskPayload?.time_log_start,
    time_log_end: pmPayload.end_datetime || taskPayload?.time_log_end,
    assigned_to: pmPayload.assigned_to || taskPayload?.assigned_to,
  };

  const taskResult = await updateTaskManagementInFieldproxy(taskData);

  return { pmInstance: pmResult, taskManagement: taskResult };
}
