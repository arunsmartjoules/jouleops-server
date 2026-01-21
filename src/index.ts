import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import compression from "compression";

// Import routes
// Import routes
import authRoutes from "./routes/authRoutes.js";
import complaintsRoutes from "./routes/complaintsRoutes.js";
import usersRoutes from "./routes/usersRoutes.js";
import assetsRoutes from "./routes/assetsRoutes.js";
import sitesRoutes from "./routes/sitesRoutes.js";
import tasksRoutes from "./routes/tasksRoutes.js";
import attendanceRoutes from "./routes/attendanceRoutes.js";
import chillerReadingsRoutes from "./routes/chillerReadingsRoutes.js";
import pmChecklistRoutes from "./routes/pmChecklistRoutes.js";
import pmInstancesRoutes from "./routes/pmInstancesRoutes.js";
import logsRoutes from "./routes/logsRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import siteUsersRoutes from "./routes/siteUsersRoutes.js";
import complaintCategoryRoutes from "./routes/complaintCategoryRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import whatsappRoutes from "./routes/whatsappRoutes.js";
import systemRoutes from "./routes/systemRoutes.js";
import importRoutes from "./routes/importRoutes.js";
// import { startNotificationScheduler } from "./utils/scheduler.js"; // Removed in Week 3 cleanup
import { initAttendanceReminders } from "./jobs/attendanceReminderJob.js";

dotenv.config();

const app = express();
app.use(compression());
app.use(cors());
app.use(helmet());
app.use(morgan("combined"));
app.use(express.json());
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5000,
    message: {
      success: false,
      error: "Too many requests, please try again later.",
    },
  }),
);

// Mount routes
app.use("/api/auth", authRoutes);
app.use("/api/complaints", complaintsRoutes);
app.use("/api/tickets", complaintsRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/assets", assetsRoutes);
app.use("/api/sites", sitesRoutes);
app.use("/api/tasks", tasksRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/chiller-readings", chillerReadingsRoutes);
app.use("/api/pm-checklist", pmChecklistRoutes);
app.use("/api/pm-instances", pmInstancesRoutes);
app.use("/api/logs", logsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/site-users", siteUsersRoutes);
app.use("/api/complaint-categories", complaintCategoryRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/whatsapp", whatsappRoutes);
app.use("/api/system", systemRoutes);
app.use("/api/import", importRoutes);

app.get("/ping", (req, res) => {
  res.json({
    success: true,
    message: "pong",
    timestamp: new Date().toISOString(),
  });
});

// Health check endpoint for monitoring
app.get("/api/health", async (req, res) => {
  const startTime = Date.now();

  try {
    // Check database connectivity by importing supabase and doing a simple query
    const { createClient } = await import("@supabase/supabase-js");
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Simple database check
    const { error } = await supabase.from("users").select("user_id").limit(1);
    const dbStatus = error ? "error" : "connected";

    const responseTime = Date.now() - startTime;
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();

    res.json({
      success: true,
      status: dbStatus === "connected" ? "healthy" : "degraded",
      server: {
        status: "online",
        uptime: Math.floor(uptime),
        uptimeFormatted: formatUptime(uptime),
        responseTime: responseTime,
      },
      database: {
        status: dbStatus,
        error: error?.message || null,
      },
      memory: {
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.json({
      success: false,
      status: "unhealthy",
      server: {
        status: "online",
        uptime: Math.floor(process.uptime()),
        responseTime: Date.now() - startTime,
      },
      database: {
        status: "error",
        error: error.message,
      },
      timestamp: new Date().toISOString(),
    });
  }
});

// Helper function to format uptime
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

app.get("/", (req, res) => {
  res.send("Hello World!");
});

// 404 Handler
app.use((req, res, next) => {
  res.status(404).json({ success: false, error: "Route not found" });
});

// Global Error Handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: err.message || "Internal Server Error",
  });
});

const port = Number(process.env.PORT) || 3420;
const host = "0.0.0.0"; // Listen on all interfaces for Android emulator access

app.listen(port, host, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║           SmartOps HVAC Operations Management API          ║
╠════════════════════════════════════════════════════════════╣
║  Server running on port ${port}                               ║
║  Listening on: ${host}:${port}                               ║
║  Health check: http://localhost:${port}/health                ║
║  Android: http://10.0.2.2:${port}                            ║
╚════════════════════════════════════════════════════════════╝
    `);

  // Start attendance reminder jobs
  initAttendanceReminders();
});
