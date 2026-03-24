/**
 * Push Dispatcher
 *
 * Dispatches push notifications to individual device tokens via FCM (Android)
 * or APNs (iOS). Handles stale-token cleanup and delivery logging.
 *
 * No DB calls are made directly — callers pass in a `db` adapter so this
 * module stays fully testable without a live database.
 *
 * Tasks: 6.18 (FCM dispatch), 6.19 (APNs dispatch)
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeviceToken {
  user_id: string;
  token: string;
  platform: "android" | "ios";
}

export interface NotificationLogEntry {
  trigger_key: string;
  user_id: string;
  title: string;
  body: string;
  status: "sent" | "failed" | "skipped" | "suppressed";
  failure_reason?: string;
  platform: string;
  complaint_id?: string;
}

export interface DispatchResult {
  user_id: string;
  platform: string;
  status: "sent" | "failed" | "skipped";
  failure_reason?: string;
}

/** Minimal DB adapter injected by callers */
export interface DispatchDb {
  /** Remove a stale/invalid device token from the store */
  deleteToken: (token: string) => Promise<void>;
  /** Write a delivery log entry */
  writeLog: (log: NotificationLogEntry) => Promise<void>;
}

// ---------------------------------------------------------------------------
// FCM HTTP v1 helpers (Android)
// ---------------------------------------------------------------------------

/** FCM error codes that indicate a permanently invalid token */
const FCM_INVALID_TOKEN_ERRORS = new Set([
  "UNREGISTERED",
  "INVALID_ARGUMENT",
  "NOT_FOUND",
]);

/**
 * Send a notification to a single Android device via FCM HTTP v1 API.
 *
 * Returns `{ success: true }` on delivery, or
 * `{ success: false, invalidToken: boolean, reason: string }` on failure.
 */
async function sendFcm(
  token: string,
  title: string,
  body: string,
): Promise<{ success: boolean; invalidToken?: boolean; reason?: string }> {
  const serverKey = process.env.FCM_SERVER_KEY;
  if (!serverKey) {
    return { success: false, invalidToken: false, reason: "FCM_SERVER_KEY not configured" };
  }

  const payload = {
    message: {
      token,
      notification: { title, body },
      android: { priority: "high" },
    },
  };

  const projectId = process.env.FCM_PROJECT_ID;
  if (!projectId) {
    return { success: false, invalidToken: false, reason: "FCM_PROJECT_ID not configured" };
  }

  let response: Response;
  try {
    response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serverKey}`,
        },
        body: JSON.stringify(payload),
      },
    );
  } catch (err: any) {
    return { success: false, invalidToken: false, reason: err?.message ?? "network error" };
  }

  if (response.ok) {
    return { success: true };
  }

  let errorBody: any = {};
  try {
    errorBody = await response.json();
  } catch {
    // ignore parse errors
  }

  // FCM v1 error shape: { error: { status: "UNREGISTERED", message: "..." } }
  const status: string = errorBody?.error?.status ?? "";
  const invalidToken = FCM_INVALID_TOKEN_ERRORS.has(status);
  const reason = errorBody?.error?.message ?? `HTTP ${response.status}`;

  return { success: false, invalidToken, reason };
}

// ---------------------------------------------------------------------------
// APNs helpers (iOS)
// ---------------------------------------------------------------------------

/** APNs reason strings that indicate a permanently invalid token */
const APNS_INVALID_TOKEN_REASONS = new Set([
  "BadDeviceToken",
  "Unregistered",
  "DeviceTokenNotForTopic",
]);

/**
 * Send a notification to a single iOS device via APNs HTTP/2 API.
 *
 * Returns `{ success: true }` on delivery, or
 * `{ success: false, invalidToken: boolean, reason: string }` on failure.
 */
async function sendApns(
  token: string,
  title: string,
  body: string,
): Promise<{ success: boolean; invalidToken?: boolean; reason?: string }> {
  const apnsKey = process.env.APNS_AUTH_KEY;
  const apnsKeyId = process.env.APNS_KEY_ID;
  const apnsTeamId = process.env.APNS_TEAM_ID;
  const apnsBundleId = process.env.APNS_BUNDLE_ID;

  if (!apnsKey || !apnsKeyId || !apnsTeamId || !apnsBundleId) {
    return { success: false, invalidToken: false, reason: "APNs credentials not configured" };
  }

  const isProduction = process.env.NODE_ENV === "production";
  const host = isProduction
    ? "https://api.push.apple.com"
    : "https://api.sandbox.push.apple.com";

  const payload = {
    aps: {
      alert: { title, body },
      sound: "default",
    },
  };

  let response: Response;
  try {
    response = await fetch(`${host}/3/device/${token}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `bearer ${apnsKey}`,
        "apns-push-type": "alert",
        "apns-topic": apnsBundleId,
      },
      body: JSON.stringify(payload),
    });
  } catch (err: any) {
    return { success: false, invalidToken: false, reason: err?.message ?? "network error" };
  }

  // APNs returns 200 on success with an empty body
  if (response.status === 200) {
    return { success: true };
  }

  let errorBody: any = {};
  try {
    errorBody = await response.json();
  } catch {
    // ignore parse errors
  }

  // APNs error shape: { reason: "BadDeviceToken" }
  const reason: string = errorBody?.reason ?? `HTTP ${response.status}`;
  const invalidToken = APNS_INVALID_TOKEN_REASONS.has(reason);

  return { success: false, invalidToken, reason };
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

/**
 * Dispatch a push notification to a single device token.
 *
 * - Routes to FCM for `platform === 'android'`, APNs for `platform === 'ios'`.
 * - On invalid-token error: deletes the token and writes a `failed` log entry.
 * - On platform rejection (notifications disabled): writes a `failed` log entry,
 *   does NOT retry.
 * - On success: writes a `sent` log entry.
 *
 * @param token      - The device token record to dispatch to.
 * @param title      - Resolved notification title.
 * @param body       - Resolved notification body.
 * @param triggerKey - The trigger key that caused this dispatch.
 * @param db         - DB adapter for token deletion and log writing.
 * @returns DispatchResult describing the outcome.
 */
export async function dispatchToToken(
  token: DeviceToken,
  title: string,
  body: string,
  triggerKey: string,
  db: DispatchDb,
): Promise<DispatchResult> {
  // Dispatch via the appropriate platform channel
  const result =
    token.platform === "android"
      ? await sendFcm(token.token, title, body)
      : await sendApns(token.token, title, body);

  if (result.success) {
    // Successful delivery — write sent log
    await db.writeLog({
      trigger_key: triggerKey,
      user_id: token.user_id,
      title,
      body,
      status: "sent",
      platform: token.platform,
    });

    return { user_id: token.user_id, platform: token.platform, status: "sent" };
  }

  // Delivery failed — determine if the token is stale/invalid
  if (result.invalidToken) {
    // Remove the stale token so it is not retried in future ticks
    await db.deleteToken(token.token);
  }

  // Write failed log regardless of whether the token was deleted
  const logEntry: NotificationLogEntry = {
    trigger_key: triggerKey,
    user_id: token.user_id,
    title,
    body,
    status: "failed",
    failure_reason: result.reason,
    platform: token.platform,
  };
  await db.writeLog(logEntry);

  return {
    user_id: token.user_id,
    platform: token.platform,
    status: "failed",
    failure_reason: result.reason,
  };
}
