import winston from "winston";

const { combine, timestamp, printf, colorize, errors } = winston.format;

/**
 * Custom log format
 */
const logFormat = printf(({ level, message, timestamp, context, ...meta }) => {
  const ctx = context ? `[${context}]` : "";
  const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : "";
  return `${timestamp} ${level} ${ctx} ${message} ${metaStr}`.trim();
});

/**
 * Create a logger instance
 */
export function createLogger(context?: string): winston.Logger {
  return winston.createLogger({
    level: process.env.LOG_LEVEL || "info",
    format: combine(
      errors({ stack: true }),
      timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
      logFormat
    ),
    defaultMeta: { context },
    transports: [
      // Console output with colors
      new winston.transports.Console({
        format: combine(colorize({ all: true }), logFormat),
      }),
      // File output for errors
      new winston.transports.File({
        filename: "logs/error.log",
        level: "error",
      }),
      // File output for all logs
      new winston.transports.File({
        filename: "logs/combined.log",
      }),
    ],
  });
}

/**
 * Default logger instance
 */
export const logger = createLogger("relayer");
