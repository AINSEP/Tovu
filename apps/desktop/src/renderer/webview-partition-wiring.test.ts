/**
 * @file Contract guard for `SiteRecord.partition` (`contracts/project.ts`), the value each site
 * tab's `<webview partition>` reads so two different sites' logins never share one cookie jar (see
 * `SiteWorkspace`'s own doc in `app/SiteWorkspace.tsx`). `desktop-auth.test.ts` and
 * `project-ipc.test.ts` prove main hands out a distinct `partition` per site dir, and
 * `app/SiteWorkspace.render.test.ts` proves each tab's guest renders on its own site's partition.
 *
 * Source text because what this pins is a TYPE: an optional field compiles to the same JavaScript
 * as a required one, so no rendered test can tell them apart.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const contracts = fs.readFileSync(new URL("../contracts/project.ts", import.meta.url), "utf8");

test("SiteRecord's partition field is a required string, not optional — a workspace cannot silently render with no partition at all", () => {
  const field = contracts.slice(contracts.indexOf("export interface SiteRecord"));
  assert.match(field.slice(0, field.indexOf("export interface CreateSiteDatabaseInput")), /\n  partition: string;\n/);
});
