/**
 * check-tool-guides.ts — which tools does the text a model reads name, and which calls in it name nothing?
 *
 * WHY (2026-11-18, tool-call-fixes S4a / C1b): guide text keeps naming a tool after it is renamed or
 * moved behind the gateway, and the model then calls something that is not there. Nothing compared the
 * prose with the catalog. This report lists every tool the model-facing text names, where, and every
 * call-shaped name that matches no tool.
 *
 * WHAT IS SCANNED: only text a model reads, known by where it comes from, never "every string":
 *   A. registry text   — every descriptor and schema `description` of the booted hermetic registry
 *                        (the same boot as `check-route-tool-parity.ts`);
 *   B. MCP-local text  — `name`/`description` of the tool objects in Jini `packages/mcp/src/server/tools`
 *                        and the `INSTRUCTIONS` constant of `run-tool-host.ts`;
 *   C. guide modules   — the strings of the files declared in `development/parity/tool-guide-sources.json`.
 * Completeness of C is measured: a report-only pass lists files outside A to C whose string literals
 * name a registered tool in prose; each is classified by hand in the sources file (`guide` joins C,
 * `not-guide` carries a reason). The pass never fails the check and never classifies a call itself.
 *
 * REPORT-ONLY: exits 0 whatever it finds, like every gate while CI is off. `--strict` exits 1 when a
 * declared guide module is missing, a sources entry is malformed, or a candidate file is unclassified.
 * Named tools and unknown calls never fail it.
 *
 * Usage: env -u TOVU_ADMIN_PASSWORD TOVU_DB=memory node --import tsx development/scripts/check-tool-guides.ts [--strict] [--json]
 * Jini is read from `../Jini` (a sibling checkout), or from $JINI_DIR.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createRouteDeps } from "../../apps/website/src/server/runtime/composition/app.js";
import { buildEvalToolRegistry } from "../evals/tool-search-eval-registry.js";
import {
  guideModuleTexts, literalTexts, localToolTexts, registryTexts, schemaPropertyNames, type DescriptorText,
} from "./lib/tool-guide-collect.js";
import { scanToolGuides, type GuideSource, type Mention, type ToolGuideNames } from "./lib/tool-guide-scan.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const jiniRoot = process.env.JINI_DIR ?? path.resolve(repoRoot, "../Jini");
const sourcesFile = path.join(repoRoot, "development/parity/tool-guide-sources.json");
const reportFile = path.join(repoRoot, "development/parity/tool-guides.json");
const args = new Set(process.argv.slice(2));

/** The 64-tool and 256 KiB limits the exposure policy applies to the descriptors it publishes (`core/src/tool-exposure.ts`). */
const PINNED_LIMITS = { limitTools: 64, limitBytes: 262144 } as const;
const LOCAL_TOOLS_DIR = "packages/mcp/src/server/tools";
const RUN_TOOL_HOST = "packages/mcp/src/server/run-tool-host.ts";
const CANDIDATE_ROOTS = ["apps/website/src", "apps/admin/src", "content/agent-plugins", "../Jini/packages/core/src", "../Jini/packages/daemon/src", "../Jini/packages/mcp/src"] as const;

interface SourceEntry { readonly path: string; readonly kind: "guide" | "not-guide"; readonly reason: string }
interface SourcesFile { readonly _about?: string; readonly sources: readonly SourceEntry[] }

/** A repo-relative path, or `../Jini/...` for a sibling checkout, as an absolute path. */
const absoluteOf = (relative: string): string => (relative.startsWith("../Jini/") ? path.join(jiniRoot, relative.slice("../Jini/".length)) : path.join(repoRoot, relative));

function readSources(): SourcesFile {
  return existsSync(sourcesFile) ? (JSON.parse(readFileSync(sourcesFile, "utf8")) as SourcesFile) : { sources: [] };
}

