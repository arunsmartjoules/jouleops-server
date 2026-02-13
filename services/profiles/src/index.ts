/**
 * Profiles Service
 *
 * Handles user profile management.
 * Port: 3426
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
} from "@smartops/shared";

// Import routes
import usersRoutes from "./routes/users.ts";

const PORT = process.env.PROFILES_PORT || 3426;

const app = express();

// Middleware
app.use(helmet());
app.use(correlationId);
app.use(express.json());

// Standardized Health check
app.get("/health", async (_req: Request, res: Response) => {
  const db = await dbHealthCheck();
  const status = db.connected ? 200 : 503;

  res.status(status).json({
    success: status === 200,
    service: "profiles",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database: db,
    },
  });
});

// Routes
app.use("/api/users", usersRoutes);

// 404 Handler
app.use((req: Request, _res: Response, next: NextFunction) => {
  next(new AppError(`Can't find ${req.originalUrl} on Profiles service!`, 404));
});

// Error Handler
app.use(errorHandler);

// Start Server
const server = app.listen(Number(PORT), "0.0.0.0", () => {
  logger.info(`SmartOps Profiles Service running on port ${PORT}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
  logger.info(`Routes: /api/users`);
});

// Graceful Shutdown
setupGracefulShutdown(server);
