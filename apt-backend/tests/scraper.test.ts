/**
 * tests/scraper.test.ts
 *
 * Unit tests for the Amazon scraper layer (src/services/amazon.ts).
 *
 * Strategy: replace global fetch with a Bun mock before each test so no real
 * network calls are made.  The SCRAPE_DO_TOKEN env var is set by tests/setup.ts
 * (via bunfig.toml preload) before this module is evaluated.
 */

import { describe, it, expect, afterEach, mock } from "bun:test";
import { getProductDetails } from "../src/services/amazon";

// ── Fixture ───────────────────────────────────────────────────────────────────

const MOCK_PRODUCT = {
  asin: "B08N5WRWNW",
  is_sponsored: false,
  brand: "Amazon",
  name: "Echo Dot (4th Gen)",
  url: "https://www.amazon.com/dp/B08N5WRWNW",
  thumbnail: "https://example.com/img.jpg",
  rating: 4.7,
  total_ratings: 123_456,
  price: 29.99,
  list_price: 49.99,
  currency: "USD",
  currency_symbol: "$",
  is_prime: true,
  shipping_info: ["FREE delivery"],
  more_buying_choices: { heading: "", offer_text: "", offer_link: "" },
  images: [],
  best_seller_rankings: [],
  technical_details: {},
  status: "ok",
  errorMessage: null,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a mock fetch that returns a JSON response with the given body/status. */
function stubFetch(body: unknown, status = 200) {
  return mock(async (_url: string) =>
    new Response(JSON.stringify(body), {
      status,
      statusText: status === 200 ? "OK" : "Error",
      headers: { "Content-Type": "application/json" },
    })
  );
}

const realFetch = global.fetch;

afterEach(() => {
  // Always restore the real fetch after each test.
  global.fetch = realFetch;
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("getProductDetails — scraper layer", () => {
  it("returns a parsed AmazonProduct on a 200 OK response", async () => {
    global.fetch = stubFetch(MOCK_PRODUCT) as any;

    const result = await getProductDetails("B08N5WRWNW");

    expect(result.asin).toBe("B08N5WRWNW");
    expect(result.price).toBe(29.99);
    expect(result.list_price).toBe(49.99);
    expect(result.name).toBe("Echo Dot (4th Gen)");
    expect(result.is_prime).toBe(true);
    expect(result.currency).toBe("USD");
  });

  it("passes asin, geocode, and zipcode into the request URL", async () => {
    let capturedUrl = "";
    global.fetch = mock(async (url: string) => {
      capturedUrl = url;
      return new Response(JSON.stringify(MOCK_PRODUCT), { status: 200 });
    }) as any;

    await getProductDetails("B0TEST1234", "gb", "SW1A1AA");

    expect(capturedUrl).toContain("asin=B0TEST1234");
    expect(capturedUrl).toContain("geocode=GB");
    expect(capturedUrl).toContain("zipcode=SW1A1AA");
    expect(capturedUrl).toContain("token=test-token");
  });

  it("throws with the HTTP status when the response is not 2xx", async () => {
    global.fetch = stubFetch("Forbidden", 403) as any;

    await expect(getProductDetails("B08N5WRWNW")).rejects.toThrow("403");
  });

  it("throws the API errorMessage when status is 'error'", async () => {
    const errBody = { ...MOCK_PRODUCT, status: "error", errorMessage: "ASIN not found" };
    global.fetch = stubFetch(errBody) as any;

    await expect(getProductDetails("B08N5WRWNW")).rejects.toThrow("ASIN not found");
  });

  it("throws a fallback message when status is 'error' but errorMessage is null", async () => {
    const errBody = { ...MOCK_PRODUCT, status: "error", errorMessage: null };
    global.fetch = stubFetch(errBody) as any;

    await expect(getProductDetails("B08N5WRWNW")).rejects.toThrow("Unknown API error");
  });

  it("throws when SCRAPE_DO_TOKEN is not set", async () => {
    const saved = process.env.SCRAPE_DO_TOKEN;
    delete process.env.SCRAPE_DO_TOKEN;

    // fetch should never be called — error must be thrown before the request
    global.fetch = mock(async () => {
      throw new Error("fetch should not have been called");
    }) as any;

    await expect(getProductDetails("B08N5WRWNW")).rejects.toThrow(
      "SCRAPE_DO_TOKEN environment variable is not set"
    );

    process.env.SCRAPE_DO_TOKEN = saved;
  });

  it("propagates network errors thrown by fetch", async () => {
    global.fetch = mock(async () => {
      throw new Error("ECONNREFUSED");
    }) as any;

    await expect(getProductDetails("B08N5WRWNW")).rejects.toThrow("ECONNREFUSED");
  });
});
