// Custom logger utility for PNW Spirits
// Always use this logger for consistent, structured logs

export type LogLevel = "info" | "warn" | "error" | "debug";

interface LogOptions {
  level?: LogLevel;
  context?: string;
  data?: unknown;
}

function formatMessage(
  level: LogLevel,
  message: string,
  context?: string,
  data?: unknown,
) {
  const timestamp = new Date().toISOString();
  let log = `[${timestamp}] [${level.toUpperCase()}]`;
  if (context) log += ` [${context}]`;
  log += `: ${message}`;
  if (data !== undefined) log += ` | data: ${JSON.stringify(data)}`;
  return log;
}

export const logger = {
  info(message: string, options: LogOptions = {}) {
    // Only log info in development
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.info(
        formatMessage("info", message, options.context, options.data),
      );
    }
  },
  warn(message: string, options: LogOptions = {}) {
    // eslint-disable-next-line no-console
    console.warn(formatMessage("warn", message, options.context, options.data));
  },
  error(message: string, options: LogOptions = {}) {
    // eslint-disable-next-line no-console
    console.error(
      formatMessage("error", message, options.context, options.data),
    );
  },
  debug(message: string, options: LogOptions = {}) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.debug(
        formatMessage("debug", message, options.context, options.data),
      );
    }
  },
};
