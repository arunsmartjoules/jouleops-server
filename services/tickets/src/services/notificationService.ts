/**
 * Ticket Notification Service
 *
 * Sends push notifications to site users when a ticket is created.
 * Respects user preferences (ticket_notifications_enabled) and global exclusions.
 */

import { query, queryOne, logActivity } from "@jouleops/shared";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const TICKET_TRIGGER_KEY = "ticket_created";
type IncidentTriggerKey = "incident_created" | "incident_inprogress" | "incident_resolved";

interface Ticket {
  ticket_no: string;
  title?: string;
  site_code: string;
  category?: string;
  priority?: string;
  [key: string]: any;
}

interface IncidentEvent {
  incident_id: string;
  fault_symptom?: string;
  site_code: string;
  severity?: string;
  status?: string;
  [key: string]: any;
}

/**
 * Render a template string by replacing {{variable}} placeholders.
 */
function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

async function sendSiteEventNotifications(input: {
  triggerKey: string;
  eventType: string;
  siteCode: string;
  preferenceColumn: "ticket_notifications_enabled" | "incident_notifications_enabled";
  vars: Record<string, string>;
  eventMeta: Record<string, unknown>;
}): Promise<void> {
  const { triggerKey, eventType, siteCode, preferenceColumn, vars, eventMeta } = input;

  const trigger = await queryOne<{ is_enabled: boolean }>(
    `SELECT is_enabled FROM notification_trigger_configs WHERE trigger_key = $1`,
    [triggerKey],
  );
  if (!trigger?.is_enabled) return;

  const template = await queryOne<{ title_template: string; body_template: string }>(
    `SELECT title_template, body_template FROM notification_templates
     WHERE trigger_key = $1 AND is_active = true
     ORDER BY created_at DESC LIMIT 1`,
    [triggerKey],
  );
  if (!template) return;

  const siteRows = await query<{ user_id: string; site_name: string }>(
    `SELECT su.user_id, s.name as site_name
     FROM site_user su
     JOIN sites s ON su.site_id = s.site_id
     WHERE s.site_code = $1`,
    [siteCode],
  );
  if (!siteRows.length) return;

  const userIds = siteRows.map((u) => u.user_id);
  const excluded = await query<{ user_id: string }>(
    `SELECT user_id FROM notification_exclusions WHERE user_id = ANY($1)`,
    [userIds],
  );
  const excludedSet = new Set(excluded.map((e) => e.user_id));

  const disabledPrefs = await query<{ user_id: string }>(
    `SELECT user_id FROM user_notification_preferences
     WHERE user_id = ANY($1) AND ${preferenceColumn} = false`,
    [userIds],
  );
  const disabledSet = new Set(disabledPrefs.map((p) => p.user_id));
  const eligibleUserIds = userIds.filter((id) => !excludedSet.has(id) && !disabledSet.has(id));
  if (!eligibleUserIds.length) return;

  const tokenRows = await query<{ user_id: string; push_token: string }>(
    `SELECT user_id, push_token FROM push_tokens
     WHERE user_id = ANY($1) AND enabled = true`,
    [eligibleUserIds],
  );
  if (!tokenRows.length) return;

  const title = renderTemplate(template.title_template, vars);
  const body = renderTemplate(template.body_template, vars);
  const tokens = tokenRows
    .map((r) => r.push_token)
    .filter((t) => t?.startsWith("ExponentPushToken[") || t?.startsWith("ExpoPushToken["));
  if (!tokens.length) return;

  const BATCH = 100;
  for (let i = 0; i < tokens.length; i += BATCH) {
    const chunk = tokens.slice(i, i + BATCH);
    const messages = chunk.map((to) => ({
      to,
      sound: "default",
      title,
      body,
      data: { type: eventType, site_code: siteCode, ...eventMeta },
      priority: "high",
      channelId: "default",
    }));
    const resp = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(messages),
    });
    if (!resp.ok) continue;
    const result = (await resp.json()) as any;
    if (!Array.isArray(result?.data)) continue;
    for (let j = 0; j < result.data.length; j++) {
      const item = result.data[j];
      if (item.status === "error" && item.details?.error === "DeviceNotRegistered") {
        await query("DELETE FROM push_tokens WHERE push_token = $1", [chunk[j]]).catch(() => {});
      }
    }
  }

  const uniqueUserIds = tokenRows
    .map((r) => r.user_id)
    .filter((id, idx, arr) => arr.indexOf(id) === idx);
  if (!uniqueUserIds.length) return;

  const placeholders = uniqueUserIds
    .map((_, i) => `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6}, NOW())`)
    .join(", ");
  const params = uniqueUserIds.flatMap((uid) => [uid, title, body, triggerKey, "sent", null]);
  await query(
    `INSERT INTO notification_logs (user_id, title, body, notification_type, status, error_message, sent_at) VALUES ${placeholders}`,
    params,
  ).catch(() => {});
}

/**
 * Send push notifications to all eligible users for a site when a ticket is created.
 * Fire-and-forget — caller should not await this if they don't want to block.
 */
export async function sendTicketCreatedNotifications(ticket: Ticket): Promise<void> {
  try {
    await sendSiteEventNotifications({
      triggerKey: TICKET_TRIGGER_KEY,
      eventType: "ticket_created",
      siteCode: ticket.site_code,
      preferenceColumn: "ticket_notifications_enabled",
      vars: {
        ticket_no: ticket.ticket_no ?? "",
        complaint_title: ticket.title ?? ticket.ticket_no ?? "",
        site_name: ticket.site_code ?? "",
        category: ticket.category ?? "",
        priority: ticket.priority ?? "",
        status: "Open",
      },
      eventMeta: { ticket_no: ticket.ticket_no },
    });
  } catch (err: any) {
    console.error("sendTicketCreatedNotifications error:", err);
    // Log failure to activity master
    await logActivity({
      action: "TICKET_NOTIFICATION_FAILED",
      module: "notifications",
      description: `Failed to send push notifications for ticket ${ticket.ticket_no}: ${err.message}`,
      metadata: {
        ticket_no: ticket.ticket_no,
        site_code: ticket.site_code,
        error: err.message,
      },
    }).catch(() => {});
  }
}

export async function sendIncidentEventNotifications(
  triggerKey: IncidentTriggerKey,
  incident: IncidentEvent,
): Promise<void> {
  const statusByTrigger: Record<IncidentTriggerKey, string> = {
    incident_created: "Open",
    incident_inprogress: "Inprogress",
    incident_resolved: "Resolved",
  };
  await sendSiteEventNotifications({
    triggerKey,
    eventType: triggerKey,
    siteCode: incident.site_code,
    preferenceColumn: "incident_notifications_enabled",
    vars: {
      incident_id: incident.incident_id ?? "",
      fault_symptom: incident.fault_symptom ?? "",
      site_name: incident.site_code ?? "",
      severity: incident.severity ?? "",
      status: incident.status ?? statusByTrigger[triggerKey],
    },
    eventMeta: { incident_id: incident.incident_id },
  });
}
