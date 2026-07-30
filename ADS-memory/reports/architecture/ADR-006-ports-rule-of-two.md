# ADR-006: A Port Requires Two Plausible Adapters, One Being Built Now

- Status: ACCEPTED
- Date: 2026-07-01
- Author: Claude Fable 5 / Leon Aburime (design session, `tovu-v1-design.md` §8 W5)

## Context

`tovu-architecture.md` §13 assigns a bespoke port to each of 16 user-friction
clusters (`UpdateSafetyPort`, `IncidentAnalysisPort`, `PerfAnalysisPort`, …).
An interface designed against a single hypothetical implementation reliably
mirrors that implementation — abstraction cost without swappability benefit.
Most friction clusters are *features* built on the event spine, not seams.

## Decision

A port (interface in core with injected adapters) is justified only when **two
plausible adapters exist and one is being built now**. Everything else is
ordinary code that can be refactored into a port when a second implementation
becomes real.

Ports that pass today: `DatabasePort`/repos (in-memory + SQLite), `OutboxPort`
(in-memory + SQLite), `EventBusPort` (in-memory + future queue), `StoragePort`
(local FS + S3), `MailerPort` (SMTP + provider), `LLMPort` (Claude + others),
`CachePort` (memory + Redis), `SearchPort` (FTS5 + Meilisearch), `ClockPort`/
`IdGeneratorPort` (real + deterministic test doubles).

Deferred to features-not-ports: update safety, incident analysis, performance
attribution, cost observability, admin notifications — these are Tovu code on
the event/outbox spine until a genuine second implementation appears.

## Consequences

- §13's port list is reinterpreted as a *capability* backlog, not an interface
  backlog.
- "Ports for everything" remains the spirit (nothing in core touches a
  provider SDK), but the letter is: invert dependencies at real seams only.
