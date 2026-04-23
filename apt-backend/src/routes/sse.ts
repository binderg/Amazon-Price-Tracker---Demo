import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { addClient, removeClient } from "../services/sseManager";
import { sseLog } from "../logger";

const sse = new Hono();

/**
 * GET /sse
 * Server-Sent Events stream for real-time price updates.
 *
 * ── Why streamSSE instead of new ReadableStream() ────────────────────────────
 * With a raw ReadableStream the start() callback returns synchronously. Bun
 * can interpret that as the stream being finalised immediately and sends the
 * HTTP terminating chunk before any data flows. streamSSE (from hono/streaming)
 * uses a TransformStream internally and keeps the response body open for as
 * long as the async callback is suspended — no premature close.
 *
 * ── Why server.timeout(req, 0) + idleTimeout: 0 ──────────────────────────────
 * Bun v1.1.26 introduced a 10-second idle timeout (uWebSockets default). An
 * SSE stream sitting quietly between scheduler ticks looks "idle" to Bun, so
 * it gets killed ~9 seconds after the last byte — producing the infamous
 * ERR_INCOMPLETE_CHUNKED_ENCODING loop in the browser. Two fixes are applied:
 *   • server.timeout(req, 0) — disables the timeout for this request only
 *     (Bun-recommended approach; server is injected via Hono env in index.ts)
 *   • idleTimeout: 0 on Bun.serve — global fallback covering all responses
 *
 * ── Why an 8-second keepalive ping ───────────────────────────────────────────
 * Corporate firewalls and reverse proxies (nginx, Cloudflare, AWS ALB) enforce
 * their own idle timeouts independently of Bun, typically 30–120 seconds.
 * Sending a comment ping every 8 seconds keeps the socket warm against all of
 * them. Browsers ignore SSE comment lines (lines starting with ":") so there
 * is no frontend impact.
 *
 * Authentication is handled upstream (apiKeyAuth middleware in index.ts).
 * The API key is passed as ?key= because EventSource cannot set headers.
 */
sse.get("/", async (c) => {
  // Disable Bun's 10 s idle timeout for this SSE connection only.
  // See the block comment above and index.ts for full context.
  const server = (c.env as { server?: ReturnType<typeof Bun.serve> })?.server;
  server?.timeout(c.req.raw, 0);

  return streamSSE(c, async (stream) => {
    addClient(stream);
    sseLog.info("new SSE client registered");

    // Tell the frontend the connection is live
    await stream.writeSSE({
      event: "connected",
      data: JSON.stringify({ status: "connected" }),
    });

    // Keep-alive ping every 8 s. This is shorter than any reasonable proxy
    // idle timeout and ensures the chunked stream always has recent traffic.
    const pingInterval = setInterval(() => {
      stream.writeSSE({ data: "", comment: "ping" }).catch(() => {
        clearInterval(pingInterval);
      });
    }, 8_000);

    // Suspend here until the client disconnects — this is what keeps the
    // HTTP response open without terminating the chunked stream early.
    await new Promise<void>((resolve) => {
      c.req.raw.signal.addEventListener("abort", resolve, { once: true });
    });

    clearInterval(pingInterval);
    removeClient(stream);
    sseLog.info("SSE client disconnected");
  });
});

export default sse;
