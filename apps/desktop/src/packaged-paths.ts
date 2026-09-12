import path from "node:path";

/** {@link resolveDesktopRoots}'s input. */
interface DesktopRootsInput {
  isPackaged: boolean;
  resourcesPath: string;
  repoRoot: string;
  documentsDir: string;
}

/** The four roots {@link resolveDesktopRoots} decides. */
interface DesktopRoots {
  payloadRoot: string;
  devFallbackSiteDir: string | null;
  siteScanRoots: string[];
  defaultCliMode: "source" | "compiled";
}

/**
 * The four roots this shell resolves differently in a checkout than in a packaged `.app`, decided
 * in ONE place so the dev and packaged answers cannot drift apart call site by call site.
 *
 * `main.js` used to derive all four from a single `REPO_ROOT = path.resolve(__dirname, "..", "..")`,
 * which is the checkout root in dev and points at `…/Tovu.app/Contents/` in a packaged build —
 * where none of them exist. This function is the seam that fixes that, and it is a PURE function of
 * its inputs precisely so the packaged answers are assertable without building a `.app`.
 *
 * **Dev mode is byte-identical to what `main.js` computed before this module existed** — every
 * packaged-mode branch is additive. That is the property `packaged-paths.test.js` pins first.
 *
 * ## The payload root
 *
 * In a checkout the runnable Tovu tree IS the checkout: `dist/src/cli/main.js`, `apps/admin/dist`,
 * `apps/site-chat/dist` and `node_modules` all sit at their repo-relative paths. A packaged build
 * stages that same shape under `Contents/Resources/tovu/` (see
 * `development/scripts/stage-desktop-payload.mjs`), so every consumer — `resolveCliEntry`,
 * `buildServeEnv`'s admin/site-chat dirs — keeps ONE `path.join` that is correct in both modes.
 * Preserving the repo-relative layout is what makes that possible; a flatter staged layout would
 * force every consumer to branch on mode individually.
 *
 * ## The delete-guard boundary moves with `payloadRoot` — deliberately, and it is narrower than it
 * looks
 *
 * `project-delete-guard.js`'s containment rule is "nothing under `repoRoot` may be erased", and
 * `main.js` passes this function's `payloadRoot` as that `repoRoot`. In dev that is the checkout,
 * exactly as before. In a packaged app it becomes the read-only staged payload — which contains no
 * user site and never will, so the rule is vacuous there rather than wrong. What it does NOT do is
 * protect a user's own site folders; that was never this rule's job (it only ever guarded the
 * developer's checkout), and the `origin === "created"` and `isStillTheRecordedSite` conditions in
 * `mayEraseSiteDirectory` remain the real gates. Flagged here because the boundary is
 * security-relevant and a future reader must not assume a packaged build inherits a protection it
 * does not.
 *
 * @param input
 * @param input.isPackaged Electron's `app.isPackaged`. Available at module load — it is
 *   derived from the executable path, not from `whenReady`.
 * @param input.resourcesPath `process.resourcesPath` (`…/Tovu.app/Contents/Resources`).
 *   Read only when `isPackaged`.
 * @param input.repoRoot the checkout root, as `main.js` derives it from `__dirname`.
 * @param input.documentsDir `app.getPath("documents")`. Read only when `isPackaged`.
 * @complexity O(1).
 */
function resolveDesktopRoots(input: DesktopRootsInput): DesktopRoots {
  if (!input.isPackaged) {
    return {
      payloadRoot: input.repoRoot,
      devFallbackSiteDir: path.join(input.repoRoot, "sites", "tovu-com"),
      siteScanRoots: [path.join(input.repoRoot, "sites")],
      // `tsx` over current TypeScript: a checkout's `dist/` is only as fresh as its last manual
      // `npm run build`, which is why source mode exists at all (see `resolveDevCliEntry`).
      defaultCliMode: "source",
    };
  }

  return {
    payloadRoot: path.join(input.resourcesPath, "tovu"),
    // `<repo>/sites/tovu-com` has no packaged counterpart. `null` rather than a path that cannot
    // exist: `resolveDevFallback` already documents and handles the absent case, so this stays a
    // missing precedence tier instead of a tier that always fails classification.
    devFallbackSiteDir: null,
    // The staged payload is read-only, so a packaged app has no `sites/` of its own to scan. This
    // is the user-writable place a site would plausibly live. Deliberately NOT created here —
    // `discoverSiteDirs` tolerates a missing root, and creating a folder in someone's Documents as
    // a side effect of launching is not this function's call to make.
    siteScanRoots: [path.join(input.documentsDir, "Tovu Sites")],
    // A packaged app ships no `apps/website/src/` and no `tsx`, so source mode cannot work. It is
    // also what keeps the agent daemon off `npx`: `daemon-supervisor.ts` spawns `npx tsx` for a
    // `.ts` daemon path and `process.execPath` for a compiled `.js` one, so compiled mode is what
    // removes this app's last dependency on a system Node being installed.
    defaultCliMode: "compiled",
  };
}

export { resolveDesktopRoots };
export type { DesktopRoots, DesktopRootsInput };
