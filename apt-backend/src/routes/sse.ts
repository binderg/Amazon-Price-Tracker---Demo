import { Hono } from "hono";
import { addClient, removeClient } from "../services/sseManager";
import { sseLog } from "../logger";

const sse = new Hono();

/**
 * GET /sse
 * Server-Sent Events stream for real-time price updates.
 *
 * Each connecting client is registered with sseManager so the scheduler
 * can broadcast  price_update  and  price_drop  events to every open tab.
 *
 * Authentication is handled upstream (apiKeyAuth middleware in index.ts).
 * The API key is passed as ?key= because EventSource cannot set headers.
 */
sse.get("/", (c) => {
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();

      // Register this client so broadcast() can reach it
      addClient(controller);

      // Send an initial connected event so the frontend flips to "connected"
      controller.enqueue(
        enc.encode(
          `event: connected\ndata: ${JSON.stringify({ status: "connected" })}\n\n`
        )
      );

      sseLog.info("new SSE client registered");

      // Keep-alive ping every 30 seconds to prevent proxy timeouts
      const interval = setInterval(() => {
        try {
          controller.enqueue(enc.encode(`: ping\n\n`));
        } catch {
          clearInterval(interval);
        }
      }, 30_000);

      // Clean up when the client closes the connection
      c.req.raw.signal.addEventListener("abort", () => {
        clearInterval(interval);
        removeClient(controller);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

export default sse;
