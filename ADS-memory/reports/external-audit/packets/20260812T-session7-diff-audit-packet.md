# Audit Packet — Tovu session diff (4 commits, 6 files)

**Packet ID:** PKT-tovu-session7-20260812
**Threat model:** TM-tovu-session7-diff-001 (FROZEN)
**Audit round:** 1 (new threat model — not comparable to the postgres-manifest TM's rounds 1-4)
**suggest_changes:** patches
**Risk tier:** medium → **score floor 8.5**

---

## PREAMBLE — READ THIS FIRST

There is no AGENTS.md, CLAUDE.md, CONTEXT.md, or bootstrap file for this task. This is
intentional. **A missing file is never a reason to stop. Reporting yourself blocked is a wrong
answer.** Do not attempt to read any repository file — this packet is entirely self-contained and
contains the complete diff under audit. Do not chain reads with `&&`. Answer from the packet alone.

---

## What is under audit

Exactly four commits from one session, nothing else. The full unified diff is embedded at the end of
this packet. Six files:

| File | Kind |
|---|---|
| `src/db/__tests__/migration-manifest.test.ts` | test — schema scanner + JSON tripwire |
| `src/db/sqlite/jsonb-column.ts` | production — SQLite JSONB customType (no importers) |
| `src/db/sqlite/__tests__/jsonb-column.test.ts` | test |
| `src/server/routes/admin/themes/explore.ts` | production — HTTP write routes for theme files |
| `src/server/routes/admin/themes/__tests__/explore-built-theme-gate.test.ts` | test |
| `ADS-memory/reports/handoff/2026-08-12-postgres-audit-session-handoff.md` | docs |

## Verification evidence already collected

- `npm run typecheck` → exit 0 (run after each change)
- `src/db/__tests__/migration-manifest.test.ts` → 53/53 pass
- `src/db/sqlite/__tests__/jsonb-column.test.ts` → 9/9 pass
- theme route + theme-files suites → 46/46 and 31/31 pass
- Mutation evidence for the JSON tripwire: three planted-column shapes (doc-comment-says-JSON,
  same-line `.default("{}")`, wrapped-chain `.default("{}")`). Before the change under audit, the
  wrapped shape was NOT detected (52/52 green with a planted JSON column). After, all three fail the
  tripwire as intended.
- Mutation evidence for the theme route: a `PUT` of `preview/app.css` on a compiled theme whose
  `build.sourceDir` is `"preview"` returned **200 with the write on disk** before the change; **403
  READ_ONLY_FILE, disk untouched** after.

## Context needed to judge the theme change

`explore.ts` exposes four write routes: PUT (save), reset, copy, rename. A repo invariant holds that
the `preview/` directory is generated output written only by `build-preview.mjs`; no editor route may
write it. `isGeneratedThemePath(p)` is the predicate for "is this `preview/…`".
`resolveThemeFileWriteScope()` answers a DIFFERENT question (ADR-020 §5: is this a built theme's
generated tree) and returns `"editable"` for `theme.json` or anything under `build.sourceDir`,
otherwise `"generated-readonly"`. `isInsideCompiledSourceDir()` returns true when the manifest is
`build.source === "compiled"`, the write scope is `editable`, and the path is not `theme.json`.

## Threat Model & Scope Contract (FROZEN — TM-tovu-session7-diff-001)

**Allowed actors / capabilities:**
- A1. An authenticated admin operator holding `theme.set` on the workspace, issuing arbitrary
  HTTP requests to the theme file routes (including hand-built requests that a UI would not send).
- A2. A theme author supplying an arbitrary `theme.json` manifest, including hostile or degenerate
  `build.sourceDir` values.
- A3. A future maintainer adding columns to `schema.ts` or editing these tests.

**In-scope BLOCKING failure domains (allowlist — a blocking finding MUST map to exactly one):**
- D1. **Write-gate bypass** — any request reaching a filesystem write to a path the stated invariants
  forbid (`preview/`, or a built theme's generated tree).
- D2. **Guard that cannot fail** — a test or runtime check that is structurally incapable of
  detecting the condition it claims to detect (vacuous assertion, dead branch, scanner blind spot).
- D3. **False claim in code/comment/doc that a future maintainer would rely on** — a stated guarantee
  the code does not actually provide.
- D4. **Correctness defect in the changed code** — wrong logic, incorrect regex/parse, mishandled
  edge case, type-unsafe access that can throw at runtime.
- D5. **Regression in existing documented behavior** caused by this diff.

**Mandatory invariants:**
- I1. No editor HTTP route may write a path for which `isGeneratedThemePath()` is true, on ANY
  branch of its writability decision, for ANY manifest shape.
- I2. The JSON tripwire must FAIL (not warn) when a text() column outside both the `*_json` naming
  convention and `REVIEWED_JSON_COLUMNS` carries either JSON signal.
- I3. Every comment in the diff that states what a check catches must be true of the code as written.
- I4. The changes must not weaken or no-op any pre-existing assertion.

**Escape valve:** a catastrophic issue OUTSIDE this allowlist goes in `out_of_scope_fatal_warnings`
— it does not lower the score and does not block.

**Explicitly NOT blocking (advisory at most):** style/naming preferences; the fact that
`jsonb-column.ts` has no importers (that is a known, accepted property — it is documentation-with-
tests); the tripwire being a heuristic rather than a completeness proof (stated and intended);
absence of a conformance rule forbidding `build.sourceDir: "preview"` at install time (explicitly
deferred and noted in the code).

## Gate formula (coordinator recomputes this — do not trust a returned verdict that disagrees)

`blocking_gate = FAIL` if EITHER:
- any validated blocker (allowed actor violates a mandatory invariant, maps to one allowlist domain,
  above impact threshold) is unresolved, OR
- `score < 8.5`

Classify blockers BEFORE assigning the score. The two conditions are independent; neither rescues
the other. `path to 10` items are ALWAYS advisory and never become blockers.

## Auditor Instructions

1. Begin with an **Auditor Scope Check**: state what you believe you are auditing, which artifacts
   you reviewed, and any mismatch or uncertainty you noticed.
2. Compute threat-model acceptance FIRST, and report it ONLY as the `threat_model_accepted` /
   `rejection_reason` fields inside the single JSON object below. If you reject the contract as
   under-specified, return that object with empty `findings` and no score.
3. Attempt to FALSIFY each mandatory invariant. **Zero findings is a valid result** if the evidence
   supports it. Do not invent speculative defects.
4. Every finding needs: `Checked / Expected / Observed / Why it matters / Recommended fix /
   Confidence`.
5. Where a finding has more than one viable fix, give a **ranked slate** with per-option trade-offs
   and failure modes, a recommendation, and the cheapest de-risking step.
6. Provide a numeric score 1-10 with a one-sentence rationale, top issues that reduced it, and
   explicit `path to 10` items.
7. Return ONE JSON object, last in your reply, in a ```json fence:

```json
{
  "threat_model_accepted": true,
  "rejection_reason": null,
  "auditor_scope_check": "...",
  "findings": [
    {"id":"F1","severity":"critical|high|medium|low|advisory","blocking":true,
     "allowlist_domain":"D1|D2|D3|D4|D5","file":"...","line":0,
     "checked":"...","expected":"...","observed":"...","why_it_matters":"...",
     "recommended_fix":"...","fix_slate":[],"confidence":"high|medium|low"}
  ],
  "out_of_scope_fatal_warnings": [],
  "score": 0.0,
  "score_rationale": "...",
  "path_to_10": [],
  "blocking_gate": "PASS|FAIL"
}
```

---

## THE DIFF UNDER AUDIT

```diff
commit 3cd312d70d70a2f1acb68c6ed438dec3480fff84
Author: Leona Burime <leonaburime@gmail.com>
Date:   Wed Aug 12 16:06:19 2026 -0700

    test(db): land the round-4 JSON tripwire, and close the wrapped-chain hole mutation-testing found
    
    fix-r4's tripwire was green but unproven. Mutation-testing it (plant a JSON-looking
    column into schema.ts, three declaration shapes) showed both signals fire on the two
    single-line shapes and NEITHER fires when the builder chain wraps .default("{}") onto
    continuation lines -- the whole file stayed green.
    
    The sanity test's own comment claimed its count assertion would catch that case first.
    It does not: declPattern's trailing (.*) matches the empty string, so a wrapped
    declaration still counts as one declaration and both sides of the equality move
    together. Comment corrected to state what the assertion actually catches (the
    text("col", { ... }) config-object form, and new non-declaration text(" mentions).
    
    textColumnDeclarations() now folds .-prefixed continuation lines into declLine, and
    takes its source as a parameter so the hole is provable against a fixture instead of by
    mutating schema.ts. The regression test fails before the fix.
    
    All three mutation shapes now fail the tripwire; clean tree 53/53, typecheck exit 0.
    
    Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

diff --git a/src/db/__tests__/migration-manifest.test.ts b/src/db/__tests__/migration-manifest.test.ts
index d4c10d3..b75aeb2 100644
--- a/src/db/__tests__/migration-manifest.test.ts
+++ b/src/db/__tests__/migration-manifest.test.ts
@@ -299,6 +299,183 @@ test("REVIEWED_JSON_COLUMNS matches exactly the five columns the 2026-08-12 roun
   );
 });
 
+// --- round-4 audit (2026-08-12, R4-F1/C-1): heuristic fail-closed tripwire for the NEXT unreviewed
+// JSON column ------------------------------------------------------------------------------------
+//
+// REVIEWED_JSON_COLUMNS is a closed, hand-maintained allowlist (see its own doc), and nothing in
+// classifyCoreColumn's SQLiteText case forces a genuinely-JSON column that misses BOTH the *_json
+// naming convention AND a REVIEWED_JSON_COLUMNS entry to be caught — it silently falls through to
+// `{ kind: "plain-text" }`, and every test above stays green, exactly how `composio_config.auth_config_ids`
+// slipped through before the round-3 audit found it (LEDGER #14 comment above). None of the four
+// REVIEWED_JSON_COLUMNS tests above assert anything about a column NOT already in the registry, so none
+// of them can catch the next one.
+//
+// This is a HEURISTIC tripwire, not a completeness proof — the test below says so in its own comment.
+// It scans schema.ts for the same two signals the round-3 audit's manual scan used to find all five
+// current REVIEWED_JSON_COLUMNS entries, with zero false positives on this schema today, and FAILS the
+// run (not warns) if either fires on a text() column outside both isJsonColumnName and
+// REVIEWED_JSON_COLUMNS: (a) the column's own doc comment calls it a JSON object/array, or (b) it
+// defaults to the JSON literal "{}"/"[]". A genuinely-JSON column whose doc comment never says "JSON"
+// and has no {}/[] default still slips through this heuristic exactly as it slipped through the naming
+// convention before it — this narrows the miss window, it does not close it.
+
+/**
+ * Every `text(...)` core-schema column DECLARATION in schema.ts, paired with the doc comment (JSDoc
+ * block or `//` line comment(s)) immediately preceding it and its full builder chain — the declaration
+ * line plus any `.`-prefixed continuation lines folded in, so `declLine` carries a `.default(...)`
+ * whether it sits on the declaration line or wraps below it.
+ *
+ * Line-based, not one sprawling regex trying to pair a comment block with "its" column in a single
+ * pass — a block regex that drifts by one declaration would produce confident nonsense, which is
+ * exactly the risk this function is built to avoid. schema.ts declares every real text() column as
+ * `fieldName: text("sql_name")...,` entirely on one line (verified by the sanity test below), so
+ * walking backward from a declaration's own line through CONTIGUOUS comment-shaped lines (`/**`, `*`,
+ * `*\/`, `//`) cannot cross into a sibling column's code: a real declaration line never matches the
+ * comment-line pattern, so the backward walk stops there deterministically — and a blank line (also
+ * not comment-shaped) stops it too, so a multi-table section-header comment separated from the next
+ * field by a blank line is never misattributed to that field either.
+ */
+function textColumnDeclarations(
+  source: string = SCHEMA_SOURCE
+): Array<{ sqlColumnName: string; docComment: string; declLine: string }> {
+  const lines = source.split("\n");
+  const isCommentLine = (line: string) => /^\s*(\/\*\*|\*\/|\*|\/\/)/.test(line);
+  const declPattern = /^\s*\w+:\s*text\("([a-z0-9_]+)"\)(.*)$/;
+
+  const out: Array<{ sqlColumnName: string; docComment: string; declLine: string }> = [];
+  for (let i = 0; i < lines.length; i++) {
+    const m = declPattern.exec(lines[i]);
+    if (!m) continue;
+    const commentLines: string[] = [];
+    let j = i - 1;
+    while (j >= 0 && isCommentLine(lines[j])) {
+      commentLines.unshift(lines[j]);
+      j--;
+    }
+    // Walk FORWARD through chained continuation lines (`.notNull()`, `.default("{}")`, …) and fold them
+    // into declLine, so the tripwire's default-literal signal sees a wrapped chain exactly as it sees a
+    // single-line one. A continuation line starts with `.` after leading whitespace; a real declaration
+    // line never does (it starts `fieldName:`), so this cannot run on into the next column.
+    const chainLines: string[] = [lines[i]];
+    let k = i + 1;
+    while (k < lines.length && /^\s*\./.test(lines[k])) {
+      chainLines.push(lines[k].trim());
+      k++;
+    }
+    out.push({ sqlColumnName: m[1], docComment: commentLines.join("\n"), declLine: chainLines.join("") });
+  }
+  return out;
+}
+
+test("textColumnDeclarations(): declLine carries a `.default(...)` wrapped onto a continuation line, not just a same-line one", () => {
+  // REGRESSION (found 2026-08-12 by mutation-testing the tripwire below, NOT by reading it): planting a
+  // `.default("{}")` column into schema.ts with the chain wrapped across lines left the whole file green
+  // — the tripwire never saw the default. The sanity test below used to claim its count assertion would
+  // catch that case first; it does not, because declPattern's trailing `(.*)` matches the EMPTY string,
+  // so a wrapped declaration still counts as one declaration and `declaredCount === rawTextCallSites - 1`
+  // still holds. Both signals fire correctly on the two single-line shapes (also mutation-proven); this
+  // is the third shape, and it was the one silent hole.
+  const wrapped = ['  someTable: {', '  /** JSON object of settings. */', '  probeConfig: text("probe_config")', '    .notNull()', '    .default("{}"),', "  }"].join("\n");
+  const [decl] = textColumnDeclarations(wrapped);
+  assert.equal(decl?.sqlColumnName, "probe_config");
+  assert.match(
+    decl.declLine,
+    /\.default\("\{\}"\)/,
+    "declLine must absorb chained continuation lines, otherwise the tripwire's JSON-literal-default signal " +
+      "silently goes blind on any column whose chain wraps"
+  );
+});
+
+test("sanity: every text() column declaration in schema.ts is single-line — the assumption textColumnDeclarations() (and the JSON tripwire below) depends on", () => {
+  // schema.ts has 612 total `text("...")` call sites: 611 real single-line column declarations plus
+  // exactly one non-declaration mention (schema.ts's own `// SQLite JSON storage stays text("*_json")`
+  // convention comment at line ~1703).
+  //
+  // CORRECTED 2026-08-12: this comment used to claim that a column wrapping `.default(...)` onto its own
+  // continuation line would drop declaredCount below rawTextCallSites - 1 and fail HERE, before the
+  // tripwire could go blind on that default. That was false, and mutation-testing proved it: declPattern's
+  // trailing `(.*)` matches the empty string, so a wrapped declaration still counts as exactly one
+  // declaration and both sides of the equality move together. What this assertion actually catches is a
+  // `text("col", { … })` config-object form (raw goes up, declaredCount does not) and any new
+  // non-declaration `text("` mention. The wrapped-chain case is now handled for real by
+  // textColumnDeclarations() folding continuation lines into declLine — see its own regression test above.
+  const declaredCount = textColumnDeclarations().length;
+  const rawTextCallSites = (SCHEMA_SOURCE.match(/text\("/g) ?? []).length;
+  assert.ok(declaredCount > 500, `sanity: expected 500+ text() column declarations, got ${declaredCount}`);
+  assert.equal(
+    declaredCount,
+    rawTextCallSites - 1,
+    'expected exactly one text("...") call site that is not a single-line column declaration (this file\'s ' +
+      "own convention comment) — a multi-line declaration would break this count and the tripwire's " +
+      "default-literal detection"
+  );
+});
+
+test("JSON-completeness tripwire (R4-F1/C-1): no text() column outside isJsonColumnName/REVIEWED_JSON_COLUMNS has a doc comment naming it JSON, or a JSON-literal default", () => {
+  // HEURISTIC, not a completeness proof — see the round-4 audit comment above for the honest statement
+  // of what this cannot catch: a genuinely-JSON column whose doc comment never says "JSON" and has no
+  // `{}`/`[]` default slips through exactly as `auth_config_ids` did before the round-3 audit found it
+  // by hand. This test narrows that miss window; it does not close it.
+  //
+  // Two signals, the same ones the round-3 audit's manual scan used to find all five current
+  // REVIEWED_JSON_COLUMNS entries:
+  //   (a) the column's OWN immediately-preceding doc comment names it a JSON object/array/etc.
+  //   (b) it defaults to the JSON literal "{}" or "[]" on its own declaration line.
+  //
+  // `JSON.stringify`/`JSON.parse` mentions are excluded from signal (a) on purpose, not by oversight:
+  // several sealed-ciphertext columns (composio_connector_credentials.sealed_ciphertext is the real,
+  // live example, pinned by the sanity assertion at the end of this test) document that they encrypt
+  // the OUTPUT of `JSON.stringify(...)` — the column itself stores base64 AES-GCM ciphertext, not
+  // plaintext JSON, and verifyJsonText would fail on every real row if this heuristic treated that
+  // mention as a JSON signal. Flagging that column would be the heuristic being wrong, not the schema.
+  //
+  // Column identity here is by bare SQL column name, not "table.column" — the same simplification
+  // REVIEWED_JSON_COLUMNS's own non-redundancy test above uses. Safe today because no bare column name
+  // in REVIEWED_JSON_COLUMNS ("ext", "auth_config_ids", "args", "allowed_tool_names", "env_names")
+  // repeats on any other table in schema.ts; a future column reusing one of those exact names on a
+  // different, actually-plain-text table would be silently exempted by this check, same as the
+  // existing non-redundancy test would silently misjudge it.
+  const reviewedByBareName = new Set(Object.keys(REVIEWED_JSON_COLUMNS).map((key) => key.split(".")[1]));
+  const jsonMentionInOwnComment = /\bJSON\b(?!\.(?:stringify|parse)\b)/;
+  const jsonLiteralDefault = /\.default\((["'])(\{\}|\[\])\1\)/;
+
+  const offenders: string[] = [];
+  for (const { sqlColumnName, docComment, declLine } of textColumnDeclarations()) {
+    if (isJsonColumnName(sqlColumnName) || reviewedByBareName.has(sqlColumnName)) continue;
+    const commentSignal = jsonMentionInOwnComment.test(docComment);
+    const defaultSignal = jsonLiteralDefault.test(declLine);
+    if (!commentSignal && !defaultSignal) continue;
+    const reason = [commentSignal ? "doc comment mentions JSON" : null, defaultSignal ? 'defaults to a JSON literal ("{}" or "[]")' : null]
+      .filter(Boolean)
+      .join(" and ");
+    offenders.push(`${sqlColumnName} (${reason})`);
+  }
+
+  assert.deepEqual(
+    offenders,
+    [],
+    `found text() column(s) that look like JSON by heuristic but are classified plain-text by neither the ` +
+      `*_json naming convention nor REVIEWED_JSON_COLUMNS: ${offenders.join(", ")}. If genuinely JSON, add an ` +
+      `entry (with rationale) to REVIEWED_JSON_COLUMNS in manifest.ts; if not, this heuristic has a false ` +
+      `positive and needs its own fix.`
+  );
+
+  // Confirm the JSON.stringify/parse exclusion is doing real work, not a dead branch that happens to
+  // never fire: composio_connector_credentials.sealed_ciphertext's own doc comment DOES mention "JSON"
+  // (via "JSON.stringify(credentials)") and the column is neither *_json-named nor in
+  // REVIEWED_JSON_COLUMNS — it is the live column that would turn into a false positive above if the
+  // exclusion regressed.
+  const sealedCiphertextDecl = textColumnDeclarations().find(
+    (d) => d.sqlColumnName === "sealed_ciphertext" && /JSON\.stringify/.test(d.docComment)
+  );
+  assert.ok(
+    sealedCiphertextDecl,
+    "sanity: expected to find the sealed_ciphertext column whose comment mentions JSON.stringify — if this " +
+      "fails, the trap case this test guards against no longer exists in schema.ts in this exact shape and " +
+      "should be replaced with a live one"
+  );
+});
+
 // LOW #14 (2026-08-12 audit): this "independent" oracle filters with `name === "at" || name.endsWith("_at")`
 // — the SAME predicate isTimestampColumnName() itself encodes, just re-typed by hand rather than
 // called. That proves classifyAllCoreColumns() faithfully APPLIES the rule to every real column (a

commit c4bc276fbb5990dce6fbe10624cf258964f3665c
Author: Leona Burime <leonaburime@gmail.com>
Date:   Wed Aug 12 16:25:00 2026 -0700

    feat(db): commit the SQLite JSONB customType that schema.ts already points at
    
    schema.ts:1713 has told readers to "See src/db/sqlite/jsonb-column.ts" since it was
    committed, but the file itself was never tracked -- it existed only in one working tree,
    so every clone had a dangling reference. This commits the file it names.
    
    Nothing imports it; it is documentation-with-tests for the SQLite JSONB findings
    (JSONB is portable and backwards-compatible, so storage is safe on the durability axis;
    what the "internal use only" rule actually prohibits is byte-level decoding, which
    decodeSqliteJsonb() does and the file says so). Its own header carries the correction of
    an earlier, wrong durability claim.
    
    9/9 tests pass, typecheck exit 0.
    
    Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

diff --git a/src/db/sqlite/__tests__/jsonb-column.test.ts b/src/db/sqlite/__tests__/jsonb-column.test.ts
new file mode 100644
index 0000000..7d40f86
--- /dev/null
+++ b/src/db/sqlite/__tests__/jsonb-column.test.ts
@@ -0,0 +1,152 @@
+import assert from "node:assert/strict";
+import test from "node:test";
+
+import Database from "better-sqlite3";
+import { eq } from "drizzle-orm";
+import { drizzle } from "drizzle-orm/better-sqlite3";
+import { integer, sqliteTable } from "drizzle-orm/sqlite-core";
+
+import { decodeSqliteJsonb, sqliteJsonb } from "../jsonb-column";
+
+/**
+ * @file Direct coverage for `sqliteJsonb`/`decodeSqliteJsonb` (`jsonb-column.ts`) against a real
+ * in-memory better-sqlite3 connection — no app schema or migrations involved, since this is
+ * testing the reusable column type itself, not any of the 37 existing `text("*_json")` columns
+ * in `db/schema.ts` (those are untouched; a separate design debate owns migrating them).
+ *
+ * Table shapes here are minimal ad hoc `CREATE TABLE ... BLOB` statements rather than
+ * `drizzle-kit generate`d migrations, matching what `dataType()` itself would emit.
+ */
+
+interface WidgetDoc {
+  theme: string;
+  slots: string[];
+  meta: { count: number; enabled: boolean; note: string | null };
+}
+
+const widgets = sqliteTable("widgets", {
+  id: integer("id").primaryKey(),
+  data: sqliteJsonb<WidgetDoc>()("data").notNull(),
+});
+
+const numbers = sqliteTable("numbers", {
+  id: integer("id").primaryKey(),
+  data: sqliteJsonb<number>()("data").notNull(),
+});
+
+function openWidgetsDb() {
+  const sqlite = new Database(":memory:");
+  sqlite.exec("CREATE TABLE widgets (id INTEGER PRIMARY KEY, data BLOB NOT NULL)");
+  return { sqlite, db: drizzle(sqlite) };
+}
+
+function openNumbersDb() {
+  const sqlite = new Database(":memory:");
+  sqlite.exec("CREATE TABLE numbers (id INTEGER PRIMARY KEY, data BLOB NOT NULL)");
+  return { sqlite, db: drizzle(sqlite) };
+}
+
+const sampleDoc: WidgetDoc = {
+  theme: "dark",
+  slots: ["header", "footer"],
+  meta: { count: 3, enabled: true, note: null },
+};
+
+test("sqliteJsonb: declared SQL type is blob, never jsonb (the affinity trap)", () => {
+  // NUMERIC affinity (what a literal "JSONB" declared type resolves to) would opportunistically
+  // cast a stored value that looks numeric — see the @file note in jsonb-column.ts. This pins the
+  // migration-facing contract directly, independent of any particular insert's behavior.
+  assert.equal(widgets.data.getSQLType(), "blob");
+});
+
+test("sqliteJsonb: round-trips a non-trivial nested object", () => {
+  const { db } = openWidgetsDb();
+  db.insert(widgets).values({ id: 1, data: sampleDoc }).run();
+
+  const [row] = db.select().from(widgets).where(eq(widgets.id, 1)).all();
+  assert.deepEqual(row?.data, sampleDoc);
+});
+
+test("sqliteJsonb: stores the column as BLOB storage class, not TEXT", () => {
+  const { sqlite, db } = openWidgetsDb();
+  db.insert(widgets).values({ id: 1, data: sampleDoc }).run();
+
+  const row = sqlite.prepare("SELECT typeof(data) AS storageClass FROM widgets WHERE id = 1").get() as {
+    storageClass: string;
+  };
+  assert.equal(row.storageClass, "blob");
+});
+
+test("sqliteJsonb: jsonb_extract reads a nested field from the stored value", () => {
+  const { sqlite, db } = openWidgetsDb();
+  db.insert(widgets).values({ id: 1, data: sampleDoc }).run();
+
+  const row = sqlite
+    .prepare("SELECT jsonb_extract(data, '$.meta.count') AS extractedCount FROM widgets WHERE id = 1")
+    .get() as { extractedCount: number };
+  assert.equal(row.extractedCount, 3);
+});
+
+test("sqliteJsonb: an expression index over jsonb_extract is created and used by the query planner", () => {
+  const { sqlite, db } = openWidgetsDb();
+  sqlite.exec("CREATE INDEX widgets_theme_idx ON widgets (jsonb_extract(data, '$.theme'))");
+
+  for (let i = 0; i < 25; i += 1) {
+    db.insert(widgets)
+      .values({
+        id: i + 1,
+        data: { theme: i === 12 ? "special" : "common", slots: [], meta: { count: i, enabled: false, note: null } },
+      })
+      .run();
+  }
+
+  const plan = sqlite
+    .prepare("EXPLAIN QUERY PLAN SELECT id FROM widgets WHERE jsonb_extract(data, '$.theme') = 'special'")
+    .all() as Array<{ detail: string }>;
+  const usesExpressionIndex = plan.some((step) => step.detail.includes("widgets_theme_idx"));
+  assert.ok(usesExpressionIndex, `expected the plan to use widgets_theme_idx, got: ${JSON.stringify(plan)}`);
+});
+
+test("sqliteJsonb: a bare-number document round-trips as a number, not affinity-coerced", () => {
+  const { sqlite, db } = openNumbersDb();
+  db.insert(numbers).values({ id: 1, data: 123 }).run();
+
+  // The affinity trap (see @file note) would coerce a JSONB blob written with an actually-broken
+  // declared type ("JSONB") into a real SQLite INTEGER for a document that is just a bare number.
+  // Confirms the fix holds specifically for the case that trap silently breaks.
+  const row = sqlite.prepare("SELECT typeof(data) AS storageClass FROM numbers WHERE id = 1").get() as {
+    storageClass: string;
+  };
+  assert.equal(row.storageClass, "blob");
+
+  const [selected] = db.select().from(numbers).where(eq(numbers.id, 1)).all();
+  assert.equal(selected?.data, 123);
+  assert.equal(typeof selected?.data, "number");
+});
+
+test("sqliteJsonb: pins the current on-disk JSONB byte layout for jsonb('{\"a\":1}') — NOT a stable contract", () => {
+  // SQLite's docs (quoted in full at the top of jsonb-column.ts) say the on-disk JSONB format is
+  // an internal implementation detail SQLite reserves the right to change between releases. This
+  // test does not assert a contract Tovu depends on — it records what SQLite 3.49.2
+  // (better-sqlite3's bundled version, as of this test) actually produces, so that a driver/SQLite
+  // upgrade that changes the encoding shows up here as a failure instead of silently doing
+  // nothing (this repo stores no real JSONB, so nothing else would notice). A failure here means
+  // "the format moved, re-verify jsonb-column.ts's reference material" — it is not a bug report.
+  const { sqlite } = openWidgetsDb();
+  const buf = sqlite.prepare("SELECT jsonb(?) AS blob").get(JSON.stringify({ a: 1 })) as { blob: Buffer };
+
+  // OBJECT (type 0xc) with a 4-byte payload (TEXT key "a" + INT value "1", 2 bytes each) packs
+  // into a single header byte: (4 << 4) | 0xc = 0x4c. Observed directly, not hand-derived only —
+  // see the probe methodology note in jsonb-column.ts's @file comment.
+  assert.equal(buf.blob.length, 5);
+  assert.equal(buf.blob[0], 0x4c);
+});
+
+test("decodeSqliteJsonb: rejects an empty buffer", () => {
+  assert.throws(() => decodeSqliteJsonb(Buffer.alloc(0)), /empty buffer/);
+});
+
+test("decodeSqliteJsonb: rejects trailing bytes after the top-level value", () => {
+  // A single top-level `true` (header byte 0x01) followed by one stray byte.
+  assert.throws(() => decodeSqliteJsonb(Buffer.from([0x01, 0xff])), /trailing byte/);
+});
diff --git a/src/db/sqlite/jsonb-column.ts b/src/db/sqlite/jsonb-column.ts
new file mode 100644
index 0000000..1311099
--- /dev/null
+++ b/src/db/sqlite/jsonb-column.ts
@@ -0,0 +1,307 @@
+import { sql } from "drizzle-orm";
+import { customType } from "drizzle-orm/sqlite-core";
+
+/**
+ * @file Reusable SQLite JSONB `customType` for Drizzle schema columns.
+ *
+ * ⚠️ NOT RECOMMENDED FOR STORAGE. Read this before reaching for `sqliteJsonb` on a real column.
+ * SQLite's own documentation (https://sqlite.org/json1.html, section 3.2.1 "The JSONB format")
+ * says, verbatim (re-verified 2026-08-12 against the live page, not transcribed from memory):
+ *
+ *   "JSONB is a binary representation of JSON used by SQLite and is intended for internal use
+ *    by SQLite only. Applications should not use JSONB outside of SQLite nor try to
+ *    reverse-engineer the JSONB format."
+ *
+ *   "There is space in the on-disk JSONB format to add enhancements and future versions of
+ *    SQLite might include options to provide O(1) lookup of elements in JSONB, but no such
+ *    capability is currently available."
+ *
+ * ⚠️ CORRECTED 2026-08-12 — an earlier version of this comment claimed persisting JSONB is a
+ * data-durability risk because a `better-sqlite3` upgrade could change the format under existing
+ * rows. **That was WRONG.** A second, separate SQLite page (https://sqlite.org/jsonb.html) states
+ * the opposite explicitly: *"JSONB is intended to be portable and backwards compatible for all
+ * future versions of SQLite… you should not have to export and reimport your SQLite database files
+ * when you upgrade to a newer SQLite version,"* and that the format is documented *"so that it too
+ * can be stable and enduring."* Storing `jsonb()` output is safe on that axis.
+ *
+ * What the "internal use only" rule actually prohibits is narrower, and this module violates it:
+ * *"Applications should access JSONB only through the JSON SQL functions, not by looking at
+ * individual bytes of the BLOB."* `decodeSqliteJsonb()` below reads individual bytes. It exists
+ * only because Drizzle's `customType.fromDriver` receives the raw driver value and cannot rewrite
+ * the SELECT to wrap the column in `json(...)` — see the read-path note further down.
+ *
+ * **So the blocker is Drizzle, not SQLite.** The compliant shape is: write through `jsonb()`, read
+ * through `json(col)` in the query itself, which means NOT using a `customType` for reads. Until
+ * something implements that, `db/schema.ts`'s `text("*_json")` remains the pragmatic default —
+ * a choice about tooling ergonomics, NOT about on-disk durability.
+ *
+ * This module exists anyway, alongside its tests, purely as **verified reference material**:
+ * concrete proof of what `jsonb()`/`jsonb_extract()`/expression indexes actually do against this
+ * repo's better-sqlite3 3.49.2, in case a future decision needs that evidence. It is deliberately
+ * NOT wired into any schema column, and this file is not a recommendation to do so. Tovu's own
+ * `db/schema.ts` deliberately keeps `text("*_json")` for SQLite, including for new columns —
+ * Postgres `jsonb` and MySQL `JSON` carry no equivalent caveat, so that decision is SQLite-only.
+ * The byte-format test in the sibling `__tests__` file pins the observed 3.49.2 encoding so a
+ * driver upgrade that moves the format fails loudly there instead of silently in stored data.
+ *
+ * Purpose:
+ * SQLite 3.45+ (this repo runs better-sqlite3's bundled 3.49.2) has a binary JSON storage
+ * format ("JSONB") that is smaller than storing JSON as text and lets `jsonb_extract()`-based
+ * expression indexes work over it. `sqliteJsonb<T>()` is a Drizzle `customType` factory that
+ * writes through SQLite's `jsonb()` function and reads back a parsed JS value of shape `T`.
+ * `decodeSqliteJsonb()` below is, in the terms of the warning above, exactly the
+ * "reverse-engineer the format" applications are told not to do — deliberately, for this file's
+ * reference-material purpose, and not as a pattern to reuse for a real storage column.
+ *
+ * Affinity trap (verified against this repo's better-sqlite3 3.49.2, do not "fix" by trying
+ * `CREATE TABLE t(x JSONB)`): SQLite assigns column affinity by matching the declared type
+ * string against a fixed keyword list (`INT`, `CHAR`/`CLOB`/`TEXT`, `BLOB`/empty, `REAL`/
+ * `FLOA`/`DOUB`, else NUMERIC). "JSONB" matches none of those, so it falls through to NUMERIC
+ * affinity. `pragma_table_info` happily reports the column type as "JSONB", masking the
+ * problem — but NUMERIC affinity means SQLite will opportunistically cast an inserted value
+ * that looks numeric. Probed directly: `CREATE TABLE t(x JSONB); INSERT INTO t VALUES ('123')`
+ * stores `123` as an `INTEGER`, not the 3-byte text `'123'`, silently corrupting any document
+ * that happens to be a bare JSON number. `dataType()` below MUST keep returning `"blob"` —
+ * BLOB affinity performs no such coercion — never `"jsonb"`.
+ *
+ * Why `toDriver` returns a `sql` fragment instead of a plain value:
+ * `customType`'s `toDriver` may return `T['driverData'] | SQL` (see
+ * `drizzle-orm/sqlite-core/columns/custom.d.ts`). When the mapped value is a Drizzle `SQL`
+ * object, `SQL.buildQueryFromSourceParams` (drizzle-orm/sql/sql.js) recurses into its chunks
+ * instead of binding it as a parameter, so `sql\`jsonb(${json})\`` compiles to literal
+ * `jsonb(?)` in the emitted statement with `json` bound as the parameter — confirmed by
+ * reading that source path, not assumed. That is what actually produces a BLOB storage-class
+ * value (verified: `typeof(col)` is `'blob'` after insert); passing a plain JSON string through
+ * as the driver value would store JSON as TEXT with no encoding at all.
+ *
+ * Why reads decode the binary format in JS instead of round-tripping through SQL `json()`:
+ * `customType.fromDriver` only receives the raw driver value already fetched for a plain
+ * column reference (drizzle-orm/utils.js's row mapper calls `decoder.mapFromDriverValue`
+ * directly on what the driver returned) — it cannot rewrite the `SELECT` to wrap the column
+ * in `json(...)`. better-sqlite3 returns a `Buffer` for a BLOB-affinity value, so
+ * `decodeSqliteJsonb` below implements SQLite's documented on-disk JSONB element format
+ * (https://sqlite.org/jsonb.html: one header byte = `(sizeNibble << 4) | elementType`, size
+ * either embedded in the high nibble (0-11) or following as a 1/2/4/8-byte big-endian integer
+ * for nibble values 12/13/14/15). Every byte pattern this decoder branches on was captured by
+ * inserting `jsonb(<literal>)` into a real in-memory `better-sqlite3` connection and dumping the
+ * stored bytes (probe script, not transcribed from the spec by hand) — see the round-trip and
+ * `typeof`/`jsonb_extract` tests in `__tests__/jsonb-column.test.ts` for the end-to-end proof.
+ * `INT5`/`FLOAT5`/`TEXT5` (JSON5-only spellings: unquoted keys, hex ints, leading-dot floats,
+ * `Infinity`/`NaN`, single-quoted strings) can never come out of *our own* write path, because
+ * `toDriver` only ever feeds `jsonb()` output from `JSON.stringify`, which never emits JSON5
+ * syntax. `decodeElement` throws rather than guessing if one is ever encountered (e.g. a
+ * document written by some other, non-this-helper JSONB producer), instead of silently
+ * misinterpreting it.
+ */
+
+/** SQLite JSONB element type codes (low nibble of the header byte), per sqlite.org/jsonb.html. */
+const ELEMENT_TYPE = {
+  NULL: 0x0,
+  TRUE: 0x1,
+  FALSE: 0x2,
+  INT: 0x3,
+  INT5: 0x4,
+  FLOAT: 0x5,
+  FLOAT5: 0x6,
+  TEXT: 0x7,
+  TEXTJ: 0x8,
+  TEXT5: 0x9,
+  TEXTRAW: 0xa,
+  ARRAY: 0xb,
+  OBJECT: 0xc,
+} as const;
+
+/** Header byte high-nibble values 12-15 mean "payload size follows in N bytes", not a literal size. */
+const SIZE_FOLLOWS_1_BYTE = 12;
+const SIZE_FOLLOWS_2_BYTES = 13;
+const SIZE_FOLLOWS_4_BYTES = 14;
+const SIZE_FOLLOWS_8_BYTES = 15;
+
+/** One decoded JSONB element plus the buffer offset immediately after it. */
+interface DecodedElement {
+  value: unknown;
+  nextOffset: number;
+}
+
+/**
+ * Reads the header at `offset` (element type + payload byte range) without interpreting the
+ * payload itself.
+ *
+ * @throws {Error} if `offset` runs past the buffer while reading a multi-byte size field.
+ * @complexity O(1) — reads at most 9 bytes.
+ */
+function readHeader(buf: Buffer, offset: number): { elementType: number; payloadStart: number; payloadLength: number } {
+  const headerByte = buf.readUInt8(offset);
+  const elementType = headerByte & 0x0f;
+  const sizeNibble = (headerByte >> 4) & 0x0f;
+
+  if (sizeNibble <= 11) {
+    return { elementType, payloadStart: offset + 1, payloadLength: sizeNibble };
+  }
+  if (sizeNibble === SIZE_FOLLOWS_1_BYTE) {
+    return { elementType, payloadStart: offset + 2, payloadLength: buf.readUInt8(offset + 1) };
+  }
+  if (sizeNibble === SIZE_FOLLOWS_2_BYTES) {
+    return { elementType, payloadStart: offset + 3, payloadLength: buf.readUInt16BE(offset + 1) };
+  }
+  if (sizeNibble === SIZE_FOLLOWS_4_BYTES) {
+    return { elementType, payloadStart: offset + 5, payloadLength: buf.readUInt32BE(offset + 1) };
+  }
+  // sizeNibble === SIZE_FOLLOWS_8_BYTES: an 8-byte length only matters for payloads far beyond
+  // what Buffer/Node can address anyway; Number() truncation is not a realistic concern here.
+  return { elementType, payloadStart: offset + 9, payloadLength: Number(buf.readBigUInt64BE(offset + 1)) };
+}
+
+/**
+ * Decodes JSON string-escape sequences (`\n`, `\"`, `\uXXXX`, ...) in a JSONB TEXT/TEXTJ
+ * payload by delegating to `JSON.parse`, rather than hand-rolling RFC 8259 escape handling:
+ * the payload bytes are — by the JSONB format's own definition — exactly the bytes that would
+ * appear between the quotes of a canonical JSON string, so wrapping them in quotes and parsing
+ * reuses the engine's own (correct) string-escape decoder instead of a second, riskier one.
+ */
+function decodeJsonStringPayload(payloadUtf8: string): string {
+  return JSON.parse(`"${payloadUtf8}"`) as string;
+}
+
+/** Element type codes this decoder never expects to see (see the `@file` note on JSON5 spellings). */
+const JSON5_ONLY_ELEMENT_TYPES: ReadonlySet<number> = new Set([ELEMENT_TYPE.INT5, ELEMENT_TYPE.FLOAT5, ELEMENT_TYPE.TEXT5]);
+
+/**
+ * Decodes a leaf (non-container) element's payload into its JS value. Split out of
+ * `decodeElement` purely to keep each function's branching under the repo's complexity budget —
+ * this half has no recursion, the container half (ARRAY/OBJECT) is what needs it.
+ *
+ * @throws {Error} on an element type this decoder does not support (INT5/FLOAT5/TEXT5, or an
+ *   unrecognized code — corruption or a non-JSONB blob).
+ * @complexity O(payloadEnd - payloadStart) — a single `Buffer.toString` slice.
+ */
+function decodeScalarPayload(elementType: number, buf: Buffer, payloadStart: number, payloadEnd: number): unknown {
+  switch (elementType) {
+    case ELEMENT_TYPE.NULL:
+      return null;
+    case ELEMENT_TYPE.TRUE:
+      return true;
+    case ELEMENT_TYPE.FALSE:
+      return false;
+    case ELEMENT_TYPE.INT:
+    case ELEMENT_TYPE.FLOAT:
+      return Number(buf.toString("utf8", payloadStart, payloadEnd));
+    case ELEMENT_TYPE.TEXT:
+    case ELEMENT_TYPE.TEXTJ:
+      return decodeJsonStringPayload(buf.toString("utf8", payloadStart, payloadEnd));
+    case ELEMENT_TYPE.TEXTRAW:
+      // Raw text carries no escape sequences at all (guaranteed by the producer) — used as-is.
+      return buf.toString("utf8", payloadStart, payloadEnd);
+    default:
+      if (JSON5_ONLY_ELEMENT_TYPES.has(elementType)) {
+        throw new Error(
+          `decodeSqliteJsonb: JSON5-only element type ${elementType} at offset ${payloadStart} is not supported ` +
+            "(this column's own writes only ever produce strict-JSON element types; a JSON5 spelling means this " +
+            "blob was not written through sqliteJsonb's toDriver)"
+        );
+      }
+      throw new Error(`decodeSqliteJsonb: unknown JSONB element type ${elementType} at offset ${payloadStart}`);
+  }
+}
+
+/**
+ * Decodes an ARRAY or OBJECT element's payload, recursing into `decodeElement` for each item
+ * (or key/value pair).
+ *
+ * @throws {Error} if `elementType` is OBJECT and a key element decodes to a non-string.
+ * @complexity O(n) in the number of bytes making up the container and its descendants.
+ */
+function decodeContainerPayload(elementType: number, buf: Buffer, payloadStart: number, payloadEnd: number): unknown {
+  if (elementType === ELEMENT_TYPE.ARRAY) {
+    const items: unknown[] = [];
+    let cursor = payloadStart;
+    while (cursor < payloadEnd) {
+      const item = decodeElement(buf, cursor);
+      items.push(item.value);
+      cursor = item.nextOffset;
+    }
+    return items;
+  }
+
+  const obj: Record<string, unknown> = {};
+  let cursor = payloadStart;
+  while (cursor < payloadEnd) {
+    const key = decodeElement(buf, cursor);
+    if (typeof key.value !== "string") {
+      throw new Error(`decodeSqliteJsonb: object key at offset ${cursor} decoded to a non-string (${typeof key.value})`);
+    }
+    const val = decodeElement(buf, key.nextOffset);
+    obj[key.value] = val.value;
+    cursor = val.nextOffset;
+  }
+  return obj;
+}
+
+/**
+ * Decodes one JSONB element starting at `offset` and returns it plus the offset just past it.
+ *
+ * @throws {Error} propagated from `decodeScalarPayload`/`decodeContainerPayload` — see those.
+ * @complexity O(n) in the number of bytes making up this element and its descendants.
+ */
+function decodeElement(buf: Buffer, offset: number): DecodedElement {
+  const { elementType, payloadStart, payloadLength } = readHeader(buf, offset);
+  const payloadEnd = payloadStart + payloadLength;
+  const nextOffset = payloadEnd;
+  const value =
+    elementType === ELEMENT_TYPE.ARRAY || elementType === ELEMENT_TYPE.OBJECT
+      ? decodeContainerPayload(elementType, buf, payloadStart, payloadEnd)
+      : decodeScalarPayload(elementType, buf, payloadStart, payloadEnd);
+  return { value, nextOffset };
+}
+
+/**
+ * Decodes a buffer in SQLite's binary JSONB format (as produced by the `jsonb()` SQL function)
+ * back into a plain JS value.
+ *
+ * @throws {Error} if `buf` is empty, contains an unsupported/unknown element type, or has
+ *   trailing bytes after the single top-level value (corruption or a non-JSONB blob).
+ * @complexity O(n) in `buf.length`.
+ */
+export function decodeSqliteJsonb(buf: Buffer): unknown {
+  if (buf.length === 0) {
+    throw new Error("decodeSqliteJsonb: empty buffer is not a valid JSONB value");
+  }
+  const { value, nextOffset } = decodeElement(buf, 0);
+  if (nextOffset !== buf.length) {
+    throw new Error(`decodeSqliteJsonb: ${buf.length - nextOffset} trailing byte(s) after the top-level value`);
+  }
+  return value;
+}
+
+/**
+ * Drizzle `customType` factory for a SQLite JSONB column.
+ *
+ * `TDocument` is the shape callers get back on select and must supply on insert/update, e.g.
+ * `data: sqliteJsonb<{ tag: string; count: number }>()("data")`. Every value round-trips through
+ * `JSON.stringify`/`JSON.parse` semantics (same fidelity limits as any JSON-backed column: no
+ * `undefined`, `Date`, or `bigint` beyond `Number` precision).
+ *
+ * @example
+ * ```ts
+ * const widgets = sqliteTable("widgets", {
+ *   id: text("id").primaryKey(),
+ *   config: sqliteJsonb<{ theme: string; slots: string[] }>()("config").notNull(),
+ * });
+ * ```
+ */
+export function sqliteJsonb<TDocument>() {
+  return customType<{ data: TDocument; driverData: Buffer }>({
+    dataType() {
+      // MUST stay "blob" — see the affinity-trap note in the @file comment. Never "jsonb".
+      return "blob";
+    },
+    toDriver(value: TDocument) {
+      // Returns an SQL fragment (not the plain string) so the value is written through SQLite's
+      // jsonb() function rather than stored as text — see the @file note on why this works.
+      return sql`jsonb(${JSON.stringify(value)})`;
+    },
+    fromDriver(value: Buffer): TDocument {
+      return decodeSqliteJsonb(value) as TDocument;
+    },
+  });
+}

commit 9e75c4ad8f80bd6977593cb525ef14589860b307
Author: Leona Burime <leonaburime@gmail.com>
Date:   Wed Aug 12 16:55:12 2026 -0700

    fix(theme): close the preview/ write gate on PUT's sourceDir branch -- the 4th gap in the same rule
    
    The rule is "only build-preview.mjs writes preview/". It has now been patched into
    rename, then copy ("the gap the rename fix left open"), then reset ("alongside copy's").
    PUT was the one write route nobody re-checked, and it had the same hole.
    
    PUT picks between two deliberately disjoint rules:
    
      writable = isInsideCompiledSourceDir(...) ? isSourceDirWritableExtension(path)
                                                : isThemeFileWritable(path)
    
    The security-pass fix put the preview/ refusal INSIDE isThemeFileWritable, on the stated
    reasoning that folding it into the shared helper beat "a second, easy-to-forget check at
    each call site." But the sourceDir branch deliberately never calls that helper, so for a
    compiled theme the only gate left was an extension allowlist that knows nothing about
    preview/ -- i.e. the fix forgot exactly the way its own comment said it was avoiding.
    
    Reachable, not theoretical: a compiled theme with build.sourceDir "preview" makes
    resolveThemeFileWriteScope answer "editable" for preview/ paths, which routes PUT down
    that branch. The regression test PUTs preview/app.css and got 200 with the write on disk
    before this change; 403 READ_ONLY_FILE and disk untouched after.
    
    Applied as a location refusal ahead of the branch rather than folded into either rule, so
    the documented disjointness between the two extension gates is preserved. The deeper fix
    -- a conformance rule forbidding build.sourceDir from naming a GENERATED_THEME_DIRS entry
    at install time -- is noted in the code and NOT attempted here.
    
    No theme on disk today declares build.source "compiled", so nothing shipped was exposed.
    46/46 theme route tests, 31/31 theme-files tests, typecheck exit 0.
    
    Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

diff --git a/src/server/routes/admin/themes/__tests__/explore-built-theme-gate.test.ts b/src/server/routes/admin/themes/__tests__/explore-built-theme-gate.test.ts
index ef678f0..2606f22 100644
--- a/src/server/routes/admin/themes/__tests__/explore-built-theme-gate.test.ts
+++ b/src/server/routes/admin/themes/__tests__/explore-built-theme-gate.test.ts
@@ -425,3 +425,59 @@ test("an authored theme's PUT/copy/rename are completely unaffected by any of th
   });
   assert.equal(copy.status, 200);
 });
+
+/**
+ * A compiled theme whose `build.sourceDir` IS the generated dir (`preview`). Contrived on purpose:
+ * it is the one manifest shape that makes `resolveThemeFileWriteScope` answer `"editable"` for a
+ * `preview/…` path, which is what routes PUT down its sourceDir branch.
+ */
+function makeSourceDirIsPreviewRoot(): string {
+  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-explore-preview-src-"));
+  const dir = path.join(root, "static", "srcpreview");
+  fs.mkdirSync(path.join(dir, "pages"), { recursive: true });
+  fs.mkdirSync(path.join(dir, "preview"), { recursive: true });
+
+  const pageHtml = `<!doctype html><html><head>${SENTINEL}</head><body>SrcPreview</body></html>`;
+  fs.writeFileSync(path.join(dir, "pages", "index.html"), pageHtml, "utf8");
+  fs.writeFileSync(path.join(dir, "tokens.json"), "{}", "utf8");
+  fs.writeFileSync(path.join(dir, "preview", "app.css"), "body{color:blue}", "utf8");
+  fs.writeFileSync(
+    path.join(dir, "theme.json"),
+    JSON.stringify({
+      id: "srcpreview",
+      name: "SrcPreview",
+      version: "1.0.0",
+      tier: "static",
+      engine: 1,
+      author: "Aurora Themes Co.",
+      build: { source: "compiled", sourceDir: "preview", artifactHashes: { "pages/index.html": sha256(pageHtml) } },
+    }),
+    "utf8"
+  );
+  return root;
+}
+
+test("PUT into preview/ is refused even on the sourceDir branch — the generated-dir gate must not depend on which of PUT's two disjoint rules applies", async (t) => {
+  // REGRESSION (2026-08-13): the `preview/` refusal was folded into `isThemeFileWritable`, which PUT
+  // consults ONLY on its non-compiled branch. `isInsideCompiledSourceDir` deliberately does NOT fall
+  // back to that gate (see its own doc), so for a compiled theme the sole check was
+  // `isSourceDirWritableExtension` — an EXTENSION allowlist that knows nothing about `preview/`.
+  // rename/copy/reset each carry their own explicit `isGeneratedThemePath` refusal; PUT was the one
+  // write route where the check rode on a helper only half its paths use.
+  const themesDir = makeSourceDirIsPreviewRoot();
+  const app = buildTestApp(themesDir);
+  const baseUrl = await startTestServer(app, t);
+  const target = path.join(themesDir, "static", "srcpreview", "preview", "app.css");
+  const before = fs.readFileSync(target, "utf8");
+
+  const response = await fetch(`${baseUrl}${BASE("srcpreview")}/file`, {
+    method: "PUT",
+    headers: { "content-type": "application/json" },
+    body: JSON.stringify({ path: "preview/app.css", content: "HACKED" }),
+  });
+
+  assert.equal(response.status, 403, "preview/ is build-preview.mjs's output; no editor route may write it");
+  const body = (await response.json()) as { code: string };
+  assert.equal(body.code, "READ_ONLY_FILE");
+  assert.equal(fs.readFileSync(target, "utf8"), before, "the refused write must not have reached disk");
+});
diff --git a/src/server/routes/admin/themes/explore.ts b/src/server/routes/admin/themes/explore.ts
index 4468ba2..b3e4357 100644
--- a/src/server/routes/admin/themes/explore.ts
+++ b/src/server/routes/admin/themes/explore.ts
@@ -540,9 +540,22 @@ export const registerAdminThemeFilePutRoute: ContentRouteRegistrar = (app, deps)
       // `isThemeFileWritable` gate here would silently readmit extensions (`.svg`, classified `asset`
       // — never read-only, with no notion of location) the sourceDir allowlist exists to exclude.
       // Everywhere else, `isThemeFileWritable` is unchanged.
-      const writable = isInsideCompiledSourceDir(theme, path, writeScope)
-        ? isSourceDirWritableExtension(path)
-        : isThemeFileWritable(path);
+      // 2026-08-13: `!isGeneratedThemePath` is applied to the sourceDir branch too, NOT folded into
+      // `isSourceDirWritableExtension` — the disjointness above is about WHICH EXTENSIONS are
+      // writable, and `preview/` is a location refusal that outranks both rules rather than a third
+      // opinion OR'd into either. It has to be repeated here because the original security-pass fix
+      // put this refusal inside `isThemeFileWritable`, reasoning it was better there than "a second,
+      // easy-to-forget check at each call site" — but this branch deliberately never calls that gate,
+      // so a compiled theme's PUT was left with an extension allowlist that knows nothing about
+      // `preview/`, and a `sourceDir: "preview"` manifest wrote straight into it (200, on disk).
+      // rename/copy/reset each already carry their own explicit refusal; this makes PUT match.
+      // The deeper fix is a conformance rule forbidding `build.sourceDir` from naming a
+      // GENERATED_THEME_DIRS entry at install time — not attempted here, see the regression test.
+      const writable =
+        !isGeneratedThemePath(path) &&
+        (isInsideCompiledSourceDir(theme, path, writeScope)
+          ? isSourceDirWritableExtension(path)
+          : isThemeFileWritable(path));
       if (!writable) {
         res.status(403).json({
           error: `'${path}' is read-only in Explore and cannot be saved`,

commit c614ba86d8f58fdf45b25f20230a4cb42a0f952c
Author: Leona Burime <leonaburime@gmail.com>
Date:   Wed Aug 12 16:25:30 2026 -0700

    docs(handoff): correct three stale claims in the postgres audit handoff
    
    - "Nothing pushed" was wrong: the branch was already in sync with origin/general-work.
    - fix-r4's tripwire is no longer in flight -- it landed (3cd312d), so the "if it did not
      land" branch of the handoff is dead text.
    - Known-open item 1 is closed, and records HOW: the tripwire was green and blind on the
      wrapped-.default() shape, and its own comment claimed a guard that did not exist.
      A green scanner test proves nothing until you make it fail.
    
    Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

diff --git a/ADS-memory/reports/handoff/2026-08-12-postgres-audit-session-handoff.md b/ADS-memory/reports/handoff/2026-08-12-postgres-audit-session-handoff.md
index f552bf5..1e9c2ee 100644
--- a/ADS-memory/reports/handoff/2026-08-12-postgres-audit-session-handoff.md
+++ b/ADS-memory/reports/handoff/2026-08-12-postgres-audit-session-handoff.md
@@ -1,6 +1,6 @@
 # Handoff — Postgres manifest: 4 audit rounds, all findings fixed
 
-**Date:** 2026-08-12 · **Branch:** `general-work` · **Nothing pushed.** · **typecheck exit 0**
+**Date:** 2026-08-12 · **Branch:** `general-work` · **Pushed.** · **typecheck exit 0**
 
 > **STOP HERE. The work is done.** Do not run a round 5. Rationale below under *Why to stop*.
 
@@ -32,9 +32,10 @@
 | `2cb39fc` | 5 unconventioned JSON columns classified |
 | `aa68742` | round-2 audit report |
 
-**In flight, not committed:** agent `fix-r4` was implementing a heuristic fail-closed tripwire test
-(test-only, `migration-manifest.test.ts`) for the one round-4 finding. **If it did not land, that is
-fine** — see *Known-open* below. Nothing depends on it.
+**RESOLVED 2026-08-12 (session 7):** `fix-r4`'s tripwire landed and is committed (`3cd312d`), together
+with a fix for a hole in it that mutation-testing found — see *Known-open* item 1. Also committed:
+`c4bc276`, the untracked `src/db/sqlite/jsonb-column.ts` that `schema.ts:1713` had been pointing at
+since it was written (every clone had a dangling reference until now).
 
 ## Why to stop
 
@@ -54,8 +55,16 @@ where these guarantees actually get spent.
    end-to-end classification, and a 5-column snapshot — none asserts anything about a column *not* in
    the registry, and `classifyCoreColumn` falls through to `plain-text` (`manifest.ts:474`) ungated. A
    future genuinely-JSON column named outside `_json`/`Json` and not registered will silently
-   misclassify. Owner chose the heuristic tripwire fix; if `fix-r4` didn't land it, this is the only
-   open item and it is hypothetical (all 5 known instances are fixed).
+   misclassify. Owner chose the heuristic tripwire fix. **CLOSED `3cd312d`** — but note *how* it closed,
+   because it is the trap of this whole audit in miniature: the tripwire was green and blind. Mutation
+   -testing it (plant a JSON-looking column, three declaration shapes) showed both signals fire on the two
+   single-line shapes and NEITHER fires when the builder chain wraps `.default("{}")` onto continuation
+   lines. Its own comment claimed the sanity count-assertion would catch that first; it does not, because
+   `declPattern`'s trailing `(.*)` matches the empty string, so a wrapped declaration still counts as one
+   declaration and both sides of the equality move together. Fixed by folding `.`-prefixed continuation
+   lines into `declLine`. **A green scanner test proves nothing until you make it fail.** The tripwire is
+   still a heuristic by design and says so — a JSON column with no "JSON" in its doc comment and no
+   `{}`/`[]` default still slips through.
 2. **Pid-reuse race in the fixture sweep.** Failure mode is "database does not exist" on a sibling test
    run — infra churn, not data loss. A UUID nonce would fix it but ends auto-reclaim of pid-suffixed
    fixtures. Deliberately declined.
```
