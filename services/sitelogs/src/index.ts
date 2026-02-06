/**
 * SiteLogs Service
 *
 * Handles site log entries and chiller readings.
 * Port: 3423
 */

import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";

import { errorHandler, AppError } from "@smartops/shared";

// Import routes
import siteLogsRoutes from "./routes/siteLogs.ts";
import chillerReadingsRoutes from "./routes/chillerReadings.ts";

const PORT = process.env.SITELOGS_PORT || 3423;

const app = express();

// Middleware
app.use(compression());
app.use(cors());
app.use(helmet());
app.use(morgan("combined"));
app.use(express.json());

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    success: true,
    service: "sitelogs",
    port: PORT,
    timestamp: new Date().toISOString(),
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
app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║              SmartOps SiteLogs Service                     ║
╠════════════════════════════════════════════════════════════╣
║  Service running on port ${PORT}                              ║
║  Health: http://localhost:${PORT}/health                      ║
║  Routes: /api/site-logs, /api/chiller-readings              ║
╚════════════════════════════════════════════════════════════╝
  `);
});
