import { afterEach, expect, it } from "vitest";

import {
  LOCAL_BACKUP_PRINCIPAL_ID,
  clearStandingDraftLocalBackup,
  readStandingDraftLocalBackup,
  writeStandingDraftLocalBackup,
} from "../standing-draft-local-backup";

/**
 * @file Tovu's positional adapter over Jini's standing-draft local backup. The contract it owns is
 * the exact `localStorage` key prefix (`tovu.admin.standing-draft-backup.`): a refused draft parked
 * before the extraction must still be found under the same key, with or without a principal.
 */

afterEach(() => { localStorage.clear(); });

const draft = { bodyFormat: "doc" as const, bodyJson: { type: "doc" }, title: "Hello", slug: "hello", baseVersion: 3 };

it("parks an unattributed draft under the legacy key and reads it back stamped with the local principal", () => {
  writeStandingDraftLocalBackup("entry-1", draft, "2026-10-21T00:00:00.000Z");
  expect(Object.keys(localStorage)).toEqual(["tovu.admin.standing-draft-backup.entry-1"]);
  expect(readStandingDraftLocalBackup("entry-1")).toEqual({ ...draft, savedAt: "2026-10-21T00:00:00.000Z", savedByPrincipalId: LOCAL_BACKUP_PRINCIPAL_ID });
  clearStandingDraftLocalBackup("entry-1");
  expect(readStandingDraftLocalBackup("entry-1")).toBeNull();
  expect(localStorage.length).toBe(0);
});

it("keys a principal's draft by principal and entry, separately from another principal's", () => {
  writeStandingDraftLocalBackup("entry 1", draft, "2026-10-21T00:00:00.000Z", { principalId: "user/a" });
  expect(Object.keys(localStorage)).toEqual(["tovu.admin.standing-draft-backup.user%2Fa.entry%201"]);
  expect(readStandingDraftLocalBackup("entry 1", { principalId: "user/a" })).toMatchObject({ title: "Hello", savedByPrincipalId: "user/a" });
  expect(readStandingDraftLocalBackup("entry 1", { principalId: "user/b" })).toBeNull();
  clearStandingDraftLocalBackup("entry 1", { principalId: "user/b" });
  expect(localStorage.length).toBe(1);
  clearStandingDraftLocalBackup("entry 1", { principalId: "user/a" });
  expect(localStorage.length).toBe(0);
});
