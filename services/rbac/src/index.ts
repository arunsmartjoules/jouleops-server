/**
 * RBAC Service
 *
 * Handles authentication, authorization, and user-site permissions.
 * Port: 3425
 */

import express from "express";
import type { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import {
  errorHandler,
  AppError,
  correlationId,
  logger,
  setupGracefulShutdown,
  dbHealthCheck,
  redisHealthCheck,
} from "@smartops/shared";

// Import routes
import authRoutes from "./routes/auth.ts";
import adminRoutes from "./routes/admin.ts";
import siteUsersRoutes from "./routes/siteUsers.ts";
import sitesRoutes from "./routes/sites.ts";
import assetsRoutes from "./routes/assets.ts";

const PORT = process.env.RBAC_PORT || 3425;

const app = express();

// Middleware
app.use(helmet());
app.use(correlationId);
app.use(express.json());

// Standardized Health check
app.get("/health", async (_req: Request, res: Response) => {
  const [db, redis] = await Promise.all([dbHealthCheck(), redisHealthCheck()]);
  const status = db.connected && redis.connected ? 200 : 503;

  res.status(status).json({
    success: status === 200,
    service: "rbac",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database: db,
      redis: redis,
    },
  });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/site-users", siteUsersRoutes);
app.use("/api/sites", sitesRoutes);
app.use("/api/assets", assetsRoutes);

// 404 Handler
app.use((req: Request, _res: Response, next: NextFunction) => {
  next(new AppError(`Can't find ${req.originalUrl} on RBAC service!`, 404));
});

// Error Handler
app.use(errorHandler);

// Export app for testing
export { app };

// Start Server
if (import.meta.main) {
  const server = app.listen(Number(PORT), "0.0.0.0", () => {
    logger.info(`SmartOps RBAC Service running on port ${PORT}`);
    logger.info(`Health check: http://localhost:${PORT}/health`);
    logger.info(
      `Routes: /api/auth, /api/admin, /api/site-users, /api/sites, /api/assets`,
    );
  });

  // Graceful Shutdown
  setupGracefulShutdown(server);
}
