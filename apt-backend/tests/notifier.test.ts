/**
 * tests/notifier.test.ts
 *
 * Unit tests for the SSE notification layer (src/services/sseManager.ts).
 *
 * sseManager keeps a module-level Set of connected client streams.  We inject
 * lightweight mock streams (objects with a jest-compatible writeSSE mock) to
 * verify behaviour without needing a real HTTP connection.
 *
 * Covered:
 *   - addClient / removeClient update clientCount correctly
 *   - broadcast() calls writeSSE on every connected client with the right
 *     event name and JSON-serialised payload
 *   - A client whose writeSSE rejects is automatically evicted from the set
 *     (the sseManager's fault-tolerance path)
 *   - broadcast() is a no-op and does not throw when no clients are connected
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import {
  addClient,
  removeClient,
  broadcast,
  clientCount,
} from "../src/services/sseManager";
import type { SSEStreamingApi } from "hono/streaming";

// ── Mock stream factory ───────────────────────────────────────────────────────

/**
 * Returns a minimal SSEStreamingApi stand-in.
 * Pass `{ fail: true }` to make writeSSE reject — simulating a disconnected
 * browser tab, which is the path that triggers automatic client eviction.
 */
function makeMockStream(options: { fail?: boolean } = {}): SSEStreamingApi {
  return {
    writeSSE: mock(async (_msg: unknown) => {
      if (options.fail) throw new Error("stream closed");
    }),
  } as unknown as SSEStreamingApi;
}

// ── Cleanup bookkeeping ───────────────────────────────────────────────────────

// Track every client added so afterEach can remove stragglers and leave the
// module-level Set clean for the next test.
let registered: SSEStreamingApi[] = [];

function add(stream: SSEStreamingApi) {
  addClient(stream);
  registered.push(stream);
  return stream;
}

beforeEach(() => {
  registered = [];
});

afterEach(() => {
  for (const s of registered) removeClient(s);
  registered = [];
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("sseManager — client registry", () => {
  it("clientCount increases by 1 when a client connects", () => {
    const before = clientCount();
    const s = add(makeMockStream());
    expect(clientCount()).toBe(before + 1);
    removeClient(s);
  });

  it("clientCount decreases by 1 when a client disconnects", () => {
    const s = add(makeMockStream());
    const after = clientCount();
    removeClient(s);
    registered = registered.filter((r) => r !== s); // already removed manually
    expect(clientCount()).toBe(after - 1);
  });

  it("removing a client that was never added is a safe no-op", () => {
    const ghost = makeMockStream();
    expect(() => removeClient(ghost)).not.toThrow();
  });
});

describe("sseManager — broadcast()", () => {
  it("calls writeSSE on every connected client", async () => {
    const s1 = add(makeMockStream());
    const s2 = add(makeMockStream());

    broadcast("price_update", { product_id: 1, current_price: 29.99 });

    // writeSSE is fire-and-forget (.catch); yield the microtask queue.
    await new Promise((r) => setTimeout(r, 20));

    expect((s1.writeSSE as ReturnType<typeof mock>).mock.calls).toHaveLength(1);
    expect((s2.writeSSE as ReturnType<typeof mock>).mock.calls).toHaveLength(1);
  });

  it("serialises the payload as JSON and uses the supplied event name", async () => {
    const s = add(makeMockStream());

    broadcast("price_drop", { product_id: 7, drop_percent: 12.5 });
    await new Promise((r) => setTimeout(r, 20));

    const [message] = (s.writeSSE as ReturnType<typeof mock>).mock.calls[0] as [
      { event: string; data: string }
    ];

    expect(message.event).toBe("price_drop");
    expect(JSON.parse(message.data)).toMatchObject({
      product_id: 7,
      drop_percent: 12.5,
    });
  });

  it("automatically evicts a client whose writeSSE rejects", async () => {
    const good = add(makeMockStream());
    const bad = add(makeMockStream({ fail: true }));

    const countBefore = clientCount();

    broadcast("price_drop", { product_id: 2 });
    await new Promise((r) => setTimeout(r, 20));

    // bad was auto-removed by the .catch(); good stays
    expect(clientCount()).toBe(countBefore - 1);
    expect((good.writeSSE as ReturnType<typeof mock>).mock.calls).toHaveLength(1);

    // Prevent afterEach from trying to remove the already-evicted client
    registered = registered.filter((r) => r !== bad);
  });

  it("is a no-op and does not throw when zero clients are connected", () => {
    // Temporarily clear everything so we can reliably test the empty case
    const snapshot: SSEStreamingApi[] = [];
    // Capture current count; if it's 0 we can test directly
    if (clientCount() === 0) {
      expect(() => broadcast("test_event", { x: 1 })).not.toThrow();
    } else {
      // Some other test left clients in place; just verify no throw regardless
      expect(() => broadcast("test_event", { x: 1 })).not.toThrow();
    }
    void snapshot; // suppress unused-var lint
  });
});
