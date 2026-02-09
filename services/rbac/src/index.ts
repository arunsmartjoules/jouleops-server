/**
 * RBAC Service
 *
 * Handles authentication, authorization, and user-site permissions.
 * Port: 3425
 */

import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";

import { errorHandler, AppError } from "@smartops/shared";

// Import routes
import authRoutes from "./routes/auth.ts";
import adminRoutes from "./routes/admin.ts";
import siteUsersRoutes from "./routes/siteUsers.ts";
import sitesRoutes from "./routes/sites.ts";
import assetsRoutes from "./routes/assets.ts";

const PORT = process.env.RBAC_PORT || 3425;

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
    service: "rbac",
    port: PORT,
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/site-users", siteUsersRoutes);
app.use("/api/sites", sitesRoutes);
app.use("/api/assets", assetsRoutes);

// 404 Handler
app.use((req: Request, _res: Response, next: NextFunction) => {
  next(new AppError(`Can't find ${req.originalUrl} on RBAC service!`, 404));
});

// Error Handler
app.use(errorHandler);

// Export app for testing
export { app };

// Start Server
if (import.meta.main) {
  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║              SmartOps RBAC Service                         ║
╠════════════════════════════════════════════════════════════╣
║  Service running on port ${PORT}                              ║
║  Health: http://localhost:${PORT}/health                      ║
║  Routes: /api/auth, /api/admin, /api/site-users,            ║
║          /api/sites, /api/assets                            ║
╚════════════════════════════════════════════════════════════╝
    `);
  });
}
