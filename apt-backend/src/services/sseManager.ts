/**
 * sseManager.ts
 *
 * Singleton registry of active SSE client streams.
 *
 * Stores Hono SSEStreamingApi handles (from streamSSE) instead of raw
 * ReadableStreamDefaultControllers. This avoids ERR_INCOMPLETE_CHUNKED_ENCODING
 * caused by Bun prematurely finalising a raw ReadableStream whose start()
 * callback returns synchronously.
 *
 * The SSE route calls addClient() when a browser connects and removeClient()
 * when it disconnects. The scheduler calls broadcast() to push named events
 * to every connected tab.
 */

import type { SSEStreamingApi } from "hono/streaming";
import { sseLog } from "../logger";

const clients = new Set<SSEStreamingApi>();

/** Register a new connected client. */
export function addClient(stream: SSEStreamingApi): void {
  clients.add(stream);
  sseLog.debug({ total: clients.size }, "SSE client connected");
}

/** Remove a client on disconnect. */
export function removeClient(stream: SSEStreamingApi): void {
  clients.delete(stream);
  sseLog.debug({ total: clients.size }, "SSE client disconnected");
}

/**
 * Broadcast a named SSE event to every connected client.
 * Clients whose stream has already closed are silently removed.
 */
export function broadcast(eventName: string, data: object): void {
  if (clients.size === 0) return;

  const payload = JSON.stringify(data);
  let sent = 0;

  for (const stream of clients) {
    stream
      .writeSSE({ event: eventName, data: payload })
      .catch(() => {
        // Write failed — the client has disconnected; drop it
        clients.delete(stream);
      });
    sent++;
  }

  sseLog.debug({ eventName, sent, total: clients.size }, "SSE broadcast");
}

/** How many clients are currently connected. */
export function clientCount(): number {
  return clients.size;
}
