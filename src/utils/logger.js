/**
 * Simple logger utility for backend
 */
const logger = {
  info: (message, context = {}) => {
    console.log(`[INFO] ${message}`, context);
  },
  debug: (message, context = {}) => {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[DEBUG] ${message}`, context);
    }
  },
  warn: (message, context = {}) => {
    console.warn(`[WARN] ${message}`, context);
  },
  error: (message, context = {}) => {
    console.error(`[ERROR] ${message}`, context);
  },
};

export default logger;
