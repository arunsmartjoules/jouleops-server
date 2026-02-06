/**
 * Attendance Service
 *
 * Handles attendance check-in/out and reporting.
 * Port: 3422
 */

import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";

import { errorHandler, AppError } from "@smartops/shared";

// Import routes
import attendanceRoutes from "./routes/attendance.ts";

const PORT = process.env.ATTENDANCE_PORT || 3422;

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
    service: "attendance",
    port: PORT,
    timestamp: new Date().toISOString(),
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
app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║              SmartOps Attendance Service                   ║
╠════════════════════════════════════════════════════════════╣
║  Service running on port ${PORT}                              ║
║  Health: http://localhost:${PORT}/health                      ║
╚════════════════════════════════════════════════════════════╝
  `);
});
