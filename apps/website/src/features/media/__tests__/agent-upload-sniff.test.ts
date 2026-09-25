import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import {
  InMemoryAssetBlobRepo,
  InMemoryAssetRenditionRepo,
  InMemoryMediaContentTypeStore,
  InMemoryMediaRepo,
  InMemoryBlobStore,
  InMemoryTransformDefinitionRepo,
} from "../index.js";
import type { RouteDeps } from "../../../server/routes/types.js";
import { buildAssistantToolRegistrations } from "../../../assistant/tool-registrations.js";
import { resetToolContributorsForTests, registerToolContributor } from "../../../assistant/tool-contribution-registry.js";
import { contributeMediaTools } from "../tool-registrations.js";

/**
 * Row 11 (medium, 2026-09-24 web-medium batch): `media_upload_asset` (the assistant tool path)
 * checked only the caller's DECLARED `contentType` against `DEFAULT_ALLOWED_MIME_TYPES` — the same
 * shape Jini's `uploadMedia()` itself checks — so an SVG declared as `image/png` sailed straight
 * through and was stored under a false label. `buildRecordUploadContentType` (`tool-registrations.ts`)
 * now sniffs the real bytes via `assertAllowedSniffedContentType` (`upload-content-type.ts`) and
 * rejects before recording, the same rejection `resolveUploadContentType`'s declared-type check
 * already throws for the HTTP upload route. Jini's `media_upload_asset` handler rolls back the
 * media/blob/rendition rows `uploadMedia()` had already written once this hook throws, so no row
 * survives under the wrong label.
 */

resetToolContributorsForTests();
registerToolContributor(contributeMediaTools());

const WORKSPACE_ID = "ws-media-tools";
const PRINCIPAL_ID = "principal-under-test";
const NOW = "2026-09-24T00:00:00.000Z";

const SVG_BYTES = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', "utf8");

function executionContext(input: Record<string, unknown>): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

function fakeRouteDeps() {
  const mediaRepo = new InMemoryMediaRepo();
  const assetBlobRepo = new InMemoryAssetBlobRepo();
  const assetRenditionRepo = new InMemoryAssetRenditionRepo();
  const blobStore = new InMemoryBlobStore();
  const mediaContentTypeStore = new InMemoryMediaContentTypeStore();
  const transformDefinitionRepo = new InMemoryTransformDefinitionRepo();
  let counter = 0;
  const deps = {
    authorize: async () => ({ allowed: true, reason: "matched" }),
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `id-${++counter}` },
    mediaRepo,
    assetBlobRepo,
    assetRenditionRepo,
    blobStore,
    mediaContentTypeStore,
    transformDefinitionRepo,
  };
  return { deps: deps as unknown as RouteDeps, mediaRepo };
}

function wired(toolId: string, deps: RouteDeps): ToolRegistration {
  const found = new Map(buildAssistantToolRegistrations(deps).filter((r) => r.descriptor.id.startsWith("media_")).map((r) => [r.descriptor.id, r])).get(toolId);
  assert.ok(found, `expected '${toolId}' to be wired`);
  return found;
}

test("media_upload_asset rejects bytes that sniff outside the allowlist even when the declared contentType is an allowed type", async () => {
  const { deps, mediaRepo } = fakeRouteDeps();

  await assert.rejects(
    () => wired("media_upload_asset", deps).handler(
      executionContext({
        dataBase64: SVG_BYTES.toString("base64"),
        filename: "logo.png",
        // Declared type IS on the allowlist — only sniffing the real bytes catches this.
        contentType: "image/png",
      })
    ),
    /the file's content \(image\/svg\+xml\) is not an allowed media type/
  );

  const remaining = await mediaRepo.list({ workspaceId: WORKSPACE_ID });
  assert.deepEqual(remaining, [], "the rejected upload must leave no media row behind");
});
