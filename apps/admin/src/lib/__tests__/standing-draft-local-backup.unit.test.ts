import { afterEach, expect, it } from "vitest";

import { LOCAL_BACKUP_PRINCIPAL_ID } from "@jini-ai/ui/panel-kit";
import { standingDraftLocalBackup } from "../shell-collaborators";

/**
 * @file Tovu's binding (`shell-collaborators.ts`'s `standingDraftLocalBackup`) of Jini's standing-draft local backup. The contract it owns is
 * the exact `localStorage` key prefix (`tovu.admin.standing-draft-backup.`): a refused draft parked
 * before the extraction must still be found under the same key, with or without a principal.
 */

afterEach(() => { localStorage.clear(); });

const draft = { bodyFormat: "doc" as const, bodyJson: { type: "doc" }, title: "Hello", slug: "hello", baseVersion: 3 };

it("parks an unattributed draft under the legacy key and reads it back stamped with the local principal", () => {
  standingDraftLocalBackup.write({ entryId: "entry-1", draft, savedAt: "2026-10-21T00:00:00.000Z" });
  expect(Object.keys(localStorage)).toEqual(["tovu.admin.standing-draft-backup.entry-1"]);
  expect(standingDraftLocalBackup.read({ entryId: "entry-1" })).toEqual({ ...draft, savedAt: "2026-10-21T00:00:00.000Z", savedByPrincipalId: LOCAL_BACKUP_PRINCIPAL_ID });
  standingDraftLocalBackup.clear({ entryId: "entry-1" });
  expect(standingDraftLocalBackup.read({ entryId: "entry-1" })).toBeNull();
  expect(localStorage.length).toBe(0);
});

it("keys a principal's draft by principal and entry, separately from another principal's", () => {
  standingDraftLocalBackup.write({ entryId: "entry 1", draft, savedAt: "2026-10-21T00:00:00.000Z" }, { principalId: "user/a" });
  expect(Object.keys(localStorage)).toEqual(["tovu.admin.standing-draft-backup.user%2Fa.entry%201"]);
  expect(standingDraftLocalBackup.read({ entryId: "entry 1" }, { principalId: "user/a" })).toMatchObject({ title: "Hello", savedByPrincipalId: "user/a" });
  expect(standingDraftLocalBackup.read({ entryId: "entry 1" }, { principalId: "user/b" })).toBeNull();
  standingDraftLocalBackup.clear({ entryId: "entry 1" }, { principalId: "user/b" });
  expect(localStorage.length).toBe(1);
  standingDraftLocalBackup.clear({ entryId: "entry 1" }, { principalId: "user/a" });
  expect(localStorage.length).toBe(0);
});
