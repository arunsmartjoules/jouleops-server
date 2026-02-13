/**
 * Attendance Service
 *
 * Handles attendance check-in/out and reporting.
 * Port: 3422
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
import attendanceRoutes from "./routes/attendance.ts";

const PORT = process.env.ATTENDANCE_PORT || 3422;

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
    service: "attendance",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database: db,
      redis: redis,
    },
  });
});

// Routes
app.use("/api/attendance", attendanceRoutes);

// 404 Handler
app.use((req: Request, _res: Response, next: NextFunction) => {
  next(
    new AppError(`Can't find ${req.originalUrl} on attendance service!`, 404),
  );
});

// Error Handler
app.use(errorHandler);

// Start Server
const server = app.listen(Number(PORT), "0.0.0.0", () => {
  logger.info(`SmartOps Attendance Service running on port ${PORT}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
});

// Graceful Shutdown
setupGracefulShutdown(server);