function sourceEntryProblems(entries: readonly SourceEntry[]): string[] {
  const problems: string[] = [];
  for (const entry of entries) {
    if (entry.kind !== "guide" && entry.kind !== "not-guide") problems.push(`${entry.path}: kind must be guide or not-guide`);
    if (typeof entry.reason !== "string" || entry.reason.trim() === "") problems.push(`${entry.path}: a one-line reason is required`);
    if (!existsSync(absoluteOf(entry.path))) problems.push(`${entry.path}: no such file`);
  }
  return problems;
}

async function liveDescriptors(): Promise<DescriptorText[]> {
  const deps = createRouteDeps();
  await deps.identityReady;
  const registry = buildEvalToolRegistry(deps as unknown as Parameters<typeof buildEvalToolRegistry>[0]);
  return registry.list({}).map((d) => ({ id: d.id, ...(d.description === undefined ? {} : { description: d.description }), ...(d.inputSchema === undefined ? {} : { inputSchema: d.inputSchema }) }));
}

/** B: the MCP-local tool files, and the local tool names read from them. */
function localSources(): { texts: GuideSource[]; names: string[] } {
  const dir = path.join(jiniRoot, LOCAL_TOOLS_DIR);
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts")).map((f) => `../Jini/${LOCAL_TOOLS_DIR}/${f}`);
  const parts = [...files, `../Jini/${RUN_TOOL_HOST}`].map((rel) => localToolTexts({ path: rel, text: readFileSync(absoluteOf(rel), "utf8") }));
  return { texts: parts.flatMap((p) => p.texts), names: [...new Set(parts.flatMap((p) => p.names))] };
}

const isSourceFile = (file: string): boolean => /\.(ts|tsx)$/.test(file) && !/(__tests__|__mocks__|\/fixtures\/|\.test\.|\.spec\.|\.d\.ts$)/.test(file);

/** Every non-test TypeScript file under the candidate roots, as repo-relative (or `../Jini/`) paths. */
function candidateFiles(): string[] {
  return CANDIDATE_ROOTS.filter((root) => existsSync(absoluteOf(root))).flatMap((root) =>
    readdirSync(absoluteOf(root), { recursive: true, encoding: "utf8" }).map((f) => `${root}/${f}`.replaceAll("\\", "/")).filter(isSourceFile));
}

/** Files outside A to C whose string literals name a registered tool in prose (a literal with a space). */
function unclassifiedCandidates({ names, claimed }: { names: ToolGuideNames; claimed: ReadonlySet<string> }): { path: string; ids: string[] }[] {
  const idPattern = new RegExp(names.toolIds.map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"));
  const found: { path: string; ids: string[] }[] = [];
  for (const rel of candidateFiles().filter((file) => !claimed.has(file))) {
    const text = readFileSync(absoluteOf(rel), "utf8");
    if (!idPattern.test(text)) continue;
    const prose = literalTexts({ path: rel, text, kind: "guide" }).filter((s) => /\s/.test(s.text.trim()));
    const ids = [...new Set(scanToolGuides({ names: { ...names, localNames: [] }, sources: prose }).named.map((m) => m.id))];
    if (ids.length > 0) found.push({ path: rel, ids });
  }
  return found;
}

function groupSites(mentions: readonly Mention[]): Record<string, string[]> {
  const grouped: Record<string, Set<string>> = {};
  for (const m of mentions) (grouped[m.id] ??= new Set()).add(`${m.kind} ${m.source} (${m.form})`);
  return Object.fromEntries(Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([id, sites]) => [id, [...sites].sort()]));
}

/** Of the descriptors the text names (registered ids only), how many there are and how many bytes they publish. */
function pinnedFit({ descriptors, mentions }: { descriptors: readonly DescriptorText[]; mentions: readonly Mention[] }) {
  const named = new Set(mentions.map((m) => m.id));
  const exposed = descriptors.filter((d) => named.has(d.id));
  const schemaBytes = exposed.reduce((sum, d) => sum + Buffer.byteLength(JSON.stringify({ id: d.id, description: d.description, inputSchema: d.inputSchema }), "utf8"), 0);
  return { namedDescriptors: exposed.length, schemaBytes, ...PINNED_LIMITS, fits: exposed.length <= PINNED_LIMITS.limitTools && schemaBytes <= PINNED_LIMITS.limitBytes };
}

