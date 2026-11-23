// Gate B extraction inventory: load, validate and query `development/boundaries/extraction-inventory.json`.
//
// The inventory says, per production file, whether it is bound for Jini (`bound`), stays in Tovu (`host`),
// is split between the two (`mixed`, with the moved and retained export names), or is gone with a recorded
// destination (`retired`). Roots extend that table to files that do not exist yet:
//   - themeRoots     -> host-owned by the owner's 2026-11-22 decision, so a new theme file never enters scope;
//   - boundRoots     -> every file there was bound at seed, so a new file enters scope with zero allowance;
//   - forbiddenRoots -> host composition/transport that bound code must not import.
// A root ending in "/" is a directory prefix; any other root names one exact file. Paths are repo-relative POSIX.
import fs from "node:fs";
import path from "node:path";

export const INVENTORY_FILE = "development/boundaries/extraction-inventory.json";
export const THEME_DISPOSITION = "stays: owner 2026-11-22";

const TOP_KEYS = new Set(["_comment", "planSha", "themeRoots", "forbiddenRoots", "boundRoots", "rows"]);
const ROOT_KEYS = ["themeRoots", "forbiddenRoots", "boundRoots"];
const ROW_KEYS = new Set(["path", "step", "area", "dest", "k", "scope", "disposition", "owner", "hostSymbols", "movedSymbols"]);
const SCOPES = new Set(["bound", "host", "mixed", "retired"]);
const NEEDS_DEST = new Set(["bound", "mixed", "retired"]);
const IN_SCOPE = new Set(["bound", "mixed"]);

/** @typedef {{ path: string, step: string|null, area: string|null, dest: string|null, k: unknown[], scope: "bound"|"host"|"mixed"|"retired", disposition: string, owner: string, hostSymbols?: string[], movedSymbols?: string[] }} InventoryRow */
/** @typedef {{ _comment?: string, planSha: string, themeRoots: string[], forbiddenRoots: string[], boundRoots: string[], rows: InventoryRow[] }} Inventory */

/** Normalises a path to repo-relative POSIX form ("./a\\b" -> "a/b"). */
function normalizePath(required, _optional = {}) {
  return required.path.replaceAll("\\", "/").replace(/^(\.\/)+/, "");
}

/** True when `path` equals an exact-file root or sits under a directory root. */
function isUnderRoot(required, _optional = {}) {
  const { path: file, root } = required;
  return root.endsWith("/") ? file.startsWith(root) : file === root;
}

/**
 * Reads and parses the inventory under `root`.
 * @param {{ root: string }} required
 * @returns {Inventory}
 */
