import { entryRepoFor } from "#src/features/entries/entry-repo";
import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { test } from "node:test";

import { recordingKernel } from "#src/__tests__/lane-su-pins/support/recording-kernel";
import { mediaAccessEvidence } from "#src/features/media/access-evidence";
import type { EntryRecord } from "@jini-ai/cms/entries";
import { EntrySlugConflictError, VersionConflictError } from "@jini-ai/cms/entries";
/**
 * @file S2b T0: the entry repo's write-completion contract on the unmoved code, before its query body moves to Jini
 * `@jini-ai/cms/entries/sql`. After every `save` and every `transaction`, success OR failure, the media access-evidence
 * caches linked to THIS repository are emptied. The REAL cache is used (`mediaAccessEvidence.getCache`, linked to the
 * repo the way composition links it), seeded with one never-resolved pending entry. Each test names the one-line
 * mutation of `repo.ts` that turns it red; the run's report holds the red output of each.
 */

const WS = "ws-1";
const NOW = "2026-09-23T00:00:00.000Z";

function entry(id: string, overrides: Partial<EntryRecord> = {}): EntryRecord {
  return { id, workspaceId: WS, type: "recipe", slug: `slug-${id}`, status: "draft", title: id, bodyJson: null, fieldsJson: { ext: { site: {} } }, publishedAt: null, createdAt: NOW, updatedAt: NOW, version: 1, ...overrides };
}

/** A repo whose linked access-evidence cache holds one pending entry: the cache is non-empty until the repo says so. */
function repoWithSeededCache(kernel = recordingKernel().kernel) {
