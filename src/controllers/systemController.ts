import os from "os";

// In-memory log buffer for "Log Observatory"
const logBuffer: any[] = [];
const MAX_LOGS = 50;

/**
 * Add a log entry to the buffer
 */
export const addSystemLog = (
  level: "info" | "warn" | "error",
  message: string,
  service: string,
) => {
  logBuffer.unshift({
    timestamp: new Date().toISOString(),
    level,
    message,
    service,
  });
  if (logBuffer.length > MAX_LOGS) logBuffer.pop();
};

// Initial logs
addSystemLog("info", "System metrics probe initialized", "Monitoring");
addSystemLog("info", "Pillar 5: Server Command Center live", "System");

/**
 * Mock health checks for Service Matrix
 */
const getServiceStatus = async () => {
  return [
    { name: "PostgreSQL", status: "healthy", latency: "2ms", icon: "Database" },
    { name: "Redis Cache", status: "healthy", latency: "1ms", icon: "Zap" },
    {
      name: "WhatsApp Gateway",
      status: "degraded",
      latency: "1.5s",
      icon: "MessageSquare",
    },
    {
      name: "Supabase Auth",
      status: "healthy",
      latency: "120ms",
      icon: "Lock",
    },
    {
      name: "Storage Bucket",
      status: "healthy",
      latency: "45ms",
      icon: "HardDrive",
    },
  ];
};

export const getMetrics = async (req: any, res: any) => {
  try {
    const cpus = os.cpus();
    const loadAvg = os.loadavg();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const uptime = os.uptime();

    const cpuUsage =
      cpus
        .map((cpu) => {
          const total = Object.values(cpu.times).reduce(
            (acc, tv) => acc + tv,
            0,
          );
          const idle = cpu.times.idle;
          return ((total - idle) / total) * 100;
        })
        .reduce((a, b) => a + b) / cpus.length;

    const memoryUsage = {
      total: totalMem,
      free: freeMem,
      used: totalMem - freeMem,
      percentage: ((totalMem - freeMem) / totalMem) * 100,
    };

    const processMemory = process.memoryUsage();
    const services = await getServiceStatus();

    res.json({
      success: true,
      data: {
        system: {
          platform: os.platform(),
          release: os.release(),
          uptime: uptime,
          loadAvg: loadAvg,
          cpuUsage: Math.round(cpuUsage * 100) / 100,
          memory: {
            ...memoryUsage,
            usedMb: Math.round((memoryUsage.used / 1024 / 1024) * 100) / 100,
            totalMb: Math.round((memoryUsage.total / 1024 / 1024) * 100) / 100,
          },
        },
        process: {
          uptime: process.uptime(),
          version: process.version,
          memory: {
            rss: Math.round(processMemory.rss / 1024 / 1024),
            heapTotal: Math.round(processMemory.heapTotal / 1024 / 1024),
            heapUsed: Math.round(processMemory.heapUsed / 1024 / 1024),
          },
        },
        services,
        logs: logBuffer,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("Get metrics error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export default {
  getMetrics,
  addSystemLog,
};
