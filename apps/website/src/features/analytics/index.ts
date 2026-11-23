/**
 * @file Public surface of the `analytics` core library (Tier-2, §3.5).
 *
 * This barrel is the module's ADR-009 typed-call boundary — other modules import from here,
 * never via deep paths. TYPES/INTERFACES ONLY at this stage (ADR-035 draft): the concrete
 * ingest/rollup/query services and adapters land against this surface later.
 */

/**
 * The type model behind these ports lives in `@jini-ai/analytics`; this host persists it as follows.
 *
 * Purpose:
 * Declares the privacy-first, cookie-less traffic/usage model — the shapes that flow
 * from the ingest beacon through server-side normalization into aggregate/time-series
 * storage, and back out through dashboards and AI tools. TYPES ONLY — no feature logic.
 *
 * How it relates to the project:
 * - Reuses core primitives from `src/contracts/core/ports.ts` (UUID/ISODateTime/JsonObject) — this
 *   file introduces no new primitive kinds, staying inside ADR-007's workspace-scoping and
 *   the frozen serializable ABI (ADR-024 §3 / ADR-005).
 * - Row types below are **core-owned single-writer sidecars** in the per-site `content.db`
 *   (ADR-012), mirroring the media sidecar precedent (ADR-027 §2): high-volume operational
 *   counters that deliberately narrow ADR-022's revision-per-write discipline (INV-3) and
 *   carry their own attribution, rather than generating an entry revision per hit.
 *
 * Design invariant — NO PII AT REST:
 * Nothing persisted here is personal data. IP and User-Agent are consumed transiently at
 * ingest (IP → country, UA → device class) and then discarded; the only visitor identifier
 * is `visitorHash`, a daily-rotating, per-site, salted, non-reversible digest (cookie-less,
 * not cross-site, not cross-day). This is the Plausible/Fathom mechanism.
 */
export type { VisitorAnalyticsDeps } from "./contracts.js";
export { createAnalyticsIngestBinding, type AnalyticsIngestRouteDeps } from "./jini-adapters.js";
