# Sheet S2 — a narrow tool that adds reviewed edges to the architecture baseline (dev tooling only)

Executor: Sonnet, unattended. Budget: ≤ 100k context, ≤ 60 tool calls, 45 min. One responsibility: add `development/scripts/accept-architecture-edges.ts` (CLI) + `architecture-edge-acceptance.ts` (pure functions) + their test. No product code, no baseline change (S3 does that), no change to `check-architecture.ts`.
Design: `origin/plan/design-arch-120-2026-11-17:designs/arch-120/DESIGN.md` §4 (RC1/RC2/RC5 row and its rejected alternatives).

Why not `--update`: it rewrites every metric of `check-architecture.baseline.json` (it would also freeze the warn-tier regressions and re-freeze the hub medians). Why not edit `check-architecture.ts`: its `main` is already 248 lines and the file 615 code lines; a separate script that runs the unchanged gate leaves it untouched.

Owner rules: args `(required, optional = {})`; functions ≤ 50 lines, complexity ≤ 10, files ≤ 500; no mocks; the failing test first; every commit green against the base output. Never force-push.

## 0. Setup (Node 24)

```bash
# Start in the folder that holds both checkouts, named exactly `Tovu` and `Jini` (Tovu links ../Jini/packages).
export PATH="$HOME/.local/node24/bin:$PATH"
BASE="${BASE:-origin/refactor/import-cycle-b}"      # S2 does not depend on S1; the coordinator may give S1's branch or a later integration branch
cd Jini && git fetch origin refactor/terra && git checkout --detach origin/refactor/terra && pnpm install --frozen-lockfile && pnpm --no-bail -r build && cd ..
cd Tovu && git fetch origin "${BASE#origin/}" plan/design-arch-120-2026-11-17
git checkout -b refactor/arch-120-s2 "$BASE"
npm ci && JINI_PACKAGES_DIR="$PWD/../Jini/packages" node development/scripts/link-jini.mjs
npm --prefix packages/contracts run build && npm --prefix packages/sdk run build
mkdir -p /tmp/arch120 && git archive origin/plan/design-arch-120-2026-11-17 designs/arch-120 | tar -x -C /tmp/arch120
T=/tmp/arch120/designs/arch-120/tools
```

## 1. Prerequisites (STOP on failure)

```bash
test ! -e development/scripts/accept-architecture-edges.ts && test ! -e development/scripts/architecture-edge-acceptance.ts || { echo "STOP P1: the tool already exists"; exit 1; }
grep -q 'NEW cross-feature edge: ${edge}' development/scripts/check-architecture.ts || { echo "STOP P2: the gate no longer prints 'NEW cross-feature edge: <edge>'; the parser below would read nothing"; exit 1; }
grep -q 'fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(current, null, 2)}\\n`)' development/scripts/check-architecture.ts || { echo "STOP P3: the gate's baseline writer changed; the format test below would be wrong"; exit 1; }
node -e 'const t=require("fs").readFileSync("development/scripts/check-architecture.baseline.json","utf8");process.exit(JSON.stringify(JSON.parse(t),null,2)+"\n"===t?0:1)' || { echo "STOP P4: the baseline file is not in the writer format; writing one field would reformat the file"; exit 1; }
```

## 2. Record the base

```bash
bash $T/sheet-gates.sh /tmp/arch120/base
node --import tsx --test development/scripts/__tests__/check-architecture.test.ts 2>&1 | grep -E '^ℹ (pass|fail)'   # 4 / 0 on the design's base
```

## 3. Red test first

Create `development/scripts/__tests__/accept-architecture-edges.test.ts` with exactly:

```ts
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { parseAcceptedEdges, parseNewEdges, planAcceptedBaseline, writeBaselineEdges } from "../architecture-edge-acceptance.js";

const F = "apps/website/src/features";
const E1 = `${F}/a/x.ts -> ${F}/b/index.ts`;
const E2 = `${F}/c/y.ts -> ${F}/d/z.ts`;
const E3 = `${F}/e/q.ts -> ${F}/f/index.ts`;
const REAL_BASELINE = path.resolve(import.meta.dirname, "../check-architecture.baseline.json");

