import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { apiWatchArgs } from "../dev-api-watch.mjs";

const MAPS_OFF = new URL("../dev-source-maps-off.mjs", import.meta.url).href;

// tsx forwards node flags after its own options and after its loader, so --import must follow --exclude.
test("tsx watch excludes generic and absolute plugin snapshots for custom sites homes", () => {
  assert.deepEqual(apiWatchArgs({ sitesHome: "/custom/sites" }, { homeDir: "/home/owner" }), [
    "tsx", "watch", "--exclude", "**/plugins-runtime/**", "--exclude", "/custom/sites/**/plugins-runtime/**",
    "--import", MAPS_OFF, "apps/website/src/index.ts",
  ]);
  assert.deepEqual(apiWatchArgs({}, { homeDir: "/home/owner" }), [
    "tsx", "watch", "--exclude", "**/plugins-runtime/**", "--exclude", "/home/owner/**/plugins-runtime/**",
    "--import", MAPS_OFF, "apps/website/src/index.ts",
  ]);
});

test("both development entrypoints use the same watch exclusions", () => {
  const pkg = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.scripts["dev:server"], "node development/scripts/dev-server.mjs");
  for (const file of ["dev.mjs", "dev-server.mjs"]) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.ok(source.includes('from "./dev-api-watch.mjs"'));
    assert.ok(source.includes("apiWatchArgs({ sitesHome"));
  }
});
