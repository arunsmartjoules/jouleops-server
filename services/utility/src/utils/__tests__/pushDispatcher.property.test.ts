// Feature: push-notification-control, Property 7: Stale token removal on delivery failure

import { describe, test, expect, mock, beforeEach } from "bun:test";
import * as fc from "fast-check";
import { dispatchToToken } from "../pushDispatcher.ts";
import type { DeviceToken, DispatchDb } from "../pushDispatcher.ts";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const platformArb = fc.constantFrom<"android" | "ios">("android", "ios");

const deviceTokenArb: fc.Arbitrary<DeviceToken> = fc.record({
  user_id: fc.uuid(),
  token: fc.string({ minLength: 10, maxLength: 64 }).filter((s) => s.trim().length > 0),
  platform: platformArb,
});

const triggerKeyArb = fc.constantFrom(
  "punch_in",
  "punch_out",
  "complaint_open",
  "complaint_inprogress",
);

const titleArb = fc.string({ minLength: 1, maxLength: 80 });
const bodyArb = fc.string({ minLength: 1, maxLength: 200 });

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Patch the global `fetch` to simulate an FCM/APNs response.
 * Returns a cleanup function that restores the original fetch.
 */
function mockFetch(responseFactory: () => Response): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = async () => responseFactory();
  return () => {
    globalThis.fetch = original;
  };
}

/** Build a Response that looks like an FCM invalid-token error */
function fcmInvalidTokenResponse(): Response {
  return new Response(
    JSON.stringify({ error: { status: "UNREGISTERED", message: "Token not registered" } }),
    { status: 400, headers: { "Content-Type": "application/json" } },
  );
}

/** Build a Response that looks like an APNs invalid-token error */
function apnsInvalidTokenResponse(): Response {
  return new Response(
    JSON.stringify({ reason: "BadDeviceToken" }),
    { status: 400, headers: { "Content-Type": "application/json" } },
  );
}

/** Build a successful FCM response */
function fcmSuccessResponse(): Response {
  return new Response(
    JSON.stringify({ name: "projects/test/messages/12345" }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

/** Build a successful APNs response (empty body, status 200) */
function apnsSuccessResponse(): Response {
  return new Response(null, { status: 200 });
}

/** Return the appropriate invalid-token response for the given platform */
function invalidTokenResponse(platform: "android" | "ios"): Response {
  return platform === "android" ? fcmInvalidTokenResponse() : apnsInvalidTokenResponse();
}

/** Return the appropriate success response for the given platform */
function successResponse(platform: "android" | "ios"): Response {
  return platform === "android" ? fcmSuccessResponse() : apnsSuccessResponse();
}

// ---------------------------------------------------------------------------
// Environment setup — provide dummy credentials so the dispatcher doesn't
// short-circuit with "not configured" before reaching the fetch call.
// ---------------------------------------------------------------------------

beforeEach(() => {
  process.env.FCM_SERVER_KEY = "test-server-key";
  process.env.FCM_PROJECT_ID = "test-project";
  process.env.APNS_AUTH_KEY = "test-apns-key";
  process.env.APNS_KEY_ID = "test-key-id";
  process.env.APNS_TEAM_ID = "test-team-id";
  process.env.APNS_BUNDLE_ID = "com.test.app";
});

// ---------------------------------------------------------------------------
// Property 7: Stale token removal on delivery failure
// Validates: Requirements 5.3
// ---------------------------------------------------------------------------

describe("Property 7: Stale token removal on delivery failure", () => {
  test("when FCM/APNs returns an invalid-token error, deleteToken is called exactly once with the token value", async () => {
    await fc.assert(
      fc.asyncProperty(deviceTokenArb, triggerKeyArb, titleArb, bodyArb, async (deviceToken, triggerKey, title, body) => {
        const deletedTokens: string[] = [];
        const db: DispatchDb = {
          deleteToken: async (t) => { deletedTokens.push(t); },
          writeLog: async () => {},
        };

        const restore = mockFetch(() => invalidTokenResponse(deviceToken.platform));
        try {
          await dispatchToToken(deviceToken, title, body, triggerKey, db);
        } finally {
          restore();
        }

        expect(deletedTokens.length).toBe(1);
        expect(deletedTokens[0]).toBe(deviceToken.token);
      }),
      { numRuns: 100 },
    );
  });

  test("when FCM/APNs returns an invalid-token error, a failed log entry is written", async () => {
    await fc.assert(
      fc.asyncProperty(deviceTokenArb, triggerKeyArb, titleArb, bodyArb, async (deviceToken, triggerKey, title, body) => {
        const writtenLogs: any[] = [];
        const db: DispatchDb = {
          deleteToken: async () => {},
          writeLog: async (log) => { writtenLogs.push(log); },
        };

        const restore = mockFetch(() => invalidTokenResponse(deviceToken.platform));
        try {
          await dispatchToToken(deviceToken, title, body, triggerKey, db);
        } finally {
          restore();
        }

        expect(writtenLogs.length).toBe(1);
        expect(writtenLogs[0].status).toBe("failed");
        expect(writtenLogs[0].user_id).toBe(deviceToken.user_id);
        expect(writtenLogs[0].trigger_key).toBe(triggerKey);
      }),
      { numRuns: 100 },
    );
  });

  test("when dispatch succeeds, deleteToken is NOT called", async () => {
    await fc.assert(
      fc.asyncProperty(deviceTokenArb, triggerKeyArb, titleArb, bodyArb, async (deviceToken, triggerKey, title, body) => {
        const deletedTokens: string[] = [];
        const db: DispatchDb = {
          deleteToken: async (t) => { deletedTokens.push(t); },
          writeLog: async () => {},
        };

        const restore = mockFetch(() => successResponse(deviceToken.platform));
        try {
          await dispatchToToken(deviceToken, title, body, triggerKey, db);
        } finally {
          restore();
        }

        expect(deletedTokens.length).toBe(0);
      }),
      { numRuns: 100 },
    );
  });

  test("when dispatch succeeds, a sent log entry is written", async () => {
    await fc.assert(
      fc.asyncProperty(deviceTokenArb, triggerKeyArb, titleArb, bodyArb, async (deviceToken, triggerKey, title, body) => {
        const writtenLogs: any[] = [];
        const db: DispatchDb = {
          deleteToken: async () => {},
          writeLog: async (log) => { writtenLogs.push(log); },
        };

        const restore = mockFetch(() => successResponse(deviceToken.platform));
        try {
          await dispatchToToken(deviceToken, title, body, triggerKey, db);
        } finally {
          restore();
        }

        expect(writtenLogs.length).toBe(1);
        expect(writtenLogs[0].status).toBe("sent");
        expect(writtenLogs[0].user_id).toBe(deviceToken.user_id);
        expect(writtenLogs[0].trigger_key).toBe(triggerKey);
      }),
      { numRuns: 100 },
    );
  });
});
