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
}

export async function forwardComplaintToFieldproxy(
  complaint: ComplaintForwardPayload,
): Promise<void> {
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

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Fieldproxy sheetsRow failed: ${res.status} ${res.statusText} — ${text}`,
    );
  }
}
