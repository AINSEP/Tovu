import type { ContentDb, ContentDbOpenOptions } from "#src/platform/db/sqlite/content-db";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import type { ProjectStore } from "../project-store.js";
import type { RouteDeps } from "../../../routes/types.js";
import { describeSiteBinding, type SiteBinding } from "#src/platform/site-dir/index";
import type { SiteStore, SiteStoreRole } from "../open-site-store.js";
import { bootProviderPlugins } from "../provider-plugins.js";
import { resolveWorkspace } from "#src/platform/site-dir/resolve-workspace";
import { siteThemesDir } from "../site-paths.js";

/**
 * SPEC-003 (ADR-PIPE-003 C-010) — an already-opened db + a resolved workspace id, supplied by
 * the install-dir boot path (`site-dir/boot-site-dir.ts`) instead of this function opening its
 * own db. `db`/`workspaceId` are required together or omitted together (validated below) — there
 * is no legal state where only one is supplied. `uploadsDir` is independent of that pair.
 */
export interface CreateSiteRouteDepsOverrides {
  /** Test seam: replaces provider-plugin selection/initialization (fakes; never a vendor call). */
  bootProviderPlugins: typeof bootProviderPlugins;
  /** Test seam: the project store (`project-store.ts`); resolving to undefined means "none". */
  openProjectStore: () => Promise<ProjectStore | undefined>;
  sqliteOpen: ContentDbOpenOptions["open"];
  /** DB placement may differ from the site root or from content.db. */
  chatDbPath: string;
  publishContentPeerHttpClient: RouteDeps["publishContentPeerHttpClient"];
  nativeApprovalMemory: RouteDeps["nativeApprovalMemory"];
  approvalIdentityForRun: RouteDeps["approvalIdentityForRun"];
  db: ContentDb;
  workspaceId: string;
  /** Consecutive plugin hook failures before automatic quarantine. */
  pluginFailureThreshold: number;
  /**
   * Install-dir-relative uploads path — `cli/commands/serve.ts` supplies `<dir>/uploads` (CR-R01
   * fix: uploads used to always default to `mediaUploadsDir()`, which is `process.cwd()`-relative
   * and therefore wrong whenever `tovu serve <dir>` is invoked from outside that dir). Omitted, it
   * falls back to `mediaUploadsDir()` — the legacy same-directory dev boot's existing behavior.
   */
  uploadsDir: string;
  /**
   * Install-dir-relative themes path — `cli/commands/{serve,export}.ts` supply `<dir>/themes`, for
   * exactly the reason `uploadsDir` above exists (CR-R01): the default {@link siteThemesDir} is
   * `process.cwd()`-relative, so `tovu serve <dir>` invoked from outside `<dir>` would otherwise
   * seed and serve a `sites/tovu-dev/themes` next to wherever the operator happened to be standing
   * rather than the site it was told to run. Omitted, it falls back to {@link siteThemesDir}.
   */
  themesDir: string;
  /**
   * The `RouteDeps.siteBinding` value this boot should carry — supplied by `cli/commands/serve.ts`
   * for the install-dir path (`{dir: target, ..., switcherCompatible: false}`, since `target` bears
   * no `{cwd, env}`-relative relationship to any `sites/` folder). Omitted, it falls back to
   * `describeSiteBinding()` — the legacy same-process default boot's existing behavior, unchanged.
   * See `RouteDeps.siteBinding`'s own doc for the full defect this fixes.
   */
  siteBinding: SiteBinding;
  /**
   * Which process opens the site's store (`open-site-store.ts`): the agent daemon passes
   * `"client"`; omitted means `"owner"` (the API process, which also runs the guest-chat sweep).
   */
  storeRole: SiteStoreRole;
  /**
   * The owner's guest-chat expiry sweep timing (`startChatExpirySweep`): its re-run interval and
   * clock. Omitted, the sweep runs hourly on `Date.now`; tests pass a short interval and a
   * controlled clock to observe later passes and closing during one.
   */
  chatExpirySweep: { intervalMs?: number; now?: () => number };
  /**
   * A workspace id to serve, validated against the store this call opens (`resolveWorkspace`
   * rejects an id with no row). The Postgres/PGlite form of `db` + `workspaceId`, which need the
   * SQLite handle the id was validated against; see {@link createSiteRouteDepsForWorkspace}.
   */
  requestedWorkspaceId: string;
  /**
   * An already opened Postgres/PGlite store, supplied with `workspaceId` by the install-dir boot
   * path (`bootSiteDir` opened, migrated and resolved it) — the non-SQLite form of `db`, so one
   * boot never opens a second pool. Its opener closes it, through the store `onStoreOpened` hands
   * back (`closeSiteDirBoot`), so the composition's chat sweep stops first.
   */
  store: SiteStore;
  /**
   * Called once, before the rest of the composition is built, with the composition's store: the one
   * this call opened, or the supplied `store` (a supplied SQLite `db` is still wrapped with the
   * `chat.db` this call opens). Its `close()` stops the guest-chat sweep, waiting for a pass in
   * flight, then closes the underlying store, so the caller closes this one rather than its own
   * reference. The default boot (`index.ts`) closes it on shutdown and hands a PGlite owner's socket
   * to the agent daemon. When the composition fails after this, it has already closed what it opened
   * (and stopped the sweep on a supplied store).
   */
  onStoreOpened: (required: { store: SiteStore }, optional?: Record<string, never>) => void;
  /**
   * HARNESS ONLY: exact loopback origins (`http://127.0.0.1:<port>`) the assistant's URL tools may
   * reach — a site-import journey's offline fixture site. Supplied only by
   * `development/e2e/support/site-import-api.ts`; `index.ts` and `tovu serve` never pass it, and
   * omitted it builds exactly the production clients (`platform/http/test-origin-allowlist.ts`).
   */
  outboundTestOrigins: readonly string[];
}

