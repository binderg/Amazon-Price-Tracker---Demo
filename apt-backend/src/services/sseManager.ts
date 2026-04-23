/**
 * sseManager.ts
 *
 * Singleton registry of active SSE client stream controllers.
 *
 * The SSE route calls addClient() when a browser connects and removeClient()
 * (or relies on the auto-cleanup in broadcast()) when it disconnects.
 *
 * The scheduler calls broadcast() to push named events to every connected tab.
 */

import { sseLog } from "../logger";

type SseController = ReadableStreamDefaultController<Uint8Array>;

const clients = new Set<SseController>();
const enc = new TextEncoder();

/** Format a named SSE event frame. */
function formatEvent(eventName: string, data: object): Uint8Array {
  return enc.encode(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Register a new connected client. */
export function addClient(controller: SseController): void {
  clients.add(controller);
  sseLog.debug({ total: clients.size }, "SSE client connected");
}

/** Remove a client (called on disconnect). */
export function removeClient(controller: SseController): void {
  clients.delete(controller);
  sseLog.debug({ total: clients.size }, "SSE client disconnected");
}

/**
 * Broadcast a named event to all connected clients.
 * Clients that have already closed are silently removed from the set.
 */
export function broadcast(eventName: string, data: object): void {
  if (clients.size === 0) return;

  const chunk = formatEvent(eventName, data);
  let sent = 0;
  let removed = 0;

  for (const controller of clients) {
    try {
      controller.enqueue(chunk);
      sent++;
    } catch {
      // Stream already closed — drop from registry
      clients.delete(controller);
      removed++;
    }
  }

  sseLog.debug({ eventName, sent, removed, total: clients.size }, "SSE broadcast");
}

/** How many clients are currently connected. */
export function clientCount(): number {
  return clients.size;
}
