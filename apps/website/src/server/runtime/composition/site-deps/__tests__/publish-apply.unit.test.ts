import assert from "node:assert/strict";
import { mock, test } from "node:test";

/**
 * @file The apply-port callbacks `composePublishContentApplyPort` builds itself: a replaced theme tree is
 * rescanned from the site's own themes root, and a post rollback failure is reported with its diagnostic.
 * The apply-port factories are recorders so the deps handed to them can be called directly.
 */

const seen: Record<string, Record<string, unknown>> = {};
const rescans: unknown[] = [];
const applyPort = await import("../../../../../features/publish-content/apply-port.js");
mock.module(new URL("../../../../../features/publish-content/apply-port.js", import.meta.url).href, { namedExports: { ...applyPort,
  toPublishContentApplyDeps: (input: Record<string, unknown>) => { seen.deps = input; return { deps: "converted" }; },
  createPublishContentApplyPort: (input: Record<string, unknown>) => { seen.port = input; return { port: "apply" }; } } });
const theme = await import("../../../../../features/theme/index.js");
mock.module(new URL("../../../../../features/theme/index.js", import.meta.url).href, { namedExports: { ...theme, rescanThemes: (input: unknown) => { rescans.push(input); } } });
mock.module(new URL("../../content-publish-ports.js", import.meta.url).href, { namedExports: { buildContentPublishPorts: () => ({ "content-type": { built: true } }) } });

const { composePublishContentApplyPort } = await import("../publish-apply.js");
type Required = Parameters<typeof composePublishContentApplyPort>[0];

function compose() {
  const siteThemes = { themes: "site" };
  const seedHash = async () => "seed";
  const result = composePublishContentApplyPort({ workspaceId: "ws-1", siteThemes, resolvedThemesDir: "/site/themes", publishContentSeedHash: seedHash,
    identity: { authorize: () => true }, trashRepo: {}, trash: {} } as unknown as Required);
  const ports = seen.deps.ports as { "theme-files": { themesDir: string; onReplaced: () => void }; post: { reportRollbackError: (message: string, diagnostic: string) => void } };
  return { result, ports, siteThemes, seedHash };
}

test("a replaced theme tree is rescanned from the site's own themes root into the site's theme catalog", () => {
  const { result, ports, siteThemes, seedHash } = compose();
  assert.equal(ports["theme-files"].themesDir, "/site/themes");
  assert.deepEqual(rescans, []);
  ports["theme-files"].onReplaced();
  assert.deepEqual(rescans, [{ themes: siteThemes, dir: "/site/themes" }]);
  assert.equal((rescans[0] as { themes: unknown }).themes, siteThemes);
  assert.deepEqual(result.publishContentApplyPort, { port: "apply" });
  assert.deepEqual([seen.port.publishContentDeps, seen.port.getSeedHash === seedHash], [{ deps: "converted" }, true]);
});

test("a post rollback failure is reported to the console with its message and diagnostic", t => {
  const errors = t.mock.method(console, "error", () => undefined);
  compose().ports.post.reportRollbackError("rollback failed", "post-9: row locked");
  assert.deepEqual(errors.mock.calls.map(c => c.arguments), [["rollback failed", "post-9: row locked"]]);
});
