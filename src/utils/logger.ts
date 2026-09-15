// Custom logger utility for PNW Spirits
// Always use this logger for consistent, structured logs

export type LogLevel = "info" | "warn" | "error" | "debug";

interface LogOptions {
  level?: LogLevel;
  context?: string;
  data?: unknown;
}

/**
 * An Error's `name`, `message`, `stack` and `cause` are all non-enumerable own
 * properties, so `JSON.stringify(new Error("boom"))` is `"{}"`. Every caller
 * that logged a caught error - directly as `data`, or as `data: { error }` -
 * was therefore writing an empty object and discarding the one detail worth
 * keeping, at the moment it mattered most. Handlers that withhold a failure's
 * detail from the response do so precisely because the log is meant to retain
 * it, so this is what makes that trade honest.
 *
 * `stack` is kept deliberately. This logger writes to `console` only and never
 * to a response body, so the project rule against exposing stack traces to
 * clients is a different trust boundary and is untouched; the stack is also the
 * only field that says *which* call failed, which is the whole question when
 * four different S3 helpers can raise the same "Access Denied". Its size is
 * bounded by `Error.stackTraceLimit`.
 */
function plainError(error: Error): Record<string, unknown> {
  const plain: Record<string, unknown> = {
    name: error.name,
    message: error.message,
  };
  if (error.stack) plain.stack = error.stack;
  // How a wrapped failure keeps the original, and how Node's fetch reports
  // every connection failure. Nested Errors are unwrapped by the replacer.
  if (error.cause !== undefined) plain.cause = error.cause;
  return plain;
}

/**
 * Key names whose value is a credential rather than a diagnostic. Matched as
 * normalized substrings, so one entry covers `X-Amz-Security-Token`, `api_key`
 * and `secretAccessKey` alike.
 *
 * Deliberately narrow. Unwrapping an Error now follows its `cause` into object
 * graphs this project does not own - an AWS SDK error carries request headers -
 * and this is the floor under that, not a licence to log credentials. But
 * redacting a field a reader needed is the same net loss this file was fixed to
 * stop, so `auth` is absent (it would redact `author`, on every blog payload)
 * and so is `key` (it would redact `key`, `s3Key` and `cacheKey`, the primary
 * S3 diagnostics). Identifiers stay: they are correlation, not credentials.
 */
const REDACTED_KEY_PARTS = [
  "accesskey",
  "apikey",
  "authorization",
  "cookie",
  "credential",
  "password",
  "secret",
  "signature",
  "token",
];

function isRedactedKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return REDACTED_KEY_PARTS.some((part) => normalized.includes(part));
}

/**
 * Serializes a log payload without ever throwing. `JSON.stringify` throws on a
 * circular structure, and a throw from inside a log statement would take down
 * the handler that was reporting the failure - the caller is usually already in
 * a `catch`, so there is nothing left to recover it.
 */
function serializeData(data: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(data, (key, value: unknown) => {
      // By key name, never by value shape: sniffing for credential-looking
      // strings eventually redacts a blog title. The key itself is kept, so the
      // reader still learns the field was present. Booleans are exempt because
      // they cannot carry a credential and `s3.ts` logs `accessKeyId: !!id` at
      // three sites as a presence check - the whole diagnostic there is which
      // variable is missing, which "[redacted]" would answer for neither.
      if (typeof value !== "boolean" && isRedactedKey(key)) return "[redacted]";
      if (typeof value !== "object" || value === null) return value;
      // Reachable through an AWS SDK error's attached response graph, which the
      // `cause` chain above can now walk into. Cutting the cycle keeps the rest
      // of the payload; a merely repeated reference is elided too, which costs
      // nothing for payloads this shape.
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
      return value instanceof Error ? plainError(value) : value;
    });
  } catch {
    // A throwing getter, a throwing `toJSON`, a BigInt. Losing the payload is
    // survivable; losing the handler is not.
    return '"[unserializable]"';
  }
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
  if (data !== undefined) log += ` | data: ${serializeData(data)}`;
  return log;
}

export const logger = {
  info(message: string, options: LogOptions = {}) {
    console.info(formatMessage("info", message, options.context, options.data));
  },
  warn(message: string, options: LogOptions = {}) {
    console.warn(formatMessage("warn", message, options.context, options.data));
  },
  error(message: string, options: LogOptions = {}) {
    console.error(
      formatMessage("error", message, options.context, options.data),
    );
  },
  debug(message: string, options: LogOptions = {}) {
    if (process.env.NODE_ENV !== "production") {
      console.debug(
        formatMessage("debug", message, options.context, options.data),
      );
    }
  },
};
