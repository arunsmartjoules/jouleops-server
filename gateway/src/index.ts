/**
 * JouleOps API Gateway
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

import {
  errorHandler,
  AppError,
  correlationId,
  logger,
  setupGracefulShutdown,
  dbHealthCheck,
  redisHealthCheck,
} from "@jouleops/shared";

// Environment config
const PORT = process.env.GATEWAY_PORT || 3420;
const NODE_ENV = process.env.NODE_ENV || "development";

// Service registry
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
app.set("trust proxy", 1);

// Middleware
app.use(correlationId);
app.use(compression());
app.use(cors());
app.use(helmet());

if (NODE_ENV === "development") {
  app.use(morgan("dev"));
}

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5000,
    message: { success: false, error: "Too many requests" },
  }),
);

// Standardized Health check
app.get("/health", async (_req, res) => {
  const [db, redis] = await Promise.all([dbHealthCheck(), redisHealthCheck()]);
  const status = db.connected && redis.connected ? 200 : 503;

  res.status(status).json({
    success: status === 200,
    service: "gateway",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database: db,
      redis: redis,
    },
  });
});

app.get("/ping", (_req, res) => {
  res.json({
    success: true,
    message: "pong",
    timestamp: new Date().toISOString(),
  });
});

// Proxies
const proxyOptions = (target: string, prefix: string) => ({
  target,
  pathFilter: `${prefix}`,
  changeOrigin: true,
  proxyTimeout: 300000, // 5 minutes
  timeout: 300000, // 5 minutes
  onProxyReq: (proxyReq: any, req: any) => {
    if (req.requestId) {
      proxyReq.setHeader("X-Request-Id", req.requestId);
    }
    logger.info(
      `[Proxy] ${req.method} ${req.originalUrl} -> ${proxyReq.protocol}//${proxyReq.host}${proxyReq.path}`,
      {
        requestId: req.requestId,
        service: target,
      },
    );
  },
  onError: (err: any, req: any, res: any) => {
    logger.error(`[Proxy Error] ${req.method} ${req.url} -> ${err.message}`, {
      requestId: req.requestId,
      error: err,
    });

    // Align with shared/src/middleware/errorHandler.ts format
    res.status(502).json({
      success: false,
      status: "fail",
      error: "Service unreachable",
      ...(NODE_ENV === "development" && {
        message: err.message,
        stack: err.stack,
      }),
    });
  },
});

app.use(createProxyMiddleware(proxyOptions(SERVICES.tickets, "/api/tickets")));
app.use(
  createProxyMiddleware(proxyOptions(SERVICES.tickets, "/api/complaints")),
);
app.use(
  createProxyMiddleware(
    proxyOptions(SERVICES.tickets, "/api/complaint_category"),
  ),
);
app.use(
  createProxyMiddleware(proxyOptions(SERVICES.attendance, "/api/attendance")),
);
app.use(createProxyMiddleware(proxyOptions(SERVICES.rbac, "/api/auth")));
app.use(createProxyMiddleware(proxyOptions(SERVICES.rbac, "/api/admin")));
app.use(createProxyMiddleware(proxyOptions(SERVICES.rbac, "/api/site-users")));
app.use(createProxyMiddleware(proxyOptions(SERVICES.rbac, "/api/sites")));
app.use(createProxyMiddleware(proxyOptions(SERVICES.rbac, "/api/assets")));
app.use(createProxyMiddleware(proxyOptions(SERVICES.rbac, "/api/logs")));
app.use(createProxyMiddleware(proxyOptions(SERVICES.profiles, "/api/users")));
app.use(
  createProxyMiddleware(proxyOptions(SERVICES.sitelogs, "/api/site-logs")),
);
app.use(
  createProxyMiddleware(
    proxyOptions(SERVICES.sitelogs, "/api/chiller-readings"),
  ),
);
app.use(createProxyMiddleware(proxyOptions(SERVICES.pm, "/api/pm-checklists")));
app.use(createProxyMiddleware(proxyOptions(SERVICES.pm, "/api/pm-instances")));
app.use(createProxyMiddleware(proxyOptions(SERVICES.pm, "/api/pm-checklist")));
app.use(createProxyMiddleware(proxyOptions(SERVICES.pm, "/api/tasks")));
app.use(createProxyMiddleware(proxyOptions(SERVICES.utility, "/api/whatsapp")));
app.use(
  createProxyMiddleware(proxyOptions(SERVICES.utility, "/api/notifications")),
);
app.use(createProxyMiddleware(proxyOptions(SERVICES.utility, "/api/email")));

app.use(express.json());

const MONOLITH_URL = process.env.MONOLITH_URL || "http://localhost:3400";
app.use(
  "/api",
  createProxyMiddleware({
    target: MONOLITH_URL,
    changeOrigin: true,
    pathRewrite: { "^/api": "/api" },
  }),
);

app.use((req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

app.use(errorHandler);

const server = app.listen(Number(PORT), "0.0.0.0", () => {
  logger.info(`JouleOps API Gateway running on port ${PORT}`);
  logger.info(`Proxying to monolith: ${MONOLITH_URL}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
});

server.setMaxListeners(50); // Increase limit to resolve MaxListenersExceededWarning from many proxies
server.timeout = 300000; // 5 minutes

server.keepAliveTimeout = 65000; // Slightly more than standard ALBs (60s)
server.headersTimeout = 66000;

setupGracefulShutdown(server);
