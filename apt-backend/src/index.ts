import { Hono } from "hono";
import { cors } from "hono/cors";
import { apiKeyAuth } from "./middleware/auth";
import { requestLogger } from "./middleware/logger";
import { logger } from "./logger";
import products from "./routes/products";
import settings from "./routes/settings";
import alerts from "./routes/alerts";
import sse from "./routes/sse";

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

// ─── 404 fallback ─────────────────────────────────────────────────────────────
app.notFound((c) => c.json({ error: "Not found" }, 404));

// ─── Global error handler ─────────────────────────────────────────────────────
app.onError((err, c) => {
  logger.error({ err: err.message, stack: err.stack, url: c.req.url }, "unhandled error");
  return c.json({ error: "Internal server error" }, 500);
});

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

export default {
  port: PORT,
  fetch: app.fetch,
};
