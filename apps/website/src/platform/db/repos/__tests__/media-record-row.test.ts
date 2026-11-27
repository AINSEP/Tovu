import assert from "node:assert/strict";
import test from "node:test";
import type { Selectable } from "kysely";

import type { MediaTable } from "../../content-database.generated.js";
import { toMediaRecord } from "../media-record-row.js";

const row: Selectable<MediaTable> = {
  id: "film-7", workspace_id: "library", created_by: null, kind: "media", original_filename: null,
  title: "An interview", slug: "interview", alt: "", caption: "", credit: "", source_sha256: "a".repeat(64),
  source_metadata_json: null, status: "active", created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-02-01T00:00:00.000Z", version: 2, width: null, height: null, css_class: null,
  html_attributes: null, captions_media_id: "english-track", captions_srclang: "en",
  captions_label: null, description: null,
};

test("a video needs both a captions asset and a language, but not a label", () => {
  assert.deepEqual(toMediaRecord(row).captions, { assetId: "english-track", srclang: "en", label: null });
  assert.equal(toMediaRecord({ ...row, captions_media_id: null }).captions, null);
  assert.equal(toMediaRecord({ ...row, captions_srclang: null }).captions, null);
});
