import { writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ADMIN_AGENT_PAGE_PATHS, buildAdminAgentPages, listAdminAgentScreens, type AdminAgentScreen } from "../agent-pages";

/**
 * @file Drift guard for `apps/website/src/features/site-inspection/admin-screens.generated.ts`, the
 * server-side copy of this app's agent-navigable screen list that `site_describe_capabilities`
 * reports.
 *
 * The server cannot import `panels.tsx` (a browser bundle of React render thunks), so that file is
 * generated from {@link listAdminAgentScreens} and checked in. The second test below FAILS the moment
 * the two disagree — a panel added, removed, renamed or relabelled, or a per-route agent page id
 * changed — so the copy can never go stale silently.
 *
 * After an intentional panel change, regenerate from `apps/admin`:
 *   UPDATE_ADMIN_SCREENS_MANIFEST=1 npx vitest run src/lib/__tests__/admin-screens-manifest.unit.test.ts
 *
 * No CI job runs this file while ci.yml is disabled. It runs as the root `npm run
 * check:admin-screens-drift` script, which `development/scripts/ci-local.sh` includes as a gate.
 */

const MANIFEST_PATH = path.resolve(__dirname, "../../../../website/src/features/site-inspection/admin-screens.generated.ts");

/** Renders the generated server-side module. Only this test writes it. */
function renderAdminScreensManifest(screens: readonly AdminAgentScreen[]): string {
  const rows = screens
    .map((screen) => `  { id: ${JSON.stringify(screen.id)}, label: ${JSON.stringify(screen.label)}, path: ${JSON.stringify(screen.path)} },`)
    .join("\n");
  return `/**
 * @file GENERATED — do not edit by hand. The admin app's agent-navigable screens (id, sidebar label,
 * route path relative to \`/admin\`), exactly as \`apps/admin/src/lib/agent-pages.ts\`'s
 * \`listAdminAgentScreens()\` derives them from \`panels.tsx\`'s \`ADMIN_PANELS\`.
 *
 * Checked in because the server cannot import that browser bundle. Guarded by
 * \`apps/admin/src/lib/__tests__/admin-screens-manifest.unit.test.ts\`, which fails when this list and
 * \`ADMIN_PANELS\` disagree. Regenerate from \`apps/admin\`:
 *   UPDATE_ADMIN_SCREENS_MANIFEST=1 npx vitest run src/lib/__tests__/admin-screens-manifest.unit.test.ts
 */

export const ADMIN_SCREENS: readonly { readonly id: string; readonly label: string; readonly path: string }[] = [
${rows}
];
`;
}

describe("listAdminAgentScreens", () => {
  it("is ADMIN_AGENT_PAGE_PATHS in order, each with the label buildAdminAgentPages shows for it", () => {
    const screens = listAdminAgentScreens();
    const pages = buildAdminAgentPages();

    expect(screens.map((screen) => screen.id)).toEqual(Object.keys(ADMIN_AGENT_PAGE_PATHS));
    for (const screen of screens) {
      expect(screen.path).toBe(ADMIN_AGENT_PAGE_PATHS[screen.id]);
      expect(screen.label).toBe(pages[screen.id]?.label);
    }
  });
});

describe("admin-screens.generated.ts (the server-side copy)", () => {
  it("matches listAdminAgentScreens() exactly", async () => {
    const expected = listAdminAgentScreens();
    if (process.env.UPDATE_ADMIN_SCREENS_MANIFEST === "1") {
      writeFileSync(MANIFEST_PATH, renderAdminScreensManifest(expected));
    }

    // Imported through a computed path, not a literal specifier: Vite resolves a literal at
    // transform time, which would fail the whole file before the regenerate branch above could
    // create a missing manifest.
    const { ADMIN_SCREENS } = (await import(/* @vite-ignore */ MANIFEST_PATH)) as {
      ADMIN_SCREENS: readonly AdminAgentScreen[];
    };

    expect(
      ADMIN_SCREENS,
      "apps/website's admin-screens.generated.ts has drifted from ADMIN_PANELS — if the panel change was intentional, regenerate it: cd apps/admin && UPDATE_ADMIN_SCREENS_MANIFEST=1 npx vitest run src/lib/__tests__/admin-screens-manifest.unit.test.ts",
    ).toEqual(expected);
  });
});
