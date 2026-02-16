/**
 * Utility Service
 *
 * Consolidated service for messaging (Email, WhatsApp, Notifications).
 * Port: 3428
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
} from "@jouleops/shared";

// Import routes
import emailRoutes from "./routes/email.ts";
import whatsappRoutes from "./routes/whatsapp.ts";
import notificationRoutes from "./routes/notifications.ts";

// Import jobs
import { initAttendanceReminders } from "./jobs/attendanceReminderJob.ts";

const PORT = process.env.UTILITY_PORT || 3428;

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
    service: "utility",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database: db,
      redis: redis,
    },
  });
});

// Routes
app.use("/api/email", emailRoutes);
app.use("/api/whatsapp", whatsappRoutes);
app.use("/api/notifications", notificationRoutes);

// 404 Handler
app.use((req: Request, _res: Response, next: NextFunction) => {
  next(new AppError(`Can't find ${req.originalUrl} on Utility service!`, 404));
});

// Error Handler
app.use(errorHandler);

// Start Server
const server = app.listen(Number(PORT), "0.0.0.0", () => {
  logger.info(`JouleOps Utility Service running on port ${PORT}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
  logger.info(`Routes: /api/email, /api/whatsapp, /api/notifications`);

  // Initialize attendance reminders
  try {
    initAttendanceReminders();
  } catch (error) {
    logger.error("Failed to initialize attendance reminders", { error });
  }
});

// Graceful Shutdown
setupGracefulShutdown(server);