function countByKind(mentions: readonly Mention[]): Record<string, number> {
  const counts: Record<string, number> = { registry: 0, "mcp-local": 0, guide: 0 };
  for (const m of mentions) counts[m.kind] = (counts[m.kind] ?? 0) + 1;
  return counts;
}

async function main(): Promise<void> {
  const descriptors = await liveDescriptors();
  const declared = readSources();
  const guides = declared.sources.filter((e) => e.kind === "guide");
  const local = localSources();
  const names: ToolGuideNames = {
    toolIds: descriptors.map((d) => d.id), localNames: local.names, wireNames: [],
    knownProperties: [...new Set(descriptors.flatMap((d) => schemaPropertyNames({ schema: d.inputSchema })))],
  };
  const guideTexts = guides.filter((e) => existsSync(absoluteOf(e.path))).flatMap((e) => guideModuleTexts({ path: e.path, absolute: absoluteOf(e.path) }));
  const scan = scanToolGuides({ names, sources: [...registryTexts({ descriptors }), ...local.texts, ...guideTexts] });
  const claimed = new Set([...declared.sources.map((e) => e.path), ...candidateFilesOfLocal()]);
  const unclassified = unclassifiedCandidates({ names, claimed });
  const problems = sourceEntryProblems(declared.sources);
  const report = {
    tools: descriptors.length, local: local.names, named: groupSites(scan.named), gatewayForm: groupSites(scan.gatewayForm),
    unknownCalls: scan.unknownCalls.map((u) => `${u.token}  ${u.kind} ${u.source}`),
    candidates: { unclassified }, sourceProblems: problems, pinnedFit: pinnedFit({ descriptors, mentions: scan.named }),
  };
  mkdirSync(path.dirname(reportFile), { recursive: true });
  writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  if (args.has("--json")) console.log(JSON.stringify(report, null, 2));
  else printSummary({ report, byKind: countByKind(scan.named), guideCount: guides.length });
  process.exit(args.has("--strict") && (problems.length > 0 || unclassified.length > 0) ? 1 : 0);
}

/** B's files are claimed: they are scanned as MCP-local text, not as candidates. */
function candidateFilesOfLocal(): string[] {
  return readdirSync(path.join(jiniRoot, LOCAL_TOOLS_DIR)).map((f) => `../Jini/${LOCAL_TOOLS_DIR}/${f}`).concat(`../Jini/${RUN_TOOL_HOST}`);
}

function printSummary({ report, byKind, guideCount }: { report: { tools: number; local: string[]; named: Record<string, string[]>; unknownCalls: string[]; candidates: { unclassified: unknown[] }; sourceProblems: string[]; pinnedFit: ReturnType<typeof pinnedFit> }; byKind: Record<string, number>; guideCount: number }): void {
  console.log(`registered tools: ${report.tools}   local tools: ${report.local.length}   declared guide modules: ${guideCount}`);
  console.log(`distinct tools named: ${Object.keys(report.named).length}   mentions by kind: registry ${byKind.registry}, mcp-local ${byKind["mcp-local"]}, guide ${byKind.guide}`);
  console.log(`unknown calls: ${report.unknownCalls.length}   unclassified candidate files: ${report.candidates.unclassified.length}   source-file problems: ${report.sourceProblems.length}`);
  const fit = report.pinnedFit;
  console.log(`pinnedFit: ${fit.namedDescriptors} named descriptors, ${fit.schemaBytes} bytes (limits ${fit.limitTools} tools / ${fit.limitBytes} bytes): ${fit.fits ? "fits" : "DOES NOT FIT (OD-7)"}`);
  for (const line of report.unknownCalls.slice(0, 25)) console.log(`  unknown call: ${line}`);
  for (const problem of report.sourceProblems) console.log(`  sources file: ${problem}`);
  console.log(`wrote ${path.relative(repoRoot, reportFile)}`);
}

await main();
