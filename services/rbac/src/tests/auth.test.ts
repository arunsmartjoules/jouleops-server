process.env.DATABASE_URL =
  "postgresql://postgres:password@localhost:5432/postgres";
process.env.JWT_SECRET = "test-secret";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";

import { describe, expect, it, mock } from "bun:test";

// Mock the shared database functions BEFORE any other imports
mock.module("@smartops/shared", () => ({
  queryOne: mock(() => Promise.resolve(null)),
  query: mock(() => Promise.resolve([])),
  sendError: mock((res, msg, opts) =>
    res.status(opts?.status || 400).json({ success: false, error: msg }),
  ),
  sendSuccess: mock((res, data, opts) =>
    res.status(opts?.status || 200).json({ success: true, data, ...opts }),
  ),
  errorHandler: mock((err, req, res, next) => next()), // Simple passthrough for test
  AppError: class extends Error {
    statusCode: number;
    constructor(msg: string, statusCode: number) {
      super(msg);
      this.statusCode = statusCode;
    }
  },
}));

import request from "supertest";
import { app } from "../index.ts";

describe("RBAC Auth API", () => {
  describe("POST /api/auth/login", () => {
    it("should return 400 if email or password missing", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({ email: "test@example.com" });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("required");
    });

    it("should return 401 if user not found", async () => {
      // Import the mocked queryOne to set return value
      const { queryOne } = await import("@smartops/shared");
      (queryOne as any).mockResolvedValueOnce(null);

      const response = await request(app)
        .post("/api/auth/login")
        .send({ email: "nonexistent@example.com", password: "password123" });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain("Invalid email or password");
    });
  });

  describe("GET /health", () => {
    it("should return 200 and healthy status", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.service).toBe("rbac");
    });
  });
});
