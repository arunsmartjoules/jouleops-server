import winston from "winston";

const { combine, timestamp, printf, colorize, json } = winston.format;

/**
 * Custom log format for development (pretty printing)
 */
const devFormat = printf(
  ({ level, message, timestamp, stack, requestId, ...metadata }) => {
    let log = `${timestamp} [${level}] ${requestId ? `[RID: ${requestId}] ` : ""}${message}`;
    if (Object.keys(metadata).length > 0) {
      log += ` | meta: ${JSON.stringify(metadata)}`;
    }
    if (stack) {
      log += `\n${stack}`;
    }
    return log;
  },
);

/**
 * Winston Logger Instance
 *
 * Standardized logging for all microservices.
 * Uses JSON format in production and pretty-printing in development.
 */
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: combine(
    timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    process.env.NODE_ENV === "production"
      ? json()
      : combine(colorize(), devFormat),
  ),
  transports: [new winston.transports.Console()],
  // Prevent logger from crashing the app
  exitOnError: false,
});

/**
 * Helper to log with request context
 */
export const logWithRequest = (
  req: any,
  level: string,
  message: string,
  metadata: any = {},
) => {
  logger.log(level, message, {
    ...metadata,
    requestId: req.requestId || req.id,
    path: req.path,
    method: req.method,
  });
};
