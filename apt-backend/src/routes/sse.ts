import { Hono } from "hono";

const sse = new Hono();

/**
 * GET /sse
 * Server-Sent Events stream for real-time price updates.
 * Stub — full implementation comes with the scheduler.
 */
sse.get("/", (c) => {
  const stream = new ReadableStream({
    start(controller) {
      // Send an initial connected event
      controller.enqueue(
        new TextEncoder().encode(`event: connected\ndata: ${JSON.stringify({ status: "connected" })}\n\n`)
      );

      // Keep-alive ping every 30 seconds
      const interval = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(`: ping\n\n`));
        } catch {
          clearInterval(interval);
        }
      }, 30_000);

      // Clean up when the client disconnects
      c.req.raw.signal.addEventListener("abort", () => {
        clearInterval(interval);
        try { controller.close(); } catch { /* already closed */ }
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
