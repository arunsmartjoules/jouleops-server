import { logger } from "./logger.ts";
import { closePool } from "../lib/db.ts";
import { closeRedis } from "../lib/redis.ts";

/**
 * Utility to handle graceful shutdown of the server and its resources.
 * Standardizes how we handle SIGTERM/SIGINT across all microservices.
 */
export const setupGracefulShutdown = (server: any) => {
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received. Starting graceful shutdown...`);

    // Set a timeout to force exit if graceful shutdown takes too long
    const forceExitTimeout = setTimeout(() => {
      logger.error("Graceful shutdown timed out. Forcing exit.");
      process.exit(1);
    }, 10000); // 10 seconds

    // 1. Stop taking new requests and wait for in-flight requests to finish
    server.close(async () => {
      logger.info("HTTP server closed. Cleaning up resources...");

      try {
        // 2. Close Database connections
        await closePool();
        logger.info("Database pool closed.");

        // 3. Close Redis connection
        await closeRedis();
        logger.info("Redis connection closed.");

        clearTimeout(forceExitTimeout);
        logger.info("Graceful shutdown completed. Exiting.");
        process.exit(0);
      } catch (error) {
        logger.error("Error during resource cleanup", { error });
        process.exit(1);
      }
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};
