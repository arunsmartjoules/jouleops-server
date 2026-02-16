/**
 * SiteLogs Service
 *
 * Handles site log entries and chiller readings.
 * Port: 3423
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
} from "@jouleops/shared";

// Import routes
import siteLogsRoutes from "./routes/siteLogs.ts";
import chillerReadingsRoutes from "./routes/chillerReadings.ts";

const PORT = process.env.SITELOGS_PORT || 3423;

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
    service: "sitelogs",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database: db,
    },
  });
});

// Routes
app.use("/api/site-logs", siteLogsRoutes);
app.use("/api/chiller-readings", chillerReadingsRoutes);

// 404 Handler
app.use((req: Request, _res: Response, next: NextFunction) => {
  next(new AppError(`Can't find ${req.originalUrl} on SiteLogs service!`, 404));
});

// Error Handler
app.use(errorHandler);

// Start Server
const server = app.listen(Number(PORT), "0.0.0.0", () => {
  logger.info(`JouleOps SiteLogs Service running on port ${PORT}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
  logger.info(`Routes available: /api/site-logs, /api/chiller-readings`);
});

// Graceful Shutdown
setupGracefulShutdown(server);
