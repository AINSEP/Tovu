import { redactSecretShapes } from "@tovu/contracts/secret-redaction";
import { createPeerTransport } from "@jini-ai/cms/publish/content/peer-transport";
import { EgressRefusedError } from "#src/platform/http/index";

/**
 * Tovu's outbound peer transport: Jini's driver bound to Tovu's host values. `redactSecretShapes`
 * applies the shared diagnostics rules PLUS Tovu's own API-key shape, which the engine must not know
 * (owner decision B258); `EgressRefusedError` is this app's egress guard refusal; the dev-hosts env
 * name, the product name in operator diagnostics, and the already-saved history row kind are Tovu's.
 */
export const {
  callPeer,
  confirmPeerImport,
  describePeerEgressRefusal,
  executePeerImport,
  pullBlobsFromPeer,
  pullBundleFromPeer,
  pushBundleToPeer,
} = createPeerTransport({
  host: {
    redact: redactSecretShapes,
    asEgressRefusal: ({ err }) => (err instanceof EgressRefusedError ? err : undefined),
    devHostsSetting: "TOVU_PUBLISH_CONTENT_DEV_HOSTS",
    productName: "Tovu",
    history: { kind: "tovu-peer" },
  },
});
