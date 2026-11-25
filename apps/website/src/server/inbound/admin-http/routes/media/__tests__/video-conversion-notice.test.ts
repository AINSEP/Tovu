import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import { createNoopTracker } from "@jini-ai/diagnostics/observability";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import express from "express";

import type { MediaTranscoderPort } from "@jini-ai/cms/media";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import type { HttpClientPort } from "#src/platform/http/index";
import { registerAdminMediaImportUrlRoute, registerAdminMediaUploadRoute } from "#src/server/runtime/composition/modules/media";

/**
 * @file B-VIDEO-NOTE.T: a conversion that fails after the original was stored answers 201 with the
 * original and the fixed `conversionNotice` code, on BOTH mounted import paths (direct upload and URL
 * import). The provider's cause stays in the injected note sink, never in the response. The threshold
 * is injected small so a 32-byte fake video is "over" it.
 */

const MP4_VIDEO = Buffer.concat([Buffer.from([0, 0, 0, 32]), Buffer.from("ftypisom"), Buffer.from([0, 0, 0, 0]), Buffer.from("isomiso2avc1mp41")]);
const CONVERTED_MP4 = new Uint8Array([0, 0, 0, 24, ...Buffer.from("ftypmp42"), 0, 0, 0, 0, ...Buffer.from("mp42isom")]);
const CANARY = "CANARY-91c /srv/provider/ffmpeg: license server said no";

async function mounted(t: TestContext, transcode: MediaTranscoderPort["transcode"]) {
  const base = createRouteDeps();
  const mediaImportHttpClient: HttpClientPort = { async send() {
    return { status: 200, headers: { "content-type": "video/mp4" }, bodyText: "", bodyBytes: MP4_VIDEO };
  } };
  const deps = { ...base, tracker: createNoopTracker({}), mediaImportHttpClient, authorize: async () => ({ allowed: true, reason: "test" }) };
  const causes: unknown[] = [];
  const videoImport = { ports: { transcoder: { transcode } }, reportNote: ({ cause }: { cause: unknown }) => { causes.push(cause); }, thresholdBytes: 10 };
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  app.use((_req, res, next) => { res.locals.principal = { id: "notice-owner" }; next(); });
  registerAdminMediaUploadRoute({ app, deps }, { videoImport });
  registerAdminMediaImportUrlRoute({ app, deps }, { videoImport, logEgressRefusal: () => {} });
  const origin = await startTestServer(app, t);
  const post = async (path: string, body: unknown) => {
    const response = await fetch(`${origin}/api/admin/v1/workspaces/${base.workspaceId}/media${path}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, text, json: JSON.parse(text) as { media: { id: string }; conversionNotice?: string } };
  };
  return {
    deps, causes,
    upload: () => post("", { filename: "Holiday.mp4", contentType: "video/mp4", dataBase64: MP4_VIDEO.toString("base64") }),
    importUrl: () => post("/import-url", { url: "https://cdn.example/Holiday.mp4", filename: "Holiday.mp4" }),
  };
}

test("mounted upload and URL import: a failed conversion answers with the original and the fixed notice, never the cause", async (t) => {
  let attempts = 0;
  const { deps, causes, upload, importUrl } = await mounted(t, async () => { attempts += 1; throw new Error(CANARY); });

  for (const send of [upload, importUrl]) {
    const before = attempts;
    const { status, text, json } = await send();
    assert.equal(status, 201);
    assert.equal(attempts, before + 1, "the converter is attempted once per request");
    assert.equal(json.conversionNotice, "web-copy-unavailable");
    assert.ok(await deps.mediaRepo.findById({ workspaceId: deps.workspaceId, id: json.media.id }), "the original still resolves");
    assert.ok(!text.includes("CANARY-91c") && !text.includes("/srv/provider"), "the provider cause never reaches the response");
  }
  assert.equal(causes.length, 2, "each cause went to the injected diagnostic sink");
});

test("mounted upload and URL import: a successful conversion answers without a conversion notice", async (t) => {
  const { upload, importUrl } = await mounted(t, async () => ({ ok: true, bytes: CONVERTED_MP4 }));
  for (const send of [upload, importUrl]) {
    const { status, json } = await send();
    assert.equal(status, 201);
    assert.ok(!("conversionNotice" in json));
  }
});
