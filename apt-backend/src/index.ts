import { Hono } from "hono";
import { cors } from "hono/cors";
import { apiKeyAuth } from "./middleware/auth";
import products from "./routes/products";
import settings from "./routes/settings";
import webhooks from "./routes/webhooks";
import alerts from "./routes/alerts";
import sse from "./routes/sse";

// Import DB so tables are created on startup
import "./db/index";

const app = new Hono();

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
app.route("/api/webhooks", webhooks);
app.route("/sse", sse);

// ─── 404 fallback ─────────────────────────────────────────────────────────────
app.notFound((c) => c.json({ error: "Not found" }, 404));

// ─── Global error handler ─────────────────────────────────────────────────────
app.onError((err, c) => {
  console.error("[error]", err);
  return c.json({ error: "Internal server error" }, 500);
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT ?? 3000);

export default {
  port: PORT,
  fetch: app.fetch,
};
