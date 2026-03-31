/**
 * Ticket Notification Service
 *
 * Sends push notifications to site users when a ticket is created.
 * Respects user preferences (ticket_notifications_enabled) and global exclusions.
 */

import { query, queryOne, logActivity } from "@jouleops/shared";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const TRIGGER_KEY = "ticket_created";

interface Ticket {
  ticket_no: string;
  title?: string;
  site_code: string;
  category?: string;
  priority?: string;
  [key: string]: any;
}

/**
 * Render a template string by replacing {{variable}} placeholders.
 */
function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

/**
 * Send push notifications to all eligible users for a site when a ticket is created.
 * Fire-and-forget — caller should not await this if they don't want to block.
 */
export async function sendTicketCreatedNotifications(ticket: Ticket): Promise<void> {
  try {
    // 1. Check if trigger is enabled
    const trigger = await queryOne<{ is_enabled: boolean }>(
      `SELECT is_enabled FROM notification_trigger_configs WHERE trigger_key = $1`,
      [TRIGGER_KEY],
    );
    if (!trigger) {
      logActivity({
        action: "SKIP_TICKET_NOTIFICATION",
        module: "notifications",
        description: `Notification trigger config missing for '${TRIGGER_KEY}'`,
        metadata: { ticket_no: ticket.ticket_no, site_code: ticket.site_code },
      }).catch(() => {});
      return;
    }
    if (!trigger.is_enabled) {
      logActivity({
        action: "SKIP_TICKET_NOTIFICATION",
        module: "notifications",
        description: `Notification trigger '${TRIGGER_KEY}' is disabled in config`,
        metadata: { ticket_no: ticket.ticket_no, site_code: ticket.site_code },
      }).catch(() => {});
      return;
    }

    // 2. Get active template for this trigger
    const template = await queryOne<{ title_template: string; body_template: string }>(
      `SELECT title_template, body_template FROM notification_templates
       WHERE trigger_key = $1 AND is_active = true
       ORDER BY created_at DESC LIMIT 1`,
      [TRIGGER_KEY],
    );
    if (!template) {
      logActivity({
        action: "SKIP_TICKET_NOTIFICATION",
        module: "notifications",
        description: `No active notification template found for trigger '${TRIGGER_KEY}'`,
        metadata: { ticket_no: ticket.ticket_no, site_code: ticket.site_code },
      }).catch(() => {});
      return;
    }

    // 3. Get all users assigned to this site
    const siteRows = await query<{ user_id: string; site_name: string }>(
      `SELECT su.user_id, s.name as site_name
       FROM site_user su
       JOIN sites s ON su.site_id = s.site_id
       WHERE s.site_code = $1`,
      [ticket.site_code],
    );
    if (!siteRows.length) {
      logActivity({
        action: "SKIP_TICKET_NOTIFICATION",
        module: "notifications",
        description: `No users mapped to site '${ticket.site_code}' in site_user table`,
        metadata: { ticket_no: ticket.ticket_no, site_code: ticket.site_code },
      }).catch(() => {});
      return;
    }

    const userIds = siteRows.map((u) => u.user_id);
    const siteName = siteRows[0]?.site_name;

    // 4. Filter out globally excluded users
    const excluded = await query<{ user_id: string }>(
      `SELECT user_id FROM notification_exclusions WHERE user_id = ANY($1)`,
      [userIds],
    );
    const excludedSet = new Set(excluded.map((e) => e.user_id));

    // 5. Filter out users who have disabled ticket notifications
    const disabledPrefs = await query<{ user_id: string }>(
      `SELECT user_id FROM user_notification_preferences
       WHERE user_id = ANY($1) AND ticket_notifications_enabled = false`,
      [userIds],
    );
    const disabledSet = new Set(disabledPrefs.map((p) => p.user_id));

    const eligibleUserIds = userIds.filter(
      (id) => !excludedSet.has(id) && !disabledSet.has(id),
    );
    if (!eligibleUserIds.length) {
      logActivity({
        action: "SKIP_TICKET_NOTIFICATION",
        module: "notifications",
        description: `All site users are excluded or have disabled ticket notification preferences`,
        metadata: { 
          ticket_no: ticket.ticket_no, 
          site_code: ticket.site_code,
          total_site_users: siteRows.length 
        },
      }).catch(() => {});
      return;
    }

    // 6. Get push tokens for eligible users
    const tokenRows = await query<{ user_id: string; push_token: string }>(
      `SELECT user_id, push_token FROM push_tokens
       WHERE user_id = ANY($1) AND enabled = true`,
      [eligibleUserIds],
    );
    if (!tokenRows.length) {
      logActivity({
        action: "SKIP_TICKET_NOTIFICATION",
        module: "notifications",
        description: `No enabled push tokens found for ${eligibleUserIds.length} eligible site user(s)`,
        metadata: { 
          ticket_no: ticket.ticket_no, 
          site_code: ticket.site_code,
          eligible_users_count: eligibleUserIds.length 
        },
      }).catch(() => {});
      return;
    }

    // 7. Render template
    const vars: Record<string, string> = {
      ticket_no: ticket.ticket_no ?? "",
      complaint_title: ticket.title ?? ticket.ticket_no ?? "",
      site_name: siteName ?? ticket.site_code ?? "",
      category: ticket.category ?? "",
      priority: ticket.priority ?? "",
      status: "Open",
    };
    const title = renderTemplate(template.title_template, vars);
    const body = renderTemplate(template.body_template, vars);

    // 8. Send in batches of 100
    const tokens = tokenRows
      .map((r) => r.push_token)
      .filter((t) => t?.startsWith("ExponentPushToken[") || t?.startsWith("ExpoPushToken["));

    if (!tokens.length) {
      logActivity({
        action: "SKIP_TICKET_NOTIFICATION",
        module: "notifications",
        description: `None of the tokens found for site users are valid Expo push tokens`,
        metadata: { 
          ticket_no: ticket.ticket_no, 
          site_code: ticket.site_code,
          token_rows_count: tokenRows.length 
        },
      }).catch(() => {});
      return;
    }

    const BATCH = 100;
    const sendErrors: string[] = [];
    for (let i = 0; i < tokens.length; i += BATCH) {
      const chunk = tokens.slice(i, i + BATCH);
      const messages = chunk.map((to) => ({
        to,
        sound: "default",
        title,
        body,
        data: { type: "ticket_created", ticket_no: ticket.ticket_no, site_code: ticket.site_code },
        priority: "high",
        channelId: "default",
      }));

      try {
        const resp = await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify(messages),
        });

        if (resp.ok) {
          const result = (await resp.json()) as any;
          if (result.data && Array.isArray(result.data)) {
            for (let j = 0; j < result.data.length; j++) {
              const item = result.data[j];
              if (item.status === "error" && item.details?.error === "DeviceNotRegistered") {
                const invalidToken = chunk[j];
                console.log(`Cleaning up invalid token from ticket service: ${invalidToken}`);
                await query("DELETE FROM push_tokens WHERE push_token = $1", [invalidToken]).catch(() => {});
              }
            }
          }
        } else {
          const errText = await resp.text();
          sendErrors.push(errText);
        }
      } catch (err: any) {
        sendErrors.push(err.message);
        console.error("Push batch error:", err);
      }
    }

    const uniqueUserIds = tokenRows
      .map((r) => r.user_id)
      .filter((id, idx, arr) => arr.indexOf(id) === idx);

    const notifStatus = sendErrors.length === 0 ? "sent" : "partial";
    const errorSummary = sendErrors.length ? sendErrors.join("; ") : null;

    // 9. Log to notification_logs per user
    if (uniqueUserIds.length) {
      const placeholders = uniqueUserIds
        .map((_, i) => `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6}, NOW())`)
        .join(", ");
      const params = uniqueUserIds.flatMap((uid) => [uid, title, body, "ticket_created", notifStatus, errorSummary]);
      await query(
        `INSERT INTO notification_logs (user_id, title, body, notification_type, status, error_message, sent_at) VALUES ${placeholders}`,
        params,
      ).catch(() => {});
    }

    // 10. Log to activity_logs (activity master)
    await logActivity({
      action: sendErrors.length === 0 ? "TICKET_NOTIFICATION_SENT" : "TICKET_NOTIFICATION_PARTIAL",
      module: "notifications",
      description: `Push notifications dispatched for ticket ${ticket.ticket_no} (site: ${ticket.site_code}) — ${uniqueUserIds.length} user(s) notified`,
      metadata: {
        ticket_no: ticket.ticket_no,
        site_code: ticket.site_code,
        title,
        body,
        recipients_count: uniqueUserIds.length,
        tokens_count: tokens.length,
        status: notifStatus,
        errors: sendErrors.length ? sendErrors : undefined,
      },
    }).catch(() => {});
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