/**
 * 2026-08-20 (complexity pass) — CIC U-001 / Contract Map C-010's paired-override guard, hoisted
 * out of `createSiteRouteDeps`. Each `overrides?.field` read is its own branch under ESLint's
 * `complexity` rule; splitting the two reads plus the comparison `if` into their own 4-line
 * function moves those 3 points of complexity here instead of onto the composition root, without
 * changing what gets checked or when.
 */
export function assertOverridesPairedOrAbsent(overrides?: Partial<CreateSiteRouteDepsOverrides>): void {
  const hasOverrideDb = overrides?.db !== undefined || overrides?.store !== undefined;
  const hasOverrideWorkspaceId = overrides?.workspaceId !== undefined;
  if (hasOverrideDb !== hasOverrideWorkspaceId) {
    throw new Error(
      "createSiteRouteDeps: overrides.db (or overrides.store) and overrides.workspaceId must be supplied together or not at all"
    );
  }
}

/**
 * Builds `composePluginRuntime`'s optional `failureThreshold` field from `overrides` — the exact
 * undefined-check-and-conditional-spread shape `apps/website/src/server/runtime/composition/app.ts`'s `createRouteDeps` repeats for its
 * own optional `composePluginRuntime` fields, hoisted here for the same reason
 * {@link assertOverridesPairedOrAbsent} is: one ternary counted once, not inline in the composition
 * root.
 */
export function pluginFailureThresholdOverride(
  overrides?: Partial<CreateSiteRouteDepsOverrides>
): { failureThreshold?: number } {
  return overrides?.pluginFailureThreshold === undefined ? {} : { failureThreshold: overrides.pluginFailureThreshold };
}

/**
 * 2026-09-03 (complexity pass) — `overrides.themesDir ?? siteThemesDir(...)`, hoisted out of
 * `createSiteRouteDeps` for the same reason {@link assertOverridesPairedOrAbsent} is: one `??`
 * counted once here, not inline in the composition root. The default is under the served
 * `siteBinding`'s directory, not {@link siteDir}'s.
 */
export function resolveThemesDirOverride(siteBinding: SiteBinding, overrides?: Partial<CreateSiteRouteDepsOverrides>): string {
  return overrides?.themesDir ?? siteThemesDir({ siteDir: siteBinding.dir });
}

/**
 * `overrides.siteBinding ?? describeSiteBinding()`, hoisted for the same reason
 * {@link resolveThemesDirOverride} is: one `??` counted once here, not inline in the composition
 * root. See `CreateSiteRouteDepsOverrides.siteBinding`'s own doc for why the install-dir boot
 * path (`cli/commands/serve.ts`) must supply an explicit value rather than let this default apply.
 */
export function resolveSiteBindingOverride(overrides?: Partial<CreateSiteRouteDepsOverrides>): SiteBinding {
  return overrides?.siteBinding ?? describeSiteBinding();
}

/**
 * 2026-09-03 (complexity pass) — `overrides.workspaceId ?? resolveWorkspace({ kernel }).id`, hoisted
 * for the same reason {@link assertOverridesPairedOrAbsent} is. CIC U-001 (Workspace-id
 * single-source-of-truth) still holds: this remains the sole `resolveWorkspace` call site: moving
 * it into its own function does not add a second one.
 */
export async function resolveWorkspaceIdOverride(kernel: ContentKernel, overrides?: Partial<CreateSiteRouteDepsOverrides>): Promise<string> {
  if (overrides?.workspaceId !== undefined) return overrides.workspaceId;
  const requested = overrides?.requestedWorkspaceId;
  return (await resolveWorkspace({ kernel }, requested === undefined ? {} : { workspaceId: requested })).id;
}
