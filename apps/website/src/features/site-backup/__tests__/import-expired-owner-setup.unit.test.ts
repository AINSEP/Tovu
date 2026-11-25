import assert from "node:assert/strict";
import test from "node:test";
import type { SiteImportRecord } from "@jini-ai/core/contracts/site/site-import-history";
import { projectExpiredOwnerSetup } from "@jini-ai/devops/backup/site/import-backend-steps";

const NOW = 1_000_000;
const row = (patch: Partial<SiteImportRecord>): SiteImportRecord => ({
  importId: "import-1", principalId: "owner-1", source: { uploadId: "upload-1" }, newSiteId: null, newSiteName: null, displayName: "Imported site",
  status: "needs-owner", createdAt: "2026-01-01T00:00:00.000Z", expiresAt: NOW + 1, warnings: ["kept"], credentialWarnings: ["kept"], ...patch,
} as SiteImportRecord);

test("an owner setup past its expiry is shown as failed with the plain expiry copy and no stale warnings", () => {
  const projected = projectExpiredOwnerSetup({ row: row({ expiresAt: NOW - 1 }), nowMs: NOW });
  assert.equal(projected.status, "failed");
  assert.equal(projected.error, "Owner setup expired");
  assert.equal(projected.warnings, undefined);
  assert.deepEqual(projected.credentialWarnings, []);
  assert.equal(projected.importId, "import-1");
});

test("an owner setup exactly at its expiry instant is still open", () => {
  const open = row({ expiresAt: NOW });
  assert.equal(projectExpiredOwnerSetup({ row: open, nowMs: NOW }), open);
});

test("an owner setup that has not expired is returned unchanged", () => {
  const open = row({ expiresAt: NOW + 1 });
  assert.equal(projectExpiredOwnerSetup({ row: open, nowMs: NOW }), open);
});

test("only a needs-owner row is projected; other statuses past their expiry keep their state", () => {
  for (const status of ["verifying", "creating", "ready", "failed"] as const) {
    const other = row({ status, expiresAt: NOW - 1, error: status === "failed" ? "kept error" : undefined });
    assert.equal(projectExpiredOwnerSetup({ row: other, nowMs: NOW }), other, status);
  }
});
