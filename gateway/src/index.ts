/**
 * SmartOps API Gateway
 *
 * Central entry point for all microservices.
 * Handles authentication, routing, and rate limiting.
 */

import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { createProxyMiddleware } from "http-proxy-middleware";

import { errorHandler, AppError } from "@smartops/shared";

// Environment config (inherit from root .env.local)
const PORT = process.env.GATEWAY_PORT || 3420;

// Service registry - ports for each service
const SERVICES = {
  tickets: process.env.TICKETS_SERVICE_URL || "http://localhost:3421",
  attendance: process.env.ATTENDANCE_SERVICE_URL || "http://localhost:3422",
  sitelogs: process.env.SITELOGS_SERVICE_URL || "http://localhost:3423",
  pm: process.env.PM_SERVICE_URL || "http://localhost:3424",
  rbac: process.env.RBAC_SERVICE_URL || "http://localhost:3425",
  profiles: process.env.PROFILES_SERVICE_URL || "http://localhost:3426",
  utility: process.env.UTILITY_SERVICE_URL || "http://localhost:3428",
};

const app = express();

// Global Middleware
app.use(compression());
app.use(cors());
app.use(helmet());
app.use(morgan("combined"));
app.use(express.json());

// Rate Limiting
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5000,
    message: { success: false, error: "Too many requests" },
  }),
);

// Health Check
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    success: true,
    gateway: "online",
    timestamp: new Date().toISOString(),
    services: [
      "tickets",
      "attendance",
      "sitelogs",
      "pm",
      "rbac",
      "profiles",
      "utility",
    ],
  });
});

// Ping
app.get("/ping", (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: "pong",
    timestamp: new Date().toISOString(),
  });
});

// =============================================================================
// Route Proxies (when services are running independently)
// =============================================================================

// Tickets Service Routes
app.use(
  "/api/tickets",
  createProxyMiddleware({ target: SERVICES.tickets, changeOrigin: true }),
);
app.use(
  "/api/complaints",
  createProxyMiddleware({ target: SERVICES.tickets, changeOrigin: true }),
);
app.use(
  "/api/complaint-categories",
  createProxyMiddleware({ target: SERVICES.tickets, changeOrigin: true }),
);

// Attendance Service Routes
app.use(
  "/api/attendance",
  createProxyMiddleware({ target: SERVICES.attendance, changeOrigin: true }),
);

// RBAC Service Routes (Auth, Admin, Site Users, Sites, Assets)
app.use(
  "/api/auth",
  createProxyMiddleware({ target: SERVICES.rbac, changeOrigin: true }),
);
app.use(
  "/api/admin",
  createProxyMiddleware({ target: SERVICES.rbac, changeOrigin: true }),
);
app.use(
  "/api/site-users",
  createProxyMiddleware({ target: SERVICES.rbac, changeOrigin: true }),
);
app.use(
  "/api/sites",
  createProxyMiddleware({ target: SERVICES.rbac, changeOrigin: true }),
);
app.use(
  "/api/assets",
  createProxyMiddleware({ target: SERVICES.rbac, changeOrigin: true }),
);

// Profiles Service Routes
app.use(
  "/api/users",
  createProxyMiddleware({ target: SERVICES.profiles, changeOrigin: true }),
);

// SiteLogs Service Routes
app.use(
  "/api/site-logs",
  createProxyMiddleware({ target: SERVICES.sitelogs, changeOrigin: true }),
);
app.use(
  "/api/chiller-readings",
  createProxyMiddleware({ target: SERVICES.sitelogs, changeOrigin: true }),
);

// PM Service Routes
app.use(
  "/api/pm-checklists",
  createProxyMiddleware({ target: SERVICES.pm, changeOrigin: true }),
);
app.use(
  "/api/pm-instances",
  createProxyMiddleware({ target: SERVICES.pm, changeOrigin: true }),
);
app.use(
  "/api/pm-checklist",
  createProxyMiddleware({ target: SERVICES.pm, changeOrigin: true }),
);
app.use(
  "/api/tasks",
  createProxyMiddleware({ target: SERVICES.pm, changeOrigin: true }),
);

// Utility Service Routes (WhatsApp, Notifications, Email)
app.use(
  "/api/whatsapp",
  createProxyMiddleware({ target: SERVICES.utility, changeOrigin: true }),
);
app.use(
  "/api/notifications",
  createProxyMiddleware({ target: SERVICES.utility, changeOrigin: true }),
);
app.use(
  "/api/email",
  createProxyMiddleware({ target: SERVICES.utility, changeOrigin: true }),
);

// =============================================================================
// Fallback: Proxy to monolith for non-migrated routes
// =============================================================================

const MONOLITH_URL = process.env.MONOLITH_URL || "http://localhost:3400";

app.use(
  "/api",
  createProxyMiddleware({
    target: MONOLITH_URL,
    changeOrigin: true,
    pathRewrite: { "^/api": "/api" },
  }),
);

// 404 Handler
app.use((req: Request, _res: Response, next: NextFunction) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Error Handler
app.use(errorHandler);

// Start Server
app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║              SmartOps API Gateway                          ║
╠════════════════════════════════════════════════════════════╣
║  Gateway running on port ${PORT}                              ║
║  Proxying to monolith: ${MONOLITH_URL}                     
║  Health: http://localhost:${PORT}/health                      ║
╚════════════════════════════════════════════════════════════╝
  `);
});
