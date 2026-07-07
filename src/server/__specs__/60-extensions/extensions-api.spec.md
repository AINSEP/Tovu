# Spec: Extensions API

## Goal

Define the server surfaces for extension discovery, activation, update, disablement, compatibility checks, quarantine, and admin-facing extension registration.

This is one of the core server responsibilities Tovu must get right if it is going to replace the WordPress plugin model and capture the granularity seen in Directus's extension system.

## Extension Principles

- Extension manifests are declared, versioned, and auditable.
- Extension permissions are declare-before-use.
- Extension operations are server-mediated, never "just load arbitrary code and hope."
- Extension lifecycle actions are explicit commands, not side effects of page load.

## Required Server Surfaces

The server should support:

- list installed/known extensions
- read manifest and compatibility state
- activate
- update
- disable
- remove or uninstall where allowed
- preflight compatibility checks
- quarantine and recovery flows

Example command routes:

- `POST /api/admin/v1/extensions/:extensionId/activate`
- `POST /api/admin/v1/extensions/:extensionId/update`
- `POST /api/admin/v1/extensions/:extensionId/disable`
- `POST /api/admin/v1/extensions/:extensionId/quarantine`

## Safety Requirements

Extension lifecycle actions must be able to interact with:

- dependency graph evaluation
- compatibility policy
- audit trail
- incident timeline
- safe mode and recovery posture

## Extension Registration

Extensions may register descriptors for:

- admin panels/modules
- API endpoints
- hooks/events
- protocol tools
- jobs/operations

Registration descriptors must be framework-agnostic where possible; the server stores or resolves descriptors, while UI bindings render them.

## Update And Quarantine

Update flows must support:

- preflight checks
- change snapshots
- verification result capture
- rollback-safe recovery path
- quarantine state when the extension is unsafe to continue running

Minimum lifecycle result contract:

```ts
type ExtensionLifecycleResult = {
  extensionId: string;
  operation: "activate" | "update" | "disable" | "remove" | "quarantine";
  previousState: "inactive" | "active" | "updating" | "quarantined" | "removed";
  currentState: "inactive" | "active" | "updating" | "quarantined" | "removed";
  outcome: "completed" | "blocked" | "accepted_recovery";
  jobId?: string | null;
  blockingReasons?: string[];
  verification?: {
    status: "passed" | "failed" | "skipped";
    summary: string;
  };
};
```

Minimum lifecycle failure set:

- `extension_compatibility_blocked`
- `extension_verification_failed`
- `extension_quarantined`
- `extension_recovery_required`
- `extension_manifest_invalid`

## Acceptance Checks

- Extension lifecycle operations are server commands, not ad hoc file or UI actions.
- The server can deny activation or update before the runtime is broken.
- Admin and protocol extension points are declared through descriptors rather than framework-bound components alone.
- Extension lifecycle results are explicit enough for admin and recovery flows to consume without hidden orchestration.

## Non-goals (current)

- Final extension marketplace implementation
- Full extension sandbox runtime internals
- Full provenance/signing implementation
