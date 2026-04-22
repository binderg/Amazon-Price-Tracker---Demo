/**
 * middleware/logger.ts
 *
 * Hono middleware that logs every HTTP request/response with:
 *   - method, path, status, duration
 *   - request id (generated per-request for correlation)
 *   - user-agent (truncated)
 *   - response content-length when available
 *
 * SSE connections are logged at open and close separately so they don't
 * clog the log with a never-ending "request" entry.
 */

import { createMiddleware } from "hono/factory";
import { httpLog } from "../logger";

let requestCounter = 0;

export const requestLogger = createMiddleware(async (c, next) => {
  const reqId = `req-${++requestCounter}`;
  const start = performance.now();

  const method  = c.req.method;
  const path    = new URL(c.req.url).pathname;
  const ua      = (c.req.header("user-agent") ?? "").slice(0, 80) || undefined;
  const isSSE   = path === "/sse";

  // Attach reqId to the context so downstream handlers can reference it
  c.set("reqId" as never, reqId);

  if (isSSE) {
    httpLog.info({ reqId, method, path, ua }, "SSE connection opened");
  } else {
    httpLog.debug({ reqId, method, path, ua }, "→ request");
  }

  await next();

  const ms      = Math.round(performance.now() - start);
  const status  = c.res.status;
  const length  = c.res.headers.get("content-length") ?? undefined;

  const level   = status >= 500 ? "error" : status >= 400 ? "warn" : "info";

  if (isSSE) {
    httpLog.info({ reqId, method, path, status, ms }, "SSE connection closed");
  } else {
    httpLog[level](
      { reqId, method, path, status, ms, ...(length ? { bytes: Number(length) } : {}) },
      `← ${status}`
    );
  }
});
