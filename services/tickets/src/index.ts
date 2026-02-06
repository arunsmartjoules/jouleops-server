/**
 * Tickets Service
 *
 * Handles tickets/complaints CRUD operations.
 * Port: 3421
 */

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";

import { errorHandler, AppError } from "@smartops/shared";

// Import routes (copied from monolith)
import complaintsRoutes from "./routes/complaints.ts";
import categoriesRoutes from "./routes/categories.ts";

const PORT = process.env.TICKETS_PORT || 3421;

const app = express();

// Middleware
app.use(compression());
app.use(cors());
app.use(helmet());
app.use(morgan("combined"));
app.use(express.json());

// Health check
app.get("/health", (req, res) => {
  res.json({
    success: true,
    service: "tickets",
    port: PORT,
    timestamp: new Date().toISOString(),
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
app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║              SmartOps Tickets Service                      ║
╠════════════════════════════════════════════════════════════╣
║  Service running on port ${PORT}                              ║
║  Health: http://localhost:${PORT}/health                      ║
╚════════════════════════════════════════════════════════════╝
  `);
});
