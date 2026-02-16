process.env.DATABASE_URL =
  "postgresql://postgres:password@localhost:5432/postgres";
process.env.JWT_SECRET = "test-secret";
process.env.SUPABASE_URL = "https://placeholder.supabase.co";

import { describe, expect, it, mock } from "bun:test";

// Mock the shared database functions BEFORE any other imports
mock.module("@jouleops/shared", () => {
  const { z } = require("zod");
  const AppError = class extends Error {
    statusCode: number;
    status: string;
    constructor(msg: string, statusCode: number) {
      super(msg);
      this.statusCode = statusCode;
      this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    }
  };

  return {
    queryOne: mock(() => Promise.resolve(null)),
    query: mock(() => Promise.resolve([])),
    sendError: mock((res, msg, opts) =>
      res.status(opts?.status || 400).json({ success: false, error: msg }),
    ),
    sendSuccess: mock((res, data, opts) =>
      res.status(opts?.status || 200).json({ success: true, data, ...opts }),
    ),
    errorHandler: mock((err, req, res, next) => {
      const statusCode = err.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        error: err.message,
      });
    }),
    AppError,
    validate: (schema: any) => (req: any, res: any, next: any) => {
      try {
        schema.parse(req.body);
        next();
      } catch (err: any) {
        next(new AppError(`Validation failed: ${err.message}`, 400));
      }
    },
    loginSchema: z.object({
      email: z.string().email(),
      password: z.string().min(6),
    }),
    dbHealthCheck: mock(() => Promise.resolve({ connected: true, latency: 5 })),
    redisHealthCheck: mock(() =>
      Promise.resolve({ connected: true, latency: 5 }),
    ),
    correlationId: (req: any, res: any, next: any) => next(),
    logger: {
      info: mock(() => {}),
      error: mock(() => {}),
      warn: mock(() => {}),
    },
  };
});

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
      expect(response.body.error).toContain("password");
    });

    it("should return 401 if user not found", async () => {
      // Import the mocked queryOne to set return value
      const { queryOne } = await import("@jouleops/shared");
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
