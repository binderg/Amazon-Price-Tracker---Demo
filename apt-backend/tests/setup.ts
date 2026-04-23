/**
 * tests/setup.ts
 *
 * Loaded by Bun before every test suite (see bunfig.toml [test].preload).
 *
 * Must run before any test module is evaluated so that modules that read
 * process.env at import-time (e.g. logger.ts) pick up the test values.
 *
 *   NODE_ENV=production  → disables pino-pretty's worker-thread transport;
 *                          plain JSON to stdout, which is fine in CI.
 *   LOG_LEVEL=silent     → pino emits nothing, keeping test output clean.
 *   SCRAPE_DO_TOKEN      → default value so scraper tests don't need to set it
 *                          unless they are specifically testing the missing-token
 *                          error path.
 *   API_KEY              → satisfies the auth middleware if any route test
 *                          exercises it.
 */
process.env.NODE_ENV = "production";
process.env.LOG_LEVEL = "silent";
process.env.SCRAPE_DO_TOKEN = "test-token";
process.env.API_KEY = "test-api-key";