test("parseNewEdges keeps only the gate's NEW lines, once each, sorted", () => {
  const output = `check:architecture\n  NEW cross-feature edge: ${E2}\n  NEW cross-feature edge: ${E1}\n  NEW cross-feature edge: ${E2}\n  cross-feature import edges (all-import) 427\n`;
  assert.deepEqual(parseNewEdges({ output }), [E1, E2]);
});

test("parseAcceptedEdges reads explained rows and refuses a wrong header, class, empty evidence or a duplicate", () => {
  assert.deepEqual(parseAcceptedEdges({ text: `edge\tclass\tevidence\n${E1}\tOLD\tin the 9240cbe1 tree\n` }), [{ edge: E1, class: "OLD", evidence: "in the 9240cbe1 tree" }]);
  assert.throws(() => parseAcceptedEdges({ text: `${E1}\tOLD\twhy\n` }), /first line must be/);
  assert.throws(() => parseAcceptedEdges({ text: `edge\tclass\tevidence\n${E1}\tFINE\twhy\n` }), /line 2: class must be one of/);
  assert.throws(() => parseAcceptedEdges({ text: `edge\tclass\tevidence\n${E1}\tOLD\t \n` }), /line 2: evidence is empty/);
  assert.throws(() => parseAcceptedEdges({ text: `edge\tclass\tevidence\n${E1}\tOLD\ta\n${E1}\tMOVED\tb\n` }), /line 3: duplicate edge/);
  assert.throws(() => parseAcceptedEdges({ text: `edge\tclass\tevidence\napps/website/src/server/x.ts -> ${F}/b/index.ts\tOLD\ta\n` }), /not a cross-feature edge/);
});

test("planAcceptedBaseline adds only NEW edges that have a row, removes nothing, and reports the rest", () => {
  const accepted = [{ edge: E1, class: "OLD", evidence: "a" }, { edge: E3, class: "MOVED", evidence: "b" }];
  const plan = planAcceptedBaseline({ baseline: [E3], newEdges: [E1, E2], accepted });
  assert.deepEqual(plan.edges, [E1, E3]);
  assert.deepEqual(plan.added, [E1]);
  assert.deepEqual(plan.unlisted, [E2]);
  assert.deepEqual(plan.inactive, []);
  const gone = planAcceptedBaseline({ baseline: [], newEdges: [], accepted: [{ edge: E2, class: "OLD", evidence: "c" }] });
  assert.deepEqual(gone, { edges: [], added: [], unlisted: [], inactive: [E2] });
});

test("the real baseline file is in the writer's exact format, so rewriting one field leaves every other byte", () => {
  const text = fs.readFileSync(REAL_BASELINE, "utf8");
  assert.equal(`${JSON.stringify(JSON.parse(text), null, 2)}\n`, text);
});

test("writeBaselineEdges changes crossFeatureEdges and nothing else", t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arch-accept-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "baseline.json");
  fs.copyFileSync(REAL_BASELINE, file);
  const before = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  writeBaselineEdges({ file, edges: [E1] });
  const after = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  assert.deepEqual(after.crossFeatureEdges, [E1]);
  assert.deepEqual({ ...after, crossFeatureEdges: null }, { ...before, crossFeatureEdges: null });
  assert.deepEqual(Object.keys(after), Object.keys(before));
});
```

Run it; it must fail because the module does not exist (`ERR_MODULE_NOT_FOUND` for `architecture-edge-acceptance.js`):

```bash
node --import tsx --test development/scripts/__tests__/accept-architecture-edges.test.ts 2>&1 | grep -q 'architecture-edge-acceptance' || { echo "STOP R1: the test did not fail on the missing module"; exit 1; }
```

Do not commit the red state (every commit green); the red run is your evidence, quote it in the report.

## 4. The two files

`development/scripts/architecture-edge-acceptance.ts`:

```ts
/**
 * @file Pure parts of `accept-architecture-edges.ts`: read the gate's NEW-edge lines, read the reviewed
 * accept list, plan the new `crossFeatureEdges`, and write that one field back.
 *
 * Why it exists: `check:architecture --update` rewrites every metric of the baseline (it would also
 * freeze the warn-tier regressions and re-freeze the hub medians, see `check-architecture.ts`). Accepting
 * an edge must change only `crossFeatureEdges`, and only with an edge the gate reports as NEW right now
 * AND a reviewed row explains. The list (`development/boundaries/accepted-cross-feature-edges.tsv`) is the
 * audit trail: `edge<TAB>class<TAB>evidence`. Design: designs/arch-120/DESIGN.md on
 * plan/design-arch-120-2026-11-17 (section 4).
 */
