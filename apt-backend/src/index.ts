import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { apiKeyAuth } from "./middleware/auth";
import { requestLogger } from "./middleware/logger";
import { logger } from "./logger";
import products from "./routes/products";
import settings from "./routes/settings";
import alerts from "./routes/alerts";
import sse from "./routes/sse";
import { startScheduler } from "./services/scheduler";

// Import DB so tables are created on startup
import "./db/index";

const app = new Hono();

// ─── Request logging ──────────────────────────────────────────────────────────
app.use("*", requestLogger);

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Allow the Vite dev server and any configured frontend origin
const allowedOrigins = (process.env.FRONTEND_ORIGIN ?? "http://localhost:5173").split(",").map((s) => s.trim());

app.use(
  "*",
  cors({
    origin: (origin) => (allowedOrigins.includes(origin) ? origin : allowedOrigins[0]),
    allowHeaders: ["Content-Type", "X-API-Key"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  })
);

// ─── Public routes ────────────────────────────────────────────────────────────
app.get("/health", (c) => c.json({ status: "ok", ts: Date.now() }));

// ─── Protected routes ─────────────────────────────────────────────────────────
app.use("/api/*", apiKeyAuth);
app.use("/sse", apiKeyAuth);

app.route("/api/products", products);
app.route("/api/settings", settings);
app.route("/api/alerts", alerts);
app.route("/sse", sse);

// ─── Static frontend (production container only) ─────────────────────────────
// When the frontend is built into apt-frontend/dist, serve it from the same Bun
// process so Azure can run a single container for both UI and API.
app.use("/assets/*", serveStatic({ root: "../apt-frontend/dist" }));
app.get("/favicon.ico", serveStatic({ path: "../apt-frontend/dist/favicon.ico" }));
app.get("/*", serveStatic({ path: "../apt-frontend/dist/index.html" }));

// ─── 404 fallback ─────────────────────────────────────────────────────────────
app.notFound((c) => c.json({ error: "Not found" }, 404));

// ─── Global error handler ─────────────────────────────────────────────────────
app.onError((err, c) => {
  logger.error({ err: err.message, stack: err.stack, url: c.req.url }, "unhandled error");
  return c.json({ error: "Internal server error" }, 500);
});

// ─── Scheduler ────────────────────────────────────────────────────────────────
startScheduler();

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT ?? 3000);

logger.info(
  {
    port: PORT,
    env: process.env.NODE_ENV ?? "development",
    logLevel: process.env.LOG_LEVEL ?? "debug",
    frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
  },
  `apt-backend listening on :${PORT}`
);

// ─── Bun idle-timeout fix (v1.1.26+) ──────────────────────────────────────────
//
// PROBLEM:
//   Bun v1.1.26 introduced a default 10-second idle timeout powered by the
//   underlying uWebSockets (uWS) library. Any HTTP connection that carries no
//   data for 10 seconds is silently killed. For SSE this is fatal — the
//   stream goes quiet between scheduler ticks, Bun kills the socket, the
//   browser logs ERR_INCOMPLETE_CHUNKED_ENCODING, EventSource reconnects,
//   gets killed again 9 seconds later, and the loop repeats indefinitely.
//
// SOLUTION (two layers):
//   1. Per-request: pass the Bun Server instance through Hono's env so the
//      SSE route can call server.timeout(req, 0) to disable the timeout for
//      that specific long-lived connection only. This is the approach
//      recommended by the Bun docs.
//   2. Global fallback: idleTimeout: 0 disables the timeout server-wide so
//      any streaming response is safe even if the per-request call is missed.
//
// The SSE route also sends a keepalive ping every 8 seconds as defence-in-
// depth against proxy/firewall idle timeouts (nginx, Cloudflare, AWS ALB)
// that operate independently of Bun's setting.
// ──────────────────────────────────────────────────────────────────────────────
export default {
  port: PORT,
  fetch(req: Request, server: ReturnType<typeof Bun.serve>) {
    // Inject the Bun server instance so routes can call server.timeout(req, 0)
    return app.fetch(req, { server });
  },
  idleTimeout: 0,
};
