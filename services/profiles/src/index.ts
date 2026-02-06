/**
 * Profiles Service
 *
 * Handles user profile management.
 * Port: 3426
 */

import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";

import { errorHandler, AppError } from "@smartops/shared";

// Import routes
import usersRoutes from "./routes/users.ts";

const PORT = process.env.PROFILES_PORT || 3426;

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
    service: "profiles",
    port: PORT,
    timestamp: new Date().toISOString(),
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
app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║              SmartOps Profiles Service                     ║
╠════════════════════════════════════════════════════════════╣
║  Service running on port ${PORT}                              ║
║  Health: http://localhost:${PORT}/health                      ║
║  Routes: /api/users                                        ║
╚════════════════════════════════════════════════════════════╝
  `);
});