import fs from "node:fs";

/** OLD: present in the tree of the commit that set the baseline. MOVED/RENAMED: the same names already
 * crossed the same feature pair. DESIGNED: an approved design created the edge on purpose. */
export const ACCEPT_CLASSES: ReadonlySet<string> = new Set(["OLD", "MOVED", "RENAMED", "DESIGNED"]);
export const ACCEPT_HEADER = "edge\tclass\tevidence";
const FEATURE_EDGE = /^apps\/website\/src\/features\/\S+ -> apps\/website\/src\/features\/\S+$/;

export interface AcceptedEdge { readonly edge: string; readonly class: string; readonly evidence: string }
export interface AcceptancePlan { readonly edges: string[]; readonly added: string[]; readonly unlisted: string[]; readonly inactive: string[] }

/** The distinct `NEW cross-feature edge:` lines of one gate run, sorted. @complexity O(lines). */
export function parseNewEdges(required: { output: string }, _optional: Record<string, never> = {}): string[] {
  const edges = new Set<string>();
  for (const line of required.output.split("\n")) {
    const match = /^\s*NEW cross-feature edge: (\S+ -> \S+)\s*$/.exec(line);
    if (match) edges.add(match[1]!);
  }
  return [...edges].sort();
}

/** One row of the list. @throws Error naming the line when the row is not a valid, explained feature edge. */
function parseRow(required: { line: string; lineNumber: number; seen: Set<string> }, _optional: Record<string, never> = {}): AcceptedEdge {
  const [edge = "", cls = "", evidence = ""] = required.line.split("\t");
  const where = `accepted edges, line ${required.lineNumber}`;
  if (!FEATURE_EDGE.test(edge)) throw new Error(`${where}: not a cross-feature edge: ${JSON.stringify(edge)}`);
  if (!ACCEPT_CLASSES.has(cls)) throw new Error(`${where}: class must be one of ${[...ACCEPT_CLASSES].join(", ")}, got ${JSON.stringify(cls)}`);
  if (!evidence.trim()) throw new Error(`${where}: evidence is empty`);
  if (required.seen.has(edge)) throw new Error(`${where}: duplicate edge ${edge}`);
  required.seen.add(edge);
  return { edge, class: cls, evidence };
}

/** The reviewed list. @throws Error on a wrong header or any invalid row (see `parseRow`). @complexity O(rows). */
export function parseAcceptedEdges(required: { text: string }, _optional: Record<string, never> = {}): AcceptedEdge[] {
  const [header, ...rows] = required.text.split("\n").filter(line => line.trim() !== "");
  if (header !== ACCEPT_HEADER) throw new Error(`accepted edges: the first line must be ${JSON.stringify(ACCEPT_HEADER)}, got ${JSON.stringify(header)}`);
  const seen = new Set<string>();
  return rows.map((line, index) => parseRow({ line, lineNumber: index + 2, seen }));
}

/**
 * `edges` = baseline plus the NEW edges that have a row; nothing else is added and nothing is removed.
 * `unlisted` = NEW edges without a row (they keep the gate red). `inactive` = rows whose edge is neither
 * NEW nor already in the baseline: the code no longer has it (the list is history, so this is not an error).
 * @complexity O(B + N + R) time and space.
 */
