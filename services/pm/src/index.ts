/**
 * PM Service (Preventive Maintenance)
 *
 * Handles checklists, instances, and tasks.
 * Port: 3424
 */

import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";

import { errorHandler, AppError } from "@smartops/shared";

// Import routes
import pmChecklistRoutes from "./routes/pmChecklist.ts";
import pmInstancesRoutes from "./routes/pmInstances.ts";
import tasksRoutes from "./routes/tasks.ts";

const PORT = process.env.PM_PORT || 3424;

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
    service: "pm",
    port: PORT,
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use("/api/pm-checklists", pmChecklistRoutes);
app.use("/api/pm-instances", pmInstancesRoutes);
app.use("/api/tasks", tasksRoutes);

// 404 Handler
app.use((req: Request, _res: Response, next: NextFunction) => {
  next(new AppError(`Can't find ${req.originalUrl} on PM service!`, 404));
});

// Error Handler
app.use(errorHandler);

// Start Server
app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║              SmartOps PM Service                           ║
╠════════════════════════════════════════════════════════════╣
║  Service running on port ${PORT}                              ║
║  Health: http://localhost:${PORT}/health                      ║
║  Routes: /api/pm-checklists, /api/pm-instances, /api/tasks  ║
╚════════════════════════════════════════════════════════════╝
  `);
});