export function loadInventory(required, _optional = {}) {
  const file = path.join(required.root, INVENTORY_FILE);
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (error) {
    throw new Error(`cannot read ${INVENTORY_FILE}: ${error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`invalid JSON in ${INVENTORY_FILE}: ${error.message}`);
  }
}

function shapeErrors(required, _optional = {}) {
  const { inventory } = required;
  const errors = Object.keys(inventory).filter((key) => !TOP_KEYS.has(key)).map((key) => `unknown key: ${key}`);
  if (typeof inventory.planSha !== "string" || !inventory.planSha) errors.push("missing planSha");
  for (const key of [...ROOT_KEYS, "rows"]) if (!Array.isArray(inventory[key])) errors.push(`${key} must be an array`);
  return errors;
}

const isText = (value) => typeof value === "string" && value.length > 0;
const symbolsListed = (row) => Array.isArray(row.hostSymbols) && Array.isArray(row.movedSymbols) && row.movedSymbols.length > 0;

// Every row must say who owns it and where it goes (bound/mixed/retired) or why it stays (host).
const OWNERSHIP_CHECKS = [
  [(row) => !isText(row.owner), () => "row missing owner"],
  [(row) => typeof row.disposition !== "string", () => "row missing disposition"],
  [(row) => NEEDS_DEST.has(row.scope) && !isText(row.dest), (row) => `${row.scope} row missing dest`],
  [(row) => row.scope === "host" && !isText(row.disposition), () => "host row missing disposition"],
  [(row) => row.scope === "mixed" && !symbolsListed(row), () => "mixed row needs hostSymbols and movedSymbols"],
];

/** Errors for one row that do not depend on its neighbours or the disk. */
function rowFieldErrors(required, _optional = {}) {
  const { row, themeRoots } = required;
  const where = row.path ?? "<no path>";
  const errors = Object.keys(row).filter((key) => !ROW_KEYS.has(key)).map((key) => `${where}: unknown key: ${key}`);
  if (!SCOPES.has(row.scope)) errors.push(`${where}: bad scope ${JSON.stringify(row.scope)}`);
  for (const [fails, message] of OWNERSHIP_CHECKS) if (fails(row)) errors.push(`${where}: ${message(row)}`);
  // GB.1: theme roots are host-owned. A theme file can return to scope only by splitting it at the seam,
  // with the generic half in a new file outside the theme root.
  if (IN_SCOPE.has(row.scope) && themeRoots.some((root) => isUnderRoot({ path: where, root }))) errors.push(`${where}: bound row inside theme root`);
  return errors;
}

function rowListErrors(required, _optional = {}) {
  const { inventory, root } = required;
  const errors = [];
  inventory.rows.forEach((row, index) => {
    errors.push(...rowFieldErrors({ row, themeRoots: inventory.themeRoots }));
    const previous = inventory.rows[index - 1];
    if (previous && previous.path === row.path) errors.push(`${row.path}: duplicate row`);
    else if (previous && previous.path > row.path) errors.push(`${row.path}: unsorted rows (after ${previous.path})`);
    // A retired row records where a file went, so only live scopes must still point at a real file.
    if (row.scope !== "retired" && typeof row.path === "string" && !fs.existsSync(path.join(root, row.path))) errors.push(`${row.path}: file no longer exists (retire the row with its destination)`);
  });
  return errors;
}

/** True when a head root list still covers `root`: kept as is, or widened to an ancestor directory. */
function rootStillCovered(required, _optional = {}) {
  const { root, headRoots } = required;
  return headRoots.some((head) => head === root || (head.endsWith("/") && root.startsWith(head)));
}

/** Base entries of `key` that the head no longer has, as `<entry>: <message>` lines. */
function missingFromHead(required, _optional = {}) {
  const { base, key, kept, message } = required;
  return (base[key] ?? []).filter((entry) => !kept(entry)).map((entry) => `${entry.path ?? entry}: ${message}`);
}

function baseErrors(required, _optional = {}) {
  const { inventory, base } = required;
  const headPaths = new Set(inventory.rows.map((row) => row.path));
  return [
    // Removing a row silently shrinks scope; leaving scope needs a recorded retired/host disposition instead.
    ...missingFromHead({ base, key: "rows", kept: (row) => headPaths.has(row.path), message: "dropped inventory row (record it as retired or host)" }),
    ...missingFromHead({ base, key: "boundRoots", kept: (root) => rootStillCovered({ root, headRoots: inventory.boundRoots }), message: "narrowed root (bound root removed or narrowed)" }),
    ...missingFromHead({ base, key: "forbiddenRoots", kept: (root) => inventory.forbiddenRoots.includes(root), message: "forbidden root removed" }),
    ...missingFromHead({ base, key: "themeRoots", kept: (root) => inventory.themeRoots.includes(root), message: "theme root removed" }),
  ];
}

/**
 * Every problem with the inventory, as human-readable lines. Empty = valid.
 * @param {{ inventory: Inventory, root: string }} required
 * @param {{ base?: Inventory }} [optional] the inventory at the trusted base, to reject narrowing
 * @returns {string[]}
 */
export function validateInventory(required, optional = {}) {
  const { inventory, root } = required;
  const shape = shapeErrors({ inventory });
  if (shape.length) return shape;
  const errors = rowListErrors({ inventory, root });
  // A bound root that CONTAINS a theme root is harmless (classifyPath checks theme roots first); one inside
  // a theme root would contradict the owner's disposition for every file under it.
  for (const boundRoot of inventory.boundRoots) {
    if (inventory.themeRoots.some((theme) => boundRoot.startsWith(theme))) errors.push(`${boundRoot}: bound root inside theme root`);
  }
  if (optional.base) errors.push(...baseErrors({ inventory, base: optional.base }));
  return errors;
}

/**
 * Scope of one repo-relative path. An exact row wins over any root rule, so a split theme file or a host
 * file inside a bound root keeps its recorded disposition.
 * @param {{ inventory: Inventory, path: string }} required
 * @returns {{ scope: "bound"|"host"|"mixed"|"retired"|"out", row?: InventoryRow, disposition?: string }}
 */
export function classifyPath(required, _optional = {}) {
  const { inventory } = required;
  const file = normalizePath({ path: required.path });
  const row = inventory.rows.find((candidate) => candidate.path === file);
  if (row) return { scope: row.scope, row, disposition: row.disposition };
  if (inventory.themeRoots.some((root) => isUnderRoot({ path: file, root }))) return { scope: "host", disposition: THEME_DISPOSITION };
  if (inventory.boundRoots.some((root) => isUnderRoot({ path: file, root }))) return { scope: "bound" };
  return { scope: "out" };
}

/**
 * True when importing `target` from `importer` crosses into a forbidden host root. An edge that stays inside
 * the same root is exempt from that root's rule (GB/B2: bound platform and admin-http rows may use their
 * siblings); the caller still traverses such edges for reachability to other forbidden targets.
 * @param {{ inventory: Inventory, importer: string, target: string }} required
 * @returns {boolean}
 */
export function isForbiddenTarget(required, _optional = {}) {
  const importer = normalizePath({ path: required.importer });
  const target = normalizePath({ path: required.target });
  return required.inventory.forbiddenRoots.some((root) => {
    if (!isUnderRoot({ path: target, root })) return false;
    // An exact-file root has no inside, so every importer other than the file itself is outside it.
    const internal = root.endsWith("/") ? importer.startsWith(root) : importer === root;
    return !internal;
  });
}
