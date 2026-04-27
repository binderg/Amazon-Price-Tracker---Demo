# AI-NOTES

One thing the AI assistant got wrong during this build was the diagnosis of the SSE disconnect loop.

The initial explanation focused on the SSE implementation itself and on switching from a raw `ReadableStream` to Hono's `streamSSE`. That was only part of the story. The real production issue was Bun v1.1.26's default 10-second idle timeout, which was killing quiet SSE connections between scheduler ticks. In the browser this showed up as `ERR_INCOMPLETE_CHUNKED_ENCODING`, followed by an automatic reconnect loop.

I caught it by checking the backend logs instead of trusting the first explanation. The logs showed the SSE connection opening and then closing almost exactly 9 to 10 seconds later every time, which pointed to an idle-timeout problem rather than a parsing or frontend bug.

I used perplexity to search the web for this seemingly common bug and the final fix was:

- use Hono `streamSSE` instead of a raw stream
- disable Bun's idle timeout for SSE with `server.timeout(req, 0)`
- set `idleTimeout: 0` as a global fallback
- send keepalive pings every 8 seconds
- add frontend reconnect backoff so the UI recovers after restarts
