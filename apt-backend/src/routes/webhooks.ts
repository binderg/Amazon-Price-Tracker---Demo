import { Hono } from "hono";
import { db } from "../db/index";
import { webhooksLog } from "../logger";

const webhooks = new Hono();

interface WebhookRow {
  id: number;
  url: string;
  created_at: number;
}

/** GET /api/webhooks */
webhooks.get("/", (c) => {
  const rows = db.query<WebhookRow, []>(`SELECT id, url, created_at FROM webhooks ORDER BY created_at ASC`).all();
  webhooksLog.debug({ count: rows.length }, "webhooks fetched");
  return c.json(rows.map((r) => ({ id: r.id, url: r.url, created_at: new Date(r.created_at * 1000).toISOString() })));
});

/** POST /api/webhooks — body: { url: string } */
webhooks.post("/", async (c) => {
  let body: { url?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const url = body.url?.trim();
  if (!url) return c.json({ error: "url is required" }, 400);

  try {
    new URL(url); // validate
  } catch {
    webhooksLog.warn({ url }, "invalid webhook URL rejected");
    return c.json({ error: "Invalid URL" }, 400);
  }

  try {
    const result = db
      .query<{ id: number }, [string]>(`INSERT INTO webhooks (url) VALUES (?) RETURNING id`)
      .get(url);
    webhooksLog.info({ id: result!.id, url }, "webhook registered");
    return c.json({ id: result!.id, url }, 201);
  } catch {
    webhooksLog.warn({ url }, "webhook URL already exists");
    return c.json({ error: "Webhook URL already exists" }, 409);
  }
});

/** DELETE /api/webhooks/:id */
webhooks.delete("/:id", (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Invalid id" }, 400);

  const info = db.run(`DELETE FROM webhooks WHERE id = ?`, [id]);
  if (info.changes === 0) {
    webhooksLog.warn({ id }, "webhook not found for deletion");
    return c.json({ error: "Webhook not found" }, 404);
  }

  webhooksLog.info({ id }, "webhook deleted");
  return c.json({ success: true });
});

export default webhooks;
