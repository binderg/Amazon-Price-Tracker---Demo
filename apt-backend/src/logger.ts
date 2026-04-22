/**
 * logger.ts
 *
 * Singleton Pino logger for the entire backend.
 *
 * Behaviour:
 *   NODE_ENV=production  → newline-delimited JSON (machine-parseable, ship to log aggregator)
 *   everything else      → pino-pretty (coloured, human-readable — great for local dev)
 *
 * Child loggers via logger.child({ module: 'settings' }) automatically inherit
 * the top-level config and add a `module` field to every line they emit.
 *
 * Log levels:
 *   trace  – granular internals (e.g. individual DB queries)
 *   debug  – dev-only details you'd want when stepping through a flow
 *   info   – normal operations (request in/out, product scraped, alert fired)
 *   warn   – degraded-but-recoverable (API slowness, retries, missing optional data)
 *   error  – something failed and needs attention
 *   fatal  – process is about to exit
 */

import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

const transport = isDev
  ? {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:HH:MM:ss.l",   // e.g. 18:42:03.123
        ignore: "pid,hostname",
        messageFormat: "{module} › {msg}",  // module prefix makes grepping easy
        singleLine: false,
      },
    }
  : undefined; // In production, write raw JSON to stdout

export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
    base: {
      service: "apt-backend",
      env: process.env.NODE_ENV ?? "development",
    },
    // Redact sensitive values wherever they appear in log objects
    redact: {
      paths: [
        "req.headers['x-api-key']",
        "req.headers.authorization",
        "token",
        "apiKey",
        "SCRAPE_DO_TOKEN",
      ],
      censor: "[REDACTED]",
    },
    timestamp: pino.stdTimeFunctions.isoTime, // ISO-8601 in JSON; pino-pretty formats it
  },
  transport ? pino.transport(transport) : undefined
);

// ─── Named child loggers ──────────────────────────────────────────────────────
// Import these directly in each module instead of calling logger.child() inline.

export const httpLog    = logger.child({ module: "http"     });
export const dbLog      = logger.child({ module: "db"       });
export const scrapeLog  = logger.child({ module: "scrape"   });
export const settingsLog = logger.child({ module: "settings" });
export const productsLog = logger.child({ module: "products" });
export const alertsLog  = logger.child({ module: "alerts"   });
export const webhooksLog = logger.child({ module: "webhooks" });
export const sseLog     = logger.child({ module: "sse"      });
