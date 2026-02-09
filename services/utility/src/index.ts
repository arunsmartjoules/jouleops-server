/**
 * Utility Service
 *
 * Consolidated service for messaging (Email, WhatsApp, Notifications).
 * Port: 3428
 */

import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";

import { errorHandler, AppError } from "@smartops/shared";

// Import routes
import emailRoutes from "./routes/email.ts";
import whatsappRoutes from "./routes/whatsapp.ts";
import notificationRoutes from "./routes/notifications.ts";

// Import jobs
import { initAttendanceReminders } from "./jobs/attendanceReminderJob.ts";

const PORT = process.env.UTILITY_PORT || 3428;

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
    service: "utility",
    port: PORT,
    timestamp: new Date().toISOString(),
    modules: ["email", "whatsapp", "notifications"],
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
app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║              SmartOps Utility Service                      ║
╠════════════════════════════════════════════════════════════╣
║  Service running on port ${PORT}                              ║
║  Health: http://localhost:${PORT}/health                      ║
║  Routes: /api/email, /api/whatsapp, /api/notifications       ║
╚════════════════════════════════════════════════════════════╝
  `);

  // Initialize attendance reminders (previously in notifications service)
  try {
    initAttendanceReminders();
  } catch (error) {
    console.error("Failed to initialize attendance reminders:", error);
  }
});
