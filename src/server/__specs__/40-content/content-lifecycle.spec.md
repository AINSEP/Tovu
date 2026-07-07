# Spec: Content Lifecycle Over HTTP

## Goal

Define the server contract for draft, revision, autosave, preview, publish, and recovery-oriented content flows.

This is where Tovu must replace the brittle authoring and revision behaviors users experience in WordPress while avoiding a giant admin-coupled lifecycle hidden in the UI.

## Lifecycle States

The server must be able to express content lifecycle states such as:

- draft
- review
- scheduled
- published
- archived

The exact domain model lives in content features; the server spec defines how lifecycle operations are exposed and protected.

## Required Server Behaviors

- autosave route or command surface
- revision snapshot access
- preview token issuance and validation
- status transition commands
- optimistic concurrency or version-conflict handling
- restore or revert entry points where the feature supports them

## Conflict Handling

Concurrent mutations must not silently overwrite each other.

The server should support a conflict response such as:

- `409` when a stale revision/version attempts a mutation
- explicit metadata so clients know whether to refresh, merge, or retry

Minimum conflict metadata:

```json
{
  "error": {
    "code": "content_version_conflict",
    "message": "stale content revision",
    "details": {
      "resourceId": "entry-id",
      "submittedRevisionId": "rev-old",
      "currentRevisionId": "rev-new",
      "conflictKind": "stale_revision",
      "resolutionHint": "refresh"
    },
    "requestId": "request-id"
  }
}
```

## Preview

Preview must:

- expose unpublished state only with preview-scoped credentials
- avoid creating a full admin session
- keep public delivery routes free of draft leakage

Preview token issuance belongs to the auth/session surface; content routes consume the preview credential but do not define token minting rules themselves.

## Revisions

Revision access must support:

- listing revisions for a resource
- reading a revision snapshot
- restoring a revision where the feature allows it

## Acceptance Checks

- Draft and preview flows do not leak unpublished content publicly.
- Revision-aware mutations can detect and reject stale writes.
- Autosave does not redefine publish semantics.

## Non-goals (current)

- Final collaborative editing protocol
- Final UI affordances for diffing and merge resolution
