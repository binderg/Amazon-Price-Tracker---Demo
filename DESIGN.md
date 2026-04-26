# DESIGN

## Overview

I chose to build this project as a small full-stack TypeScript application using Bun, Hono, SQLite, React, and Server-Sent Events. The goal was to produce a working system quickly, keep the moving parts understandable, and spend time on the parts the panel is likely to care about most: durability, configurability, failure handling, and tradeoffs.

## Tradeoff 1: SQLite vs PostgreSQL

I chose SQLite for the storage layer.

Why:

-   zero setup for a take-home exercise
-   durable file-based history that survives process restarts
-   simple schema and queries for product metadata, snapshots, and alert events
-   built directly into Bun, which reduced infrastructure and library overhead

Tradeoff:

-   SQLite is a poor fit if this grew into a multi-user or multi-writer system with heavier concurrency
-   PostgreSQL would be the better choice at larger scale for operational tooling, backups, concurrency, and analytics

Why I still chose SQLite: For a system tracking three products with one scheduler process, SQLite was the fastest path to a credible durable design. I would migrate to PostgreSQL if this needed multiple workers, deployment across machines, or materially higher write volume.

The container persistence problem (SQLite being wiped on each redeploy) was initially approached by mounting an Azure Files share, but cross-resource-group networking issues prevented the container from starting. The solution was migrating to [Turso](https://turso.tech) — a hosted libSQL service that is wire-compatible with SQLite. The schema and all SQL queries are unchanged. The only code change was swapping `bun:sqlite`'s synchronous API for `@libsql/client`'s async `await db.execute()` calls across routes and the scheduler. This keeps the simplicity of SQLite semantics while solving persistence with zero infrastructure to manage.

## Tradeoff 2: `setInterval` scheduler vs queue/cron job system

I chose a simple in-process `setInterval` scheduler.

Why:

-   low complexity
-   easy to explain and debug
-   enough for a single-process prototype where the monitored product count is very small
-   allowed me to spend time on actual product behavior instead of job orchestration

Tradeoff:

-   scheduling state is not independently durable
-   if the process goes down, checks are delayed until restart
-   this approach is weaker for multi-worker correctness and duplicate-notification prevention

Why I still chose it: The exercise explicitly values clear tradeoffs over unnecessary complexity. For a reviewer running the app locally, an in-process scheduler is easy to verify and reason about. If I were taking this further, I would move scheduling into a durable job mechanism or external scheduler and add idempotency around alert generation.

Deployment consequence: because the scheduler lives inside the API process, the container cannot scale to zero — a cold start would kill the SSE connection and orphan any in-flight check cycles. The GitHub Actions deploy sets `--min-replicas 1` to keep one replica alive at all times (~$3–5/month on Azure Container Apps). Moving the scheduler out of the API process would remove this constraint and allow scale-to-zero.

## Tradeoff 3: In-app notifications vs external email/Slack delivery

I chose in-app notifications delivered through SSE, browser toast messages, and an alerts sidebar.

Why:

-   easy for a reviewer to verify end to end without needing email credentials, SMS providers, or webhook setup
-   fits the dashboard-oriented product shape of the application
-   allowed real-time UX without introducing a second outbound integration surface

Tradeoff:

-   it is not a true out-of-band notification channel
-   if the dashboard is closed, the user will not see the alert immediately
-   it does not satisfy production-style notification reliability requirements on its own

Why I still chose it: The brief allowed any notification method that a reviewer could verify. For a short take-home, a live in-app channel was the best balance between demonstrability and implementation time. In a fuller system, I would add email or likely webhooks as configurable channels and make the notification method explicitly selectable in config.

## Tradeoff 4: Scrape.do API vs direct scraping

I chose to use Scrape.do's Amazon PDP API instead of writing raw HTML scraping logic.

Why:

-   avoids spending the exercise fighting selectors, bot mitigation, and proxy behavior
-   returns structured product data directly
-   keeps the scraping layer small and testable

Tradeoff:

-   introduces a paid third-party dependency
-   creates vendor dependency and cost per check
-   does not remove the underlying legal/ToS concerns around Amazon scraping

Why I still chose it: The project is time-boxed. A managed scraping API let me focus on system design, persistence, detection, and observability rather than anti-bot work. I explicitly call out the legal/ethical limitation in the README because this should not be treated as a production-compliant Amazon integration.

## One Known Weakness I Left In Place

I did not implement concurrency-safe deduplication for notifications. If two workers ran the same scheduler logic at the same time, duplicate alert events could be generated. I left this out because the current design is intentionally single-process and the exercise prioritized core behavior over distributed correctness. If this were productionized, I would add a durable idempotency key or transactional guard around alert creation.
