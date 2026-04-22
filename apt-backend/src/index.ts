import { Hono } from "hono";
import { getProductDetails } from "./services/amazon";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));

app.get("/api/product/:asin", async (c) => {
  const asin = c.req.param("asin");
  const query = c.req.query();
  const geocode = query.geocode || "us";
  const zipcode = query.zipcode || "10001";

  if (!asin || asin.length !== 10) {
    return c.json({ status: "error", errorMessage: "Invalid or missing ASIN" }, 400);
  }

  try {
    const data = await getProductDetails(asin, geocode, zipcode);
    return c.json(data);
  } catch (error: any) {
    return c.json({ status: "error", errorMessage: error.message }, 500);
  }
});

const PORT = process.env.PORT || 3000;

export default {
  port: PORT,
  fetch: app.fetch,
};

export type App = typeof app;
