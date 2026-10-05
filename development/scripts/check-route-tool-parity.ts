/**
 * check-route-tool-parity.ts — does every admin HTTP route have a chat tool (or a reason not to)?
 *
 * WHY (2026-10-05): the owner found the admin chat could not publish live or delete a form, though
 * the admin UI could. Nothing compared the admin routes with the chat tool catalog, so a feature
 * could ship a route + screen and no tool, silently. This gate makes that list visible.
 *
 * How: boots the hermetic `createApp()` (in-memory repos, nothing persisted), walks the router stack
 * (`lib/admin-route-walk.ts`, shared with `check-admin-api-routes.ts`) for every `/api/admin/**`
 * route, builds the real tool catalog the shipped app builds (`installFirstPartyToolContributors()`
 * + `buildAssistantToolRegistrations()`, via `development/evals/tool-search-eval-registry.ts`) plus
 * the admin-tab frontend capabilities (`admin.publish_content`, `page.*`, ...), and classifies each
 * route against `development/parity/route-tool-parity.json` (`lib/route-tool-parity.ts` documents
 * the entry shapes and the chatless reason vocabulary).
 *
 * REPORT-ONLY: exits 0 whatever it finds, like every other gate while CI is off. `--strict` exits 1
 * when the file is out of step with the app (unclassified new routes, stale entries, unknown tool
 * ids, bad reasons, malformed entries); untriaged entries and gaps never fail it.
 *
 * Usage:
 *   env -u TOVU_ADMIN_PASSWORD TOVU_DB=memory node --import tsx development/scripts/check-route-tool-parity.ts [--seed] [--strict] [--json]
 *   --seed    write every live route into the file: missing routes are added untriaged
 *             (`tools: []` + heuristic `suggested` ids), untriaged ones get fresh suggestions,
 *             classified entries are kept as they are.
 *   --json    print the full report as JSON (for triage tooling) instead of the summary.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createApp, createRouteDeps } from "../../apps/website/src/server/runtime/composition/app.js";
import { FRONTEND_CONTROL_CAPABILITIES } from "../../apps/website/src/assistant/frontend-control-capabilities.js";
import { buildEvalToolRegistry } from "../evals/tool-search-eval-registry.js";
import { listRoutes, type RouterLayer } from "./lib/admin-route-walk.js";
import { classifyParity, hasProblems, seedParity, type ParityFile, type ParityReport, type ParityTool } from "./lib/route-tool-parity.js";

const ABOUT =
  "Route <-> chat-tool parity map, read by development/scripts/check-route-tool-parity.ts. Each admin route is " +
  "{tools:[ids]} (covered), {chatless:'<reason>'} (auth-session | ui-only-asset | streaming-transport | internal-health | " +
  "covered-by-generic:<tool> | intentional:<why>), {gap:'<note>'} (confirmed gap), or {tools:[]} (untriaged; " +
  "`suggested` is a heuristic hint, not coverage).";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const parityFile = path.join(repoRoot, "development/parity/route-tool-parity.json");
const args = new Set(process.argv.slice(2));

function readParityFile(): ParityFile {
  if (!existsSync(parityFile)) return { _about: ABOUT, routes: {} };
  return JSON.parse(readFileSync(parityFile, "utf8")) as ParityFile;
}

async function liveTools(): Promise<ParityTool[]> {
  const deps = createRouteDeps();
  await deps.identityReady;
  const registry = buildEvalToolRegistry(deps as unknown as Parameters<typeof buildEvalToolRegistry>[0]);
  const tools = registry.list({}).map((d) => ({ id: d.id, readOnly: d.readOnly === true }));
  const frontend = FRONTEND_CONTROL_CAPABILITIES.map((c) => ({ id: c.id, readOnly: false }));
  return [...tools, ...frontend];
}

function adminRoutes(): { method: string; path: string }[] {
  const app = createApp(createRouteDeps()) as unknown as { _router: { stack: RouterLayer[] } };
  return listRoutes(app._router.stack).filter((r) => r.path.startsWith("/api/admin/"));
}

function list(title: string, items: readonly string[], max = 40): void {
  if (items.length === 0) return;
  console.log(`\n${title} (${items.length}):`);
  for (const item of items.slice(0, max)) console.log(`  ${item}`);
  if (items.length > max) console.log(`  ... ${items.length - max} more (use --json)`);
}

function printSummary(report: ParityReport, toolCount: number): void {
  console.log(`admin routes: ${report.routes}   tools: ${toolCount}`);
  console.log(`covered: ${report.covered.length}   chatless: ${report.chatless.length}   gap: ${report.gaps.length}   untriaged: ${report.untriaged.length}   unclassified (not in file): ${report.unknownRoutes.length}`);
  list("UNCLASSIFIED: live routes missing from the file (run --seed)", report.unknownRoutes);
  list("STALE: file entries whose route no longer exists", report.staleEntries);
  list("UNKNOWN TOOL IDS", report.unknownToolIds.map((u) => `${u.route} -> ${u.toolId}`));
  list("BAD CHATLESS REASONS", report.badReasons.map((b) => `${b.route}: ${b.reason}`));
  list("MALFORMED ENTRIES", report.malformed.map((m) => `${m.route}: ${m.why}`));
  list("GAPS", report.gaps);
}

const routes = adminRoutes();
const tools = await liveTools();
let file = readParityFile();
if (args.has("--seed")) {
  file = seedParity({ routes, tools, file: { ...file, _about: file._about ?? ABOUT } });
  mkdirSync(path.dirname(parityFile), { recursive: true });
  writeFileSync(parityFile, `${JSON.stringify(file, null, 2)}\n`);
  console.log(`seeded ${path.relative(repoRoot, parityFile)}`);
}
const report = classifyParity({ routes, toolIds: new Set(tools.map((t) => t.id)), file });
if (args.has("--json")) console.log(JSON.stringify(report, null, 2));
else printSummary(report, tools.length);
process.exit(args.has("--strict") && hasProblems(report) ? 1 : 0);
