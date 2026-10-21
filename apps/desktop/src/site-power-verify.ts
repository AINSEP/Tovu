/**
 * @file The pure half of `scripts/verify-site-power.ts`'s live checks: the card-state shape the run
 * reads off the DOM, the three geometric layout claims (with the tolerance each one carries), the
 * flattened view the checks read, and seeding the isolated profile with the scratch site. All of it
 * is unit-tested here; the live run itself (a real Electron app driven by Playwright) is opt-in and
 * not part of `npm test`.
 */
import path from "node:path";

/** A laid-out element's edges, from `getBoundingClientRect`. */
interface Box {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Everything the first card is currently saying — see `cardState`. */
interface CardState {
  className: string;
  name: string | null;
  status: string;
  port: string | null;
  power: { label: string; disabled: boolean; visible: boolean } | null;
  menuVisible: boolean;
  menuInTile: boolean;
  trashOnCard: boolean;
  actionsInBody: boolean;
  layout: { name: Box | null; menu: Box | null; power: Box | null; details: Box | null; status: Box | null };
  error: string | null;
}

/** One geometric claim's verdict, with the pixels that decided it. */
interface Claim {
  ok: boolean;
  why: string;
}

interface LayoutClaims {
  onNameRow: Claim;
  powerUnderText: Claim;
  statusUnderMenu: Claim;
}

export const MISSING_BOX: Claim = { ok: false, why: 'card is missing a name, a ⋮, a database line or a status' };
/** What `layoutClaims` reports when there is no layout to read: every claim fails, and says why. */
export const NO_LAYOUT: LayoutClaims = { onNameRow: MISSING_BOX, powerUnderText: MISSING_BOX, statusUnderMenu: MISSING_BOX };

/** Vertical centre of a box — rows are centre-aligned in the head grid. */
const middle = (b: Box): number => (b.top + b.bottom) / 2;

/** "align dotes with tovu-com" — the ⋮ sits on the same row as the name, not under it. */
function onNameRow(name: Box, menu: Box): Claim {
  return {
    ok: Math.abs(middle(menu) - middle(name)) <= 4 && menu.left >= name.right,
    why: `⋮ middle ${middle(menu).toFixed(1)} vs name middle ${middle(name).toFixed(1)}; ⋮ left ${menu.left.toFixed(1)} vs name right ${name.right.toFixed(1)}`,
  };
}

/** "put the start/stop under the SQLite" — on the database line's left edge, below row 2. */
function powerUnderText(details: Box, status: Box, power: Box | null): Claim {
  if (power === null) return { ok: true, why: 'no power button for this status' };
  const rowBottom = Math.max(details.bottom, status.bottom);
  return {
    ok: Math.abs(power.left - details.left) <= 1 && power.top >= rowBottom - 1,
    why: `power left ${power.left.toFixed(1)} vs SQLite left ${details.left.toFixed(1)}; power top ${power.top.toFixed(1)} vs row 2 bottom ${rowBottom.toFixed(1)}`,
  };
}

/** "status on the right under the ⋮" — right edges shared, below the ⋮, level with "SQLite". */
function statusUnderMenu(menu: Box, details: Box, status: Box): Claim {
  return {
    ok: Math.abs(status.right - menu.right) <= 1 && status.top >= menu.bottom - 1 && Math.abs(middle(status) - middle(details)) <= 4,
    why: `status right ${status.right.toFixed(1)} vs ⋮ right ${menu.right.toFixed(1)}; status top ${status.top.toFixed(1)} vs ⋮ bottom ${menu.bottom.toFixed(1)}; status middle ${middle(status).toFixed(1)} vs SQLite middle ${middle(details).toFixed(1)}`,
  };
}

/**
 * The three geometric claims the owner's second layout makes, each with the tolerance that belongs
 * to it: sub-pixel rounding for two edges that must line up, and a real gap where one element sits
 * under another. Returns a reason per claim rather than a bare boolean, so a failure names the
 * pixels rather than sending the reader back to the screenshot.
 */
export function layoutClaims(state: CardState | null): LayoutClaims {
  const layout = state === null ? null : state.layout;
  if (!layout || !layout.name || !layout.menu || !layout.details || !layout.status) return NO_LAYOUT;
  return {
    onNameRow: onNameRow(layout.name, layout.menu),
    powerUnderText: powerUnderText(layout.details, layout.status, layout.power),
    statusUnderMenu: statusUnderMenu(layout.menu, layout.details, layout.status),
  };
}

/** True when every one of `layoutClaims`' three claims holds. */
export function allLayoutClaimsHold(claims: LayoutClaims): boolean {
  return claims.onNameRow.ok && claims.powerUnderText.ok && claims.statusUnderMenu.ok;
}

/** A card state with the optional parts flattened out, so the checks below read plain fields
 *  instead of chaining through a possibly-absent card and a possibly-absent power button. Every
 *  field is `undefined` when there was no card at all. */
interface FlatCard {
  name?: string | null;
  status?: string;
  port?: string | null;
  error?: string | null;
  menuVisible?: boolean;
  menuInTile?: boolean;
  trashOnCard?: boolean;
  actionsInBody?: boolean;
  label?: string;
  disabled?: boolean;
  hasPower?: boolean;
}

export function flat(state: CardState | null): FlatCard {
  if (state === null) return {};
  const { power, ...rest } = state;
  return { ...rest, label: power?.label, disabled: power?.disabled, hasPower: power !== null };
}

/** The filesystem surface {@link seedSitePowerProfile} uses — `node:fs` at the composition edge. */
interface SeedFs {
  existsSync(target: string): boolean;
  readFileSync(target: string, encoding: "utf8"): string;
  mkdirSync(target: string, options: { recursive: true }): unknown;
  writeFileSync(target: string, data: string): void;
}

/** Validates `SITE_POWER_SITE_DIR` and seeds the isolated profile with it. Returns the site's
 *  display name, or `null` (after printing the FAIL line) when the directory is not a real site.
 *
 * @param input.siteDir the scratch site (`SITE_POWER_SITE_DIR`), possibly unset.
 * @param input.shotDir where the run's screenshots land; created here.
 * @param input.userDataDir the isolated `TOVU_DESKTOP_USER_DATA_DIR`; created and seeded here.
 * @param ports.now the clock stamped into the seeded project's `createdAt`. */
export function seedSitePowerProfile(
  { siteDir, shotDir, userDataDir }: { siteDir: string | undefined; shotDir: string; userDataDir: string },
  { fs, log, now }: { fs: SeedFs; log: (line: string) => void; now: () => Date },
): string | null {
  if (!siteDir || !fs.existsSync(path.join(siteDir, "config.json"))) {
    log("FAIL:: SITE_POWER_SITE_DIR must name a real Tovu site directory (one with config.json)");
    return null;
  }
  // The display name the seeded card must carry, read from the site's own config.json rather than
  // passed in a second env var that could disagree with it. `CARD_IS_SEEDED_SITE` in the script is
  // the reason this exists.
  const expectedSiteName = (JSON.parse(fs.readFileSync(path.join(siteDir, "config.json"), "utf8")) as { name: string }).name;
  fs.mkdirSync(shotDir, { recursive: true });
  fs.mkdirSync(userDataDir, { recursive: true });
  // The seed a fresh profile cannot produce for itself: `handleList` renders this file and there is
  // no scan that would reach a site outside the scan roots.
  fs.writeFileSync(
    path.join(userDataDir, "desktop-projects.json"),
    JSON.stringify(
      { projects: [{ siteDir, createdAt: now().toISOString(), origin: "adopted" }], dismissed: [] },
      null,
      2,
    ),
  );
  return expectedSiteName;
}

export type { Box, CardState, Claim, FlatCard, LayoutClaims, SeedFs };
