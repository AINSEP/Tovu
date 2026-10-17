# Tovu safe-mode boot and rollback policy — draft

Date: 2026-10-17. Source: `development/todos.md:1518`, triage s4-60.
Status: concept for Coordinator review; no new boot mode, command or automatic rollback is implemented.

This draft applies architecture chapter 13 (UF-01/02/03/08/09) and chapter 14's
rollback and dependency-boundary rules to the current boot and Recovery owners.
It does not amend their existing ADRs or Critical Internal Constraints.

## Current behavior and owners

- Both `apps/website/src/index.ts` and `apps/website/src/cli/commands/serve.ts`
  run `buildBootModules` and `runBootLifecycle` before listening. A critical
  failure prevents serving; an optional failure permits degraded boot.
- `server/runtime/boot/bootstrap.ts` makes interrupted-migration reconciliation
  critical. Detecting an interrupted migration succeeds as a scan and sets the
  site's recovery status; failure to perform the scan aborts boot.
- `server/inbound/public-http/middleware/site-serving-gate.ts` refuses normal
  traffic with 503 while `BLOCKED_PENDING_RECOVERY`. Health/readiness, admin
  assets, authentication and Recovery paths remain reachable. This is an
  existing recovery gate, not a general plugin-free safe-mode boot.
- `features/recovery/recovery-orchestrator.ts` delegates the restore ceremony to
  `@jini-ai/db/recovery`. The routes are
  `POST /api/admin/v1/recovery/restore/{plan,confirm,execute}`. The shared
  gated-mutation gateway owns authorization, plan provenance, confirmation and
  token redemption (GOV-ADR-001); the existing operation lock coordinates
  migration and restore (GOV-ADR-002). Safe mode must call these owners.

## Proposed mode policy

| State | Entry | Permitted behavior | Exit |
|---|---|---|---|
| Normal | Critical boot checks succeed and no recovery block remains | Existing authorized routes and workers | Operator enters safe mode or a recovery check blocks serving |
| Recovery blocked (existing) | Interrupted migration detected | Existing recovery-gate allowlist; normal traffic gets 503 | Existing restore/reconciliation rules, including required restart |
| Safe mode (proposed) | Explicit operator choice, or a recorded boot failure followed by an operator-approved recovery boot | Trusted authentication, minimal admin recovery UI, health/readiness and authorized recovery/status actions | Explicit operator exit after fresh checks |
| Cannot boot | Essential storage, identity or integrity checks cannot complete | No application listener; report the failure through the existing boot logger | Repair the prerequisite and retry |

Safe mode must be selected before normal dependency composition. Filtering the
boot-module list alone is insufficient: `server/runtime/composition/deps.ts`
already creates readiness promises with effects; `composition/serving-app.ts`
starts the outbox drainer and trash sweeper, and daemon startup lives in both
entrypoints. A future implementation must prevent those effects at their
existing construction/start boundaries in both boot paths.

In safe mode, do not load site plugins, third-party themes, external MCP
connections or agent runtimes. Do not start outbox delivery, newsletter/mail,
webhook delivery, scheduled work or trash purging. Use a trusted recovery UI;
ordinary content writes, preview rendering and public serving return an explicit
unavailable response. Authentication, authorization, CSRF protections, site-key
handling and migration-integrity checks remain mandatory. Skipping a required
check never changes a failed boot into a ready site.

The entry choice must be available independently of site settings and plugins,
since either may cause the failure being repaired. Its transport, persistence,
authorized operator role and audit record need a Coordinator-approved contract
before implementation; this draft introduces no pretend CLI flag or setting.
Safe-mode liveness may be healthy, but normal-serving readiness stays false and
status names the restriction. Never automatically clear the mode on restart.

## Rollback policy

1. Preserve the failed release's identity, boot failure and request/run IDs.
   Quiesce writes and background effects; preserve failed-state evidence before
   changing data. Do not automatically restore a database on an error threshold.
2. Prefer disabling the changed optional capability through its existing owner.
   An application-only rollback is allowed only to an identified last-known-good
   artifact whose schema/data compatibility is established. Never run an older
   binary against an unverified newer schema or perform an automatic down migration.
3. When data restoration is required, select an existing valid restore point and
   use the existing plan → disclose → confirm → execute ceremony. Recheck the
   backend's current restore capability; `unavailable` cannot be overridden.
   Disclose lost writes and the actual restore scope before confirmation.
4. Treat database snapshots, uploads, themes/plugins, configuration and encryption
   keys as separate recovery concerns. A content database restore does not restore
   those files or undo mail, payments or external webhook effects. The existing
   site-backup manifest (`features/site-backup/sources.ts`) reports included and
   skipped files, excludes chat history and plugin OAuth data, and is not a
   complete disaster-recovery guarantee. Preserve required site keys separately
   through the established key-handling process; never print or embed them in logs.
5. Respect `restartRequired` from Recovery. The current file-backed SQLite restore
   leaves open handles on the previous database; do not resume traffic or workers
   against them. When recovering a blocked migration, the existing restore hooks
   retain the in-process block until restart. For other restore entry conditions,
   the future safe-mode coordinator must retain its own serving restriction until
   the required restart and fresh validation; do not assume the current gate does so.
6. After restart, re-run integrity/schema compatibility checks and verify Recovery
   status. A restore does not itself clear `PENDING_MIGRATION`. Exit safe mode only
   on explicit operator action after a content read and required recovery checks
   succeed; resume optional capabilities incrementally. Failure leaves the site
   restricted and records the next recovery action.

## Small implementation follow-up

Coordinator should approve the mode/entry/exit contract and designate its safety
constraints first. Extend the existing Jini lifecycle/recovery owners for generic
mechanics; keep Tovu's route allowlist and CMS module choices in Tovu. Do not
introduce a parallel recovery gateway, operation lock or restore implementation.

Before enabling the mode, add contract/integration tests for both boot entrypoints:
no optional effects before mode selection; authentication and Recovery reachable;
ordinary reads/writes blocked; a critical integrity failure still aborts; mode
survives restart; failed/stale confirmation cannot mutate data; required restart
cannot reopen stale handles; and restored data with an incompatible runtime stays
restricted. These are future acceptance checks, not validation claimed by this draft.

Handoff: policy draft delivered; runtime follow-up belongs to Coordinator →
Software Architect, with Database and Security review of the approved slice.
