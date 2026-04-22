import { createMiddleware } from "hono/factory";

export const apiKeyAuth = createMiddleware(async (c, next) => {
  const key = c.req.header("x-api-key");
  const expected = process.env.API_KEY;

  if (!expected) {
    console.error("[auth] API_KEY env var is not set");
    return c.json({ error: "Server misconfiguration" }, 500);
  }

  if (!key || key !== expected) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
});
