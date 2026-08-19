import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { InMemoryPostRepo } from "#src/features/post/index";
import { InMemoryPresentationSettingsRepo } from "#src/features/presentation/index";
import { createApp, createRouteDeps } from "../../../app.js";

/**
 * @file Regression coverage for the "brand-new workspace, no seeded content" 500 on the public
 * site routes (`registerSiteRoutes`, `pages.ts`) — real HTTP requests via `createApp`, with
 * in-memory repos overridden to reproduce a workspace that has a row in `workspaces` but NO
 * `presentation_settings` row yet (a freshly created workspace via SPEC-044's `CREATE_WORKSPACE`
 * admin route, or a `content.db` mid-seed) and no published posts.
 *
 * `getPresentationSettings` (`@jini-ai/cms/presentation`) throws `PresentationSettingsNotFoundError`
 * when `findByWorkspaceId` returns no row — both `pages.ts` route handlers previously let that
 * escape their own `Promise.all` uncaught, so it fell into a blind catch-all (a literal empty
 * `catch {}` on `GET /` and an untyped `catch (err)` fallback on `GET /:slug`) that turned it into
 * a bare 500, indistinguishable from a genuine server fault.
 */

async function startServer(overrides: Partial<ReturnType<typeof createRouteDeps>>) {
  const deps = { ...createRouteDeps(), ...overrides };
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

function closeServer(server: ReturnType<typeof createServer>) {
  return new Promise<void>((resolve) => server.close(() => resolve()));
}

test("GET /welcome: a missing presentation-settings row — not the empty post list — is what must not 500", async (t) => {
  // Both arms below share the identical "no posts seeded yet" condition (WORKSPACE_ID has zero
  // rows in postRepo either way), so the ONLY variable that differs between them is whether the
  // workspace's `presentation_settings` row exists. If both arms 404 the same way, the fix is
  // proven attributable to the missing-settings case specifically — not to some other shared
  // setup detail (an empty post list alone is already known-safe: `getPublishedPostBySlug`
  // throwing `PostNotFoundError` for an unseeded slug is the pre-existing, correct 404 path this
  // file's outer catch already handles).
  //
  // This also rules out the other candidate causes of a bare 500 the brief calls out: a genuinely
  // missing workspace (impossible here — `deps.workspaceId` is always the hardcoded boot-time id,
  // and both arms use the real, present `seededWorkspace` row via `postRepo`/`presentationRepo`
  // only, never `workspaceRepo`), an auth failure (these are public, unauthenticated routes), and
  // a DB connection error (everything here is an in-memory fake — no real DB is touched at all).

  // Baseline arm: presentation settings ARE seeded; no posts. Known-good today.
  const baseline = await startServer({
    postRepo: new InMemoryPostRepo([]),
  });
  t.after(() => closeServer(baseline.server));
  const baselineRes = await fetch(`${baseline.baseUrl}/welcome`);
  assert.equal(
    baselineRes.status,
    404,
    "control: settings present + no posts must already 404 (proves the empty post list alone is not the fault)"
  );

  // Treatment arm: remove ONLY the presentation-settings row — the brand-new/unseeded-workspace
  // condition — keeping the empty post list identical to the baseline.
  const treatment = await startServer({
    presentationRepo: new InMemoryPresentationSettingsRepo([]),
    postRepo: new InMemoryPostRepo([]),
  });
  t.after(() => closeServer(treatment.server));
  const treatmentRes = await fetch(`${treatment.baseUrl}/welcome`);
  assert.equal(
    treatmentRes.status,
    404,
    "a brand-new workspace with no presentation-settings row must 404 the same as any other unseeded slug, not 500"
  );
});

test("GET /: a brand-new workspace with no presentation-settings row renders the empty-state home page instead of 500ing", async (t) => {
  const { server, baseUrl } = await startServer({
    presentationRepo: new InMemoryPresentationSettingsRepo([]),
    postRepo: new InMemoryPostRepo([]),
  });
  t.after(() => closeServer(server));

  const res = await fetch(baseUrl);
  assert.equal(res.status, 200, "home route must render the default-theme empty state, not 500, when settings aren't seeded yet");
});
