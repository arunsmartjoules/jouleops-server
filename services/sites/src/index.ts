/**
 * Sites Service
 *
 * Handles sites and assets management.
 * Port: 3427
 */

import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import compression from "compression";

import { errorHandler, AppError } from "@smartops/shared";

// Import routes
import sitesRoutes from "./routes/sites.ts";
import assetsRoutes from "./routes/assets.ts";

const PORT = process.env.SITES_PORT || 3427;

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
    service: "sites",
    port: PORT,
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use("/api/sites", sitesRoutes);
app.use("/api/assets", assetsRoutes);

// 404 Handler
app.use((req: Request, _res: Response, next: NextFunction) => {
  next(new AppError(`Can't find ${req.originalUrl} on Sites service!`, 404));
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
║              SmartOps Sites Service                        ║
╠════════════════════════════════════════════════════════════╣
║  Service running on port ${PORT}                              ║
║  Health: http://localhost:${PORT}/health                      ║
║  Routes: /api/sites, /api/assets                            ║
╚════════════════════════════════════════════════════════════╝
    `);
  });
}
