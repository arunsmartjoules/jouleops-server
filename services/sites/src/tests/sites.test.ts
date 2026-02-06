import { describe, expect, it, mock, beforeEach } from "bun:test";
import request from "supertest";
import jwt from "jsonwebtoken";

// Set env vars BEFORE importing app
process.env.JWT_SECRET = "test-secret";
process.env.DATABASE_URL = "postgresql://localhost";
process.env.SUPABASE_URL = "https://test.supabase.co";

// Mock @smartops/shared
mock.module("@smartops/shared", () => ({
  queryOne: mock(() => Promise.resolve(null)),
  query: mock(() => Promise.resolve([])),
  sendError: mock((res: any, msg: string, opts: any) =>
    res.status(opts?.status || 400).json({ success: false, error: msg }),
  ),
  sendSuccess: mock((res: any, data: any, opts: any) =>
    res.status(opts?.status || 200).json({ success: true, data, ...opts }),
  ),
  errorHandler: (err: any, req: any, res: any, next: any) =>
    res.status(500).json({ success: false, error: err.message }),
  AppError: class extends Error {
    statusCode: number;
    constructor(msg: string, statusCode: number) {
      super(msg);
      this.statusCode = statusCode;
    }
  },
}));

import { app } from "../index.ts";
import { query, queryOne } from "@smartops/shared";

const TEST_TOKEN = jwt.sign(
  { user_id: "test-user", role: "admin", is_admin: true },
  "test-secret",
);

describe("Sites API", () => {
  beforeEach(() => {
    (query as any).mockClear();
    (queryOne as any).mockClear();
  });

  describe("GET /api/sites", () => {
    it("should return a list of sites with valid token", async () => {
      const mockSites = [{ id: "site-1", name: "Site One" }];
      (query as any).mockResolvedValueOnce(mockSites);

      const response = await request(app)
        .get("/api/sites")
        .set("Authorization", `Bearer ${TEST_TOKEN}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toEqual(mockSites);
    });

    it("should return 401 with no token", async () => {
      const response = await request(app).get("/api/sites");
      expect(response.status).toBe(401);
    });
  });

  describe("GET /health", () => {
    it("should return healthy status", async () => {
      const response = await request(app).get("/health");
      expect(response.status).toBe(200);
      expect(response.body.service).toBe("sites");
    });
  });
});
