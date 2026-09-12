/**
 * @file Wiring guard for `<webview partition={project.partition}>` in `SiteWorkspace` —
 * the binding that keeps two different sites' logins from sharing one cookie jar (see
 * `SiteWorkspace`'s own doc in `App.tsx`, and `contracts/project.ts`'s `partition` field).
 * `desktop-auth.test.ts` and `project-ipc.test.js` prove main hands out a distinct `partition`
 * per site dir; nothing before this file proved the renderer actually threads that value onto
 * the guest element rather than dropping it or hardcoding one partition for every tab.
 *
 * Source text, for the reason every other `*-wiring.test.js` in this directory states at length:
 * `apps/desktop`'s test script runs `.test.js` under plain `node --test`, with no JSX/DOM runner
 * for `.tsx` in this package at all — see `webview-failure-wiring.test.ts`'s header.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const read = (...parts: string[]) => fs.readFileSync(path.join(__dirname, ...parts), "utf8");
const appTsx = read("App.tsx");
const contracts = read("..", "contracts", "project.ts");

/** `SiteWorkspace`'s body, up to the next top-level `function`. */
function workspaceBody() {
  const start = appTsx.indexOf("function SiteWorkspace(");
  assert.notEqual(start, -1, "SiteWorkspace must still exist in App.tsx");
  const rest = appTsx.slice(start);
  const end = rest.indexOf("\nfunction ", 1);
  return rest.slice(0, end === -1 ? undefined : end);
}

/** `SiteWorkspaces`' body (the plural component that maps over open projects). */
function workspacesBody() {
  const start = appTsx.indexOf("function SiteWorkspaces(");
  assert.notEqual(start, -1, "SiteWorkspaces must still exist in App.tsx");
  const rest = appTsx.slice(start);
  const end = rest.indexOf("\nfunction ", 1);
  return rest.slice(0, end === -1 ? undefined : end);
}

test("the guest webview's partition reads off THIS project's own prop, not a shared or hardcoded value", () => {
  const body = workspaceBody();
  assert.match(
    body,
    /<webview[^>]*\bpartition=\{project\.partition\}/s,
    "the webview must bind partition to project.partition — a dropped or renamed prop leaves every guest with no partition at all, sharing one cookie jar",
  );
  // Guards against the regression that still passes a naive "does the string 'partition' appear
  // anywhere" check: a literal partition="..." would compile and render, and every tab would then
  // share ONE session no matter which project it belongs to.
  assert.doesNotMatch(
    body,
    /<webview[^>]*\bpartition="[^{][^"]*"/s,
    "partition must not be a literal string — that would give every open project the same cookie jar",
  );
});

test("each open project gets its OWN SiteWorkspace instance, carrying its own project prop", () => {
  // Combined with the per-instance binding above, this is what makes two different projects render
  // two different partitions: `openSites.map` hands each call site a different `project`, and
  // that same `project` is what the instance's webview reads `partition` from — no lifted or
  // module-level partition value in between that could flatten them to one.
  const body = workspacesBody();
  assert.match(body, /openSites\.map\(\(project\) =>/, "must render one instance per open project, not a single shared instance");
  assert.match(
    body,
    /<SiteWorkspace\s+key=\{project\.id\}\s+project=\{project\}/,
    "each instance must be keyed by and receive its own project, or two tabs could collapse onto the same rendered workspace",
  );
});

test("SiteRecord's partition field is a required string, not optional — a workspace cannot silently render with no partition at all", () => {
  const field = contracts.slice(contracts.indexOf("export interface SiteRecord"));
  assert.match(field.slice(0, field.indexOf("export interface CreateSiteDatabaseInput")), /\n  partition: string;\n/);
});
