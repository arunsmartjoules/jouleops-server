/**
 * PM Service (Preventive Maintenance)
 *
 * Handles checklists, instances, and tasks.
 * Port: 3424
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
import pmChecklistRoutes from "./routes/pmChecklist.ts";
import pmInstancesRoutes from "./routes/pmInstances.ts";
import tasksRoutes from "./routes/tasks.ts";

const PORT = process.env.PM_PORT || 3424;

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
    service: "pm",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database: db,
    },
  });
});

// Routes
app.use("/api/pm-checklists", pmChecklistRoutes);
app.use("/api/pm-checklist", pmChecklistRoutes);
app.use("/api/pm-instances", pmInstancesRoutes);
app.use("/api/tasks", tasksRoutes);

// 404 Handler
app.use((req: Request, _res: Response, next: NextFunction) => {
  next(new AppError(`Can't find ${req.originalUrl} on PM service!`, 404));
});

// Error Handler
app.use(errorHandler);

// Start Server
if (import.meta.main) {
  const server = app.listen(Number(PORT), "0.0.0.0", () => {
    logger.info(`JouleOps PM Service running on port ${PORT}`);
    logger.info(`Health check: http://localhost:${PORT}/health`);
    logger.info(`Routes: /api/pm-checklists, /api/pm-instances, /api/tasks`);
  });

  server.timeout = 300000;
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;

  // Graceful Shutdown
  setupGracefulShutdown(server);
}
