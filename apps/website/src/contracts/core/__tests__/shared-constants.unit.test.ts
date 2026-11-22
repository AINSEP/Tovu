import assert from "node:assert/strict";
import { test } from "node:test";
import { DECLARED_CONTENT_TYPE_OWNERS } from "@jini-ai/cms/content-types/site/declared-content-type-owners";
import { REDIRECT_TABLES } from "#src/contracts/core/redirect-tables";
import { FS_FOLDER_READ_RECOVERY } from "#src/contracts/core/fs-folder-recovery";
import { WIDGET_AREA_CONTENT_TYPE, WIDGET_CONTENT_TYPE } from "@jini-ai/cms/widgets";

/** @file Value pins for constants shared across features, so a move can never change them. */

test("redirect tables keep their persisted names", () => {
  assert.deepEqual(REDIRECT_TABLES, { redirects: "redirects", revisions: "redirect_revisions", hits: "redirect_hits" });
});

test("declared content-type owners cover the widget types and are frozen", () => {
  assert.ok(Object.isFrozen(DECLARED_CONTENT_TYPE_OWNERS));
  assert.ok(WIDGET_CONTENT_TYPE in DECLARED_CONTENT_TYPE_OWNERS);
  assert.ok(WIDGET_AREA_CONTENT_TYPE in DECLARED_CONTENT_TYPE_OWNERS);
});

test("the folder-read recovery names the custom root and both fallbacks", () => {
  assert.match(FS_FOLDER_READ_RECOVERY, /root:"custom"/);
  assert.match(FS_FOLDER_READ_RECOVERY, /media_promote_chat_attachment/);
});
