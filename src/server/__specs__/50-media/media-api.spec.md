# Spec: Media API

## Goal

Define the server contract for uploads, media records, metadata extraction, derivative generation handoff, and authorized retrieval.

## Core Responsibilities

The server must own:

- upload authorization
- content-type and size validation
- attachment or asset record creation
- metadata extraction triggers
- derivative processing handoff
- access-controlled retrieval and mutation

## Upload Flows

The server should support one or both of:

- direct multipart upload to the server
- pre-signed or delegated upload flow with server-side session initiation

Regardless of transport, the server remains authoritative for:

- who may upload
- what workspace/system scope the media belongs to
- what metadata record is created

## Validation

Before a media object is accepted, the server must be able to validate:

- allowed mime/category
- file size
- workspace quota or policy limits
- basic integrity expectations

## Processing Handoff

Long-running media work must be handed off to background execution rather than blocking the request:

- image derivatives
- transcoding
- metadata enrichment
- virus/security scanning where adopted

The server must expose a processing state contract for media records:

- `pending`
- `processing`
- `ready`
- `failed`
- `quarantined`

If media creation completes before long-running processing completes, the route must either:

- return `201` with the created media record and `processing.status`
- or return `202` with the shared job-tracking response defined by `80-platform/tenancy-and-jobs.spec.md`

Upload completion must not imply derivative/scanning completion unless `processing.status = "ready"`.

## Common Failure Codes

Media routes should reuse shared transport categories while emitting stable media-specific error codes such as:

- `media_type_unsupported`
- `media_quota_exceeded`
- `media_processing_failed`
- `media_not_ready`
- `media_quarantined`

## Retrieval And Mutation

The server contract must support:

- media listing and lookup
- metadata updates where allowed
- deletion or soft deletion
- signed or scoped download access where needed

## Acceptance Checks

- Upload auth is enforced before storage is accepted.
- Metadata records remain server-owned even when storage is delegated.
- Long-running processing is not hidden as synchronous route work.
- Media responses expose enough processing state for clients to distinguish uploaded from ready.

## Non-goals (current)

- Final storage provider choice
- Final media derivative matrix
