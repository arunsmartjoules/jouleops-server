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
} from "@jouleops/shared";

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
app.use("/api/complaint_category", categoriesRoutes);

// 404 Handler
app.use((req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on tickets service!`, 404));
});

// Error Handler
app.use(errorHandler);

// Start Server
const server = app.listen(Number(PORT), "0.0.0.0", () => {
  logger.info(`JouleOps Tickets Service running on port ${PORT}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
});

server.timeout = 300000;
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

// Graceful Shutdown
setupGracefulShutdown(server);
