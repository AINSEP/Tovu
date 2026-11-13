### tovu:apps/website/src/features/publish-content/peer-transport.ts
- **Over:** file 541 lines (no function over)
- **Phase:** now (label ?) · **Batch:** size-08
- **Tests:** `apps/website/src/features/publish-content/__tests__/peer-transport.test.ts`, `.../__tests__/peer-transport.l061.test.ts`, `.../__tests__/peer-transport-blob-pull.test.ts`, `.../__tests__/plan-pull-tool.test.ts`, `apps/website/src/features/site-backup/__tests__/share-hosting.unit.test.ts`, `apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/peer-transport.routes.pins.test.ts`, `apps/website/src/server/__tests__/routes/publish-zero-setup-end-to-end.test.ts`. No test mocks this module.
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A call | `PeerTransportErrorCode`, `PublishContentPeerTransportError`, `describePeerEgressRefusal`, `toTransportError`, `PEER_NETWORK_REASONS`, `peerNetworkReason`, `peerCauseCode`, `PEER_REFUSAL_REASONS`, `peerRefusalReason`, `peerIncidentId`, `peerBodyRefusalReason`, `peerStorageRefusalReason`, `PEER_REQUEST_TIMEOUT_MS`, `PeerCallDeps`, `callPeer`, `isCredentialKindRefusal`, `credentialKindRefusalMessage`, `peerRoute`, `requireObject`, `peerRequestPayload` | one authenticated peer call and its single failure funnel |
| B pull | `pullBundleFromPeer`, `PeerBlobSink`, `PUBLISH_CONTENT_PULL_MAX_BLOBS`, `PullBlobsResult`, `pullBlobsFromPeer`, `fetchVerifiedPeerBlob` | PULL: fetch a peer's envelope and blobs |
| C push (stays) | `PeerBlobSource`, `NotSupportedByLiveEntry`, `PushBundleResult`, `LEGACY_PEER_ENTITY_TYPES`, `LEGACY_PROBE_STATUSES`, `PeerCapabilities`, `refuseOverwriteOnOlderPeer`, `probePeerCapabilities`, `trimBundleToCapabilities`, `pushBundleToPeer`, `confirmPeerImport`, `executePeerImport`, `peerApplyCompleted`, `uploadMissingPeerBlobs` | PUSH steps 1-3 |

- **Splits:**
  1. NEW `peer-call.ts` (same folder) — job: one authenticated peer call + error classification. Moves unit A word for word (keep every "never echo" / incident-envelope comment). Exports `PeerTransportErrorCode`, `PublishContentPeerTransportError`, `describePeerEgressRefusal`, `PEER_REQUEST_TIMEOUT_MS`, `PeerCallDeps`, `callPeer`, `peerRoute`, `requireObject`. Imports nothing from `peer-transport.ts`. Copy the file-header paragraph about the error type/egress refusal into its header.
  2. NEW `peer-transport-pull.ts` — job: the pull driver's peer leg. Moves unit B word for word (the `PUBLISH_CONTENT_PULL_MAX_BLOBS` resource-bound comment moves). Exports `pullBundleFromPeer`, `PeerBlobSink`, `PUBLISH_CONTENT_PULL_MAX_BLOBS`, `PullBlobsResult`, `pullBlobsFromPeer`. Imports from `./peer-call.js` only.
  3. `peer-transport.ts` keeps unit C and imports `callPeer`, `peerRoute`, `requireObject`, `PublishContentPeerTransportError`, `PeerCallDeps` from `./peer-call.js`.
- **Importers to update** (each name → its new module; names not listed stay on `peer-transport`):
  - `PublishContentPeerTransportError` → `peer-call`: `features/publish-content/tool-registrations.ts`, `server/inbound/admin-http/routes/publish-content/peer-transport.ts`, tests `features/publish-content/__tests__/{peer-transport,peer-transport.l061,peer-transport-blob-pull,plan-pull-tool}.test.ts` (plan-pull-tool uses a dynamic `import("../peer-transport.js")`), `server/inbound/admin-http/routes/publish-content/__tests__/peer-transport.routes.pins.test.ts`.
  - `PeerCallDeps` → `peer-call`: `features/publish-content/push-plan.ts` (keep `pushBundleToPeer`, `NotSupportedByLiveEntry` on `peer-transport`), `features/site-backup/share-hosting.ts` (also `callPeer`), `server/inbound/admin-http/routes/publish-content/{peer-transport,backstop}.ts`, tests `features/site-backup/__tests__/{share-hosting.unit,share-delivery.integration}.test.ts`.
  - `callPeer`, `describePeerEgressRefusal` → `peer-call`: `features/publish-content/__tests__/peer-transport.l061.test.ts` (`callPeer`), `.../__tests__/peer-transport.test.ts` (`describePeerEgressRefusal`).
  - `pullBundleFromPeer`, `pullBlobsFromPeer` → `peer-transport-pull`: `features/publish-content/pull.ts`, tests `peer-transport.test.ts`, `peer-transport.l061.test.ts`, `peer-transport-blob-pull.test.ts`.
  Re-run `rg -n "peer-transport(\.js)?['\"]" apps --glob '!node_modules'` and fix every import whose names moved (`#src/features/publish-content/peer-transport` alias form included; the `routes/publish-content/peer-transport.ts` route file is a DIFFERENT module — its own importers do not change).
- **After:** `peer-transport.ts` ~230; `peer-call.ts` ~175; `peer-transport-pull.ts` ~120.
- **Risks / notes:** no behavior moves; only import graph. `PeerBlobSource` stays (composite-blob-source.ts imports it from `peer-transport`).