export function planAcceptedBaseline(required: { baseline: readonly string[]; newEdges: readonly string[]; accepted: readonly AcceptedEdge[] }, _optional: Record<string, never> = {}): AcceptancePlan {
  const listed = new Set(required.accepted.map(row => row.edge));
  const present = new Set([...required.baseline, ...required.newEdges]);
  const added = required.newEdges.filter(edge => listed.has(edge));
  return {
    edges: [...new Set([...required.baseline, ...added])].sort(),
    added,
    unlisted: required.newEdges.filter(edge => !listed.has(edge)),
    inactive: [...listed].filter(edge => !present.has(edge)),
  };
}

/** Rewrites only `crossFeatureEdges`, with the writer `--update` uses (2-space JSON plus a newline), so every other key keeps its bytes. */
export function writeBaselineEdges(required: { file: string; edges: readonly string[] }, _optional: Record<string, never> = {}): void {
  const baseline = JSON.parse(fs.readFileSync(required.file, "utf8")) as Record<string, unknown>;
  if (!Array.isArray(baseline.crossFeatureEdges)) throw new Error(`${required.file} has no crossFeatureEdges array`);
  fs.writeFileSync(required.file, `${JSON.stringify({ ...baseline, crossFeatureEdges: required.edges }, null, 2)}\n`);
}
```

`development/scripts/accept-architecture-edges.ts`:

```ts
/**
 * @file `npx tsx development/scripts/accept-architecture-edges.ts <accepted.tsv> [--check]`
 *
 * Runs the unchanged `check-architecture.ts`, takes the edges it reports as NEW, and adds to the baseline's
 * `crossFeatureEdges` exactly those that have a reviewed row in `<accepted.tsv>`. Touches no other metric.
 * `--check` writes nothing. Exit 0 = no NEW edge is left without a row; exit 1 = some are (listed); exit 2 = usage.
 * The pure parts and the reason this is not `--update`: `architecture-edge-acceptance.ts`.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseAcceptedEdges, parseNewEdges, planAcceptedBaseline, writeBaselineEdges } from "./architecture-edge-acceptance.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const BASELINE_PATH = path.join(import.meta.dirname, "check-architecture.baseline.json");

/** stdout + stderr of one gate run; its exit code is expected to be 1 while edges are NEW. */
function runGate(_required: Record<string, never> = {}, _optional: Record<string, never> = {}): string {
  const result = spawnSync("npx", ["tsx", "development/scripts/check-architecture.ts"], { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (result.error) throw result.error;
  return `${result.stdout}\n${result.stderr}`;
}

function main(required: { argv: readonly string[] }, _optional: Record<string, never> = {}): number {
  const file = required.argv.find(arg => !arg.startsWith("--"));
  if (!file) { console.error("usage: accept-architecture-edges.ts <accepted.tsv> [--check]"); return 2; }
  const accepted = parseAcceptedEdges({ text: fs.readFileSync(file, "utf8") });
  const newEdges = parseNewEdges({ output: runGate() });
  const baseline = (JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) as { crossFeatureEdges: string[] }).crossFeatureEdges;
  const plan = planAcceptedBaseline({ baseline, newEdges, accepted });
  console.log(`NEW now: ${newEdges.length}; accepted by a row: ${plan.added.length}; NEW without a row: ${plan.unlisted.length}; rows not in the code: ${plan.inactive.length}`);
  for (const edge of plan.unlisted) console.log(`  no row: ${edge}`);
  if (!required.argv.includes("--check")) writeBaselineEdges({ file: BASELINE_PATH, edges: plan.edges });
  return plan.unlisted.length > 0 ? 1 : 0;
}

process.exitCode = main({ argv: process.argv.slice(2) });
```

Then:

```bash
node --import tsx --test development/scripts/__tests__/accept-architecture-edges.test.ts 2>&1 | grep -E '^ℹ (pass|fail)'      # pass 5 / fail 0
npx tsc --noEmit --strict --noUncheckedIndexedAccess --module nodenext --moduleResolution nodenext --target es2022 --types node --skipLibCheck \
  development/scripts/architecture-edge-acceptance.ts development/scripts/accept-architecture-edges.ts development/scripts/__tests__/accept-architecture-edges.test.ts \
  || { echo "STOP B1: the new files do not typecheck"; exit 1; }
cp development/scripts/check-architecture.baseline.json /tmp/arch120/baseline.before
printf 'edge\tclass\tevidence\n' > /tmp/arch120/empty.tsv
npx tsx development/scripts/accept-architecture-edges.ts /tmp/arch120/empty.tsv --check; echo "exit $?"     # exit 1, "NEW without a row: <the gate's count>"
cmp development/scripts/check-architecture.baseline.json /tmp/arch120/baseline.before || { echo "STOP B2: --check wrote the baseline"; exit 1; }
```

Mutation proof (each must turn the named test red, then restore):

```bash
F=development/scripts/architecture-edge-acceptance.ts; cp $F /tmp/arch120/acc.bak
sed -i 's/const added = required.newEdges.filter(edge => listed.has(edge));/const added = [...required.newEdges];/' $F
node --import tsx --test development/scripts/__tests__/accept-architecture-edges.test.ts 2>&1 | grep -q '^✖ planAcceptedBaseline' || { cp /tmp/arch120/acc.bak $F; echo "STOP M1: accepting unlisted edges is not caught"; exit 1; }
cp /tmp/arch120/acc.bak $F
sed -i 's/{ ...baseline, crossFeatureEdges: required.edges }/{ crossFeatureEdges: required.edges }/' $F
node --import tsx --test development/scripts/__tests__/accept-architecture-edges.test.ts 2>&1 | grep -q '^✖ writeBaselineEdges' || { cp /tmp/arch120/acc.bak $F; echo "STOP M2: dropping other baseline keys is not caught"; exit 1; }
cp /tmp/arch120/acc.bak $F && git status --short
```

```bash
git add development/scripts/architecture-edge-acceptance.ts development/scripts/accept-architecture-edges.ts development/scripts/__tests__/accept-architecture-edges.test.ts
git commit -m "build(architecture): accept reviewed cross-feature edges into the baseline without --update (arch-120 S2)

accept-architecture-edges.ts runs the unchanged check-architecture.ts, takes its NEW edges, and adds
to crossFeatureEdges only those with a row in a reviewed TSV (edge, class OLD|MOVED|RENAMED|DESIGNED,
evidence). It never removes an edge and never touches another metric; --check writes nothing.
--update would also freeze the warn-tier regressions and re-freeze the hub medians.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

## 5. Gates (STOP = do not push)

```bash
bash $T/sheet-gates.sh /tmp/arch120/after-s2
bash $T/sheet-gates.sh --compare /tmp/arch120/base /tmp/arch120/after-s2 || { echo "STOP G1: a gate got worse"; exit 1; }
cmp <(sort /tmp/arch120/base/architecture.lines) <(sort /tmp/arch120/after-s2/architecture.lines) || { echo "STOP G2: S2 must not change the architecture verdict"; exit 1; }
node --import tsx --test development/scripts/__tests__/check-architecture.test.ts development/scripts/__tests__/accept-architecture-edges.test.ts 2>&1 | grep -E '^ℹ (pass|fail)'   # 9 / 0
LIM='{"max-lines-per-function":["error",{"max":50,"skipBlankLines":true,"skipComments":true}],"complexity":["error",10],"sonarjs/cognitive-complexity":["error",10],"max-lines":["error",{"max":500,"skipBlankLines":true,"skipComments":true}]}'
npx eslint --no-inline-config --rule "$LIM" development/scripts/architecture-edge-acceptance.ts development/scripts/accept-architecture-edges.ts | grep -E 'max-lines|complexity' && { echo "STOP G3: limit finding"; exit 1; } || true
```

## 6. Push and report

```bash
git pull --rebase origin refactor/arch-120-s2 2>/dev/null || true
git push -u origin refactor/arch-120-s2
git log --oneline "$BASE"..HEAD
```

Report (≤ 12 lines): SHA, branch, red run line, test counts, the `--check` output on the empty list, both mutation results, `--compare` output.
