/**
 * Tickets Service
 *
 * Handles tickets/complaints CRUD operations.
 * Port: 3421
 */

import express from "express";
import helmet from "helmet";
import {
  errorHandler,
  AppError,
  correlationId,
  logger,
  setupGracefulShutdown,
  dbHealthCheck,
} from "@smartops/shared";

// Import routes (copied from monolith)
import complaintsRoutes from "./routes/complaints.ts";
import categoriesRoutes from "./routes/categories.ts";

const PORT = process.env.TICKETS_PORT || 3421;

const app = express();

// Middleware
app.use(helmet());
app.use(correlationId);
app.use(express.json());

// Standardized Health check
app.get("/health", async (_req, res) => {
  const db = await dbHealthCheck();
  const status = db.connected ? 200 : 503;

  res.status(status).json({
    success: status === 200,
    service: "tickets",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      database: db,
    },
  });
});

// Routes
app.use("/api/tickets", complaintsRoutes);
app.use("/api/complaints", complaintsRoutes);
app.use("/api/complaint-categories", categoriesRoutes);

// 404 Handler
app.use((req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on tickets service!`, 404));
});

// Error Handler
app.use(errorHandler);

// Start Server
const server = app.listen(Number(PORT), "0.0.0.0", () => {
  logger.info(`SmartOps Tickets Service running on port ${PORT}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
});

// Graceful Shutdown
setupGracefulShutdown(server);
