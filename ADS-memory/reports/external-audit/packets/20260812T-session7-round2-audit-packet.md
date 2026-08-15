# Audit Packet — ROUND 2 (compliance) — TM-tovu-session7-diff-001

**Packet ID:** PKT-tovu-session7-r2
**Threat model:** TM-tovu-session7-diff-001 (UNCHANGED, still frozen — same allowlist, same invariants)
**Audit round:** 2 → run as a **Compliance Inspector**, not a fresh full audit
**suggest_changes:** patches · **Risk tier:** medium · **score floor 8.5**

---

## PREAMBLE — READ THIS FIRST

There is no AGENTS.md, CLAUDE.md, CONTEXT.md, or bootstrap file for this task. This is intentional.
**A missing file is never a reason to stop. Reporting yourself blocked is a wrong answer.** Do not
read any repository file — this packet is self-contained. Do not chain reads with `&&`.

---

## Prior-Round Disposition Ledger

Round 1 was audited by three peers (Terra gpt-5.6-terra@xhigh, Gemini 3.1 Pro, Gemini 3.6 Flash).
Every finding below was independently re-verified by the coordinator before disposition.

| # | Round-1 finding | Raised by | Disposition | Evidence |
|---|---|---|---|---|
| 1 | Tripwire blind to `text('single_quoted')` | Terra F1 | **fixed** | scanner replaced with AST walk; mutation CAUGHT |
| 2 | Tripwire blind to a reused bare column name on another table | Gemini Pro F1 | **fixed** | identity now `table.column`; mutation CAUGHT |
| 3 | Tripwire blind to lowercase `json` in a doc comment | Flash (rated advisory) | **fixed** | mention regex now `/i` + `(?<!\.)`; mutation CAUGHT |
| 4 | Sanity test title + assertion message still stated the disproved "declarations are single-line" claim | Terra F2 | **fixed** | test replaced; now asserts no textually-visible column is missing from the scan |
| 5 | `jsonb-column.ts` affinity rationale overstated — claimed coercion reaches this helper's own writes | Terra F3 | **fixed** | re-probed live (SQLite 3.49.2); comment narrowed to the measurement; `dataType()` unchanged |
| 6 | `decodeContainerPayload` decoded a value at `key.nextOffset` without checking `< payloadEnd` | Gemini Pro F2 | **fixed** | bounds check added; regression test builds the exact 6-byte truncated blob |
| 7 | Make the JSON mention regex case-insensitive (bare `/i`) | Flash path_to_10 | **rejected, then fixed differently** | bare `/i` was TESTED and false-positived on `template_choice` (comment mentions the FILENAME `theme.json`; `.` is a word boundary). Implemented with a `(?<!\.)` lookbehind instead. |

**Your job this round:**
1. Reconcile each ledger row — is it genuinely resolved by the diff below? A `fixed` claim with no
   corresponding change in the diff is itself a blocker (gate-evasion domain).
2. Audit the diff PLUS the minimum unchanged context needed to judge its behavioral effects, for NEW
   contract violations. **Every finding must state its causal link to this diff.**
3. Match findings to the ledger by underlying causal claim, not by ID or wording. An excluded concern
   cannot re-enter under a new label.

A finding NOT caused by this diff is admissible only with materially new evidence unavailable in
round 1, and must carry a `round_1_miss_justification`.

## Mandatory invariants (unchanged)

- **I1.** No editor HTTP route may write a path for which `isGeneratedThemePath()` is true, on ANY
  branch of its writability decision, for ANY manifest shape.
- **I2.** The JSON tripwire must FAIL (not warn) when a `text()` column outside both the `*_json`
  naming convention and `REVIEWED_JSON_COLUMNS` carries either JSON signal.
- **I3.** Every comment in the diff that states what a check catches must be true of the code as written.
- **I4.** The changes must not weaken or no-op any pre-existing assertion.

**In-scope BLOCKING domains (allowlist):** D1 write-gate bypass · D2 guard that cannot fail ·
D3 false claim a maintainer would rely on · D4 correctness defect · D5 regression in documented behavior.

**Explicitly NOT blocking (advisory at most):** style/naming; `jsonb-column.ts` having no importers
(known and accepted); the tripwire remaining a heuristic rather than a completeness proof (stated and
intended — a JSON column with no JSON mention and no `{}`/`[]` default still slips through by design);
absence of an install-time conformance rule forbidding `build.sourceDir: "preview"` (explicitly deferred).

**Escape valve:** a catastrophic issue outside the allowlist goes in `out_of_scope_fatal_warnings` —
it does not lower the score and does not block.

## Verification evidence for THIS round

- `npm run typecheck` → exit 0
- `migration-manifest.test.ts` + `jsonb-column.test.ts` → **63/63 pass**
- Mutation matrix against the real `schema.ts`, each column planted then reverted:

| planted shape | result |
|---|---|
| `text('single_quoted')` + JSON comment + `.default('{}')` | **CAUGHT** |
| reused bare name `args` on another table, both signals | **CAUGHT** |
| lowercase `json` in doc comment | **CAUGHT** |
| wrapped builder chain with `.default("{}")` | **CAUGHT** |
| plain double-quoted, same line | **CAUGHT** |
| comment mentioning only the filename `theme.json` | **not caught (correct — false-positive guard)** |

## Gate formula (the coordinator recomputes this; a returned verdict that disagrees is rejected)

`blocking_gate = FAIL` if EITHER an unresolved validated blocker exists (allowed actor violates a
mandatory invariant, maps to one allowlist domain) OR `score < 8.5`. Classify blockers BEFORE scoring.
`path_to_10` items are ALWAYS advisory and never become blockers.

## Auditor Instructions

Begin with an `Auditor Scope Check`. Compute threat-model acceptance FIRST and report it only inside
the JSON object. Attempt to FALSIFY the invariants and the ledger. **Zero findings is a valid result.**
Do not invent speculative defects. Every finding needs Checked / Expected / Observed / Why it matters /
Recommended fix / Confidence, plus a ranked fix slate where more than one fix is viable.

Return ONE JSON object, last, in a ```json fence:

```json
{
  "threat_model_accepted": true,
  "rejection_reason": null,
  "auditor_scope_check": "...",
  "ledger_reconciliation": [
    {"row": 1, "claim": "fixed", "verified": true, "note": "..."}
  ],
  "findings": [
    {"id":"F1","severity":"critical|high|medium|low|advisory","blocking":true,
     "allowlist_domain":"D1|D2|D3|D4|D5","file":"...","line":0,
     "diff_causal_link":"...","round_1_miss_justification":null,
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

## THE DIFF UNDER AUDIT (round 2)

```diff
commit 57d5d6506dc9e671e9c63ee29a808fc01d747a84
Author: Leona Burime <leonaburime@gmail.com>
Date:   Wed Aug 12 17:31:05 2026 -0700

    fix(db): apply the 3 non-cascading audit findings; defer the scanner rewrite
    
    External audit panel (Terra gpt-5.6-terra@xhigh, Gemini 3.1 Pro, Gemini 3.6 Flash) on this
    session's diff. Every finding below was re-verified locally before being accepted; the
    scores were 5.8 / 6.5 / 10.0 and the 10.0 was rejected as internally inconsistent (zero
    findings, yet its own path_to_10 named a defect another auditor rated critical, which
    mutation-testing then confirmed as real).
    
    Applied -- the three that cannot cascade:
    
    1. The false claim, finished. The previous commit corrected the BODY comment and left the
       test title and the assertion message still stating the disproved thing ("every text()
       column declaration is single-line" / "a multi-line declaration would break this count").
       Three instances, one fixed. Both remaining now state what the assertion actually pins:
       a text("col", { ... }) config-object form and new non-declaration text(" mentions --
       explicitly NOT the wrapped-chain case. Text only, no behavior.
    
    2. jsonb-column.ts's affinity rationale, narrowed to the measurement. Re-probed live
       (better-sqlite3 / SQLite 3.49.2): jsonb('123') stores as blob under BLOB-, JSONB- AND
       TEXT-declared columns; only RAW numeric-looking text into a JSONB-declared column
       coerces to integer. So the trap is real but does not reach anything toDriver() writes,
       which the old comment claimed. dataType() still returns "blob" -- the reason changed,
       not the code. Comment only.
    
    3. decodeContainerPayload bounds check. The object branch decoded a value at
       key.nextOffset without checking it was still inside the object's own payloadEnd, so a
       payload ending after a key consumed the ENCLOSING array's next element as the value --
       silent structural corruption instead of a reported truncation. Regression test builds
       the exact 6-byte blob and fails before the fix.
    
    Deferred, deliberately -- three confirmed tripwire blind spots (single-quoted text('x'),
    a reused bare column name on another table, lowercase "json" in a doc comment). All three
    are one root cause: a regex line-scanner is the wrong instrument for parsing TypeScript.
    Terra's ranked-1 fix is an AST scan. Not attempted here: rewriting the scanner is the same
    class of change that left a gap every previous time, and these blind spots sit in a
    test-only heuristic that already declares itself not a completeness proof, guarding a
    subsystem with zero production consumers.
    
    REJECTED: making the JSON-mention regex case-insensitive. Tested rather than assumed -- it
    immediately false-positives on template_choice, whose comment mentions the FILENAME
    theme.json (\bjson\b matches, since "." and "`" are both word boundaries). That column
    stores "blog-post.html". The one-character fix would have turned the suite red.
    
    63/63 across both suites, typecheck exit 0.
    
    Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

diff --git a/src/db/__tests__/migration-manifest.test.ts b/src/db/__tests__/migration-manifest.test.ts
index b75aeb2..9cd63cf 100644
--- a/src/db/__tests__/migration-manifest.test.ts
+++ b/src/db/__tests__/migration-manifest.test.ts
@@ -386,7 +386,7 @@ test("textColumnDeclarations(): declLine carries a `.default(...)` wrapped onto
   );
 });
 
-test("sanity: every text() column declaration in schema.ts is single-line — the assumption textColumnDeclarations() (and the JSON tripwire below) depends on", () => {
+test('sanity: exactly one text(" call site in schema.ts is not a scanner-recognized declaration head — this does NOT prove declarations are single-line', () => {
   // schema.ts has 612 total `text("...")` call sites: 611 real single-line column declarations plus
   // exactly one non-declaration mention (schema.ts's own `// SQLite JSON storage stays text("*_json")`
   // convention comment at line ~1703).
@@ -405,9 +405,11 @@ test("sanity: every text() column declaration in schema.ts is single-line — th
   assert.equal(
     declaredCount,
     rawTextCallSites - 1,
-    'expected exactly one text("...") call site that is not a single-line column declaration (this file\'s ' +
-      "own convention comment) — a multi-line declaration would break this count and the tripwire's " +
-      "default-literal detection"
+    'expected exactly one text("...") call site that is not a scanner-recognized declaration head ' +
+      "(schema.ts's own convention comment). This catches a `text(\"col\", { … })` config-object form and " +
+      "any NEW non-declaration `text(\"` mention. It does NOT catch a wrapped builder chain — that still " +
+      "counts as one declaration head, and is handled by textColumnDeclarations() folding continuation " +
+      "lines instead"
   );
 });
 
diff --git a/src/db/sqlite/__tests__/jsonb-column.test.ts b/src/db/sqlite/__tests__/jsonb-column.test.ts
index 7d40f86..3714756 100644
--- a/src/db/sqlite/__tests__/jsonb-column.test.ts
+++ b/src/db/sqlite/__tests__/jsonb-column.test.ts
@@ -150,3 +150,26 @@ test("decodeSqliteJsonb: rejects trailing bytes after the top-level value", () =
   // A single top-level `true` (header byte 0x01) followed by one stray byte.
   assert.throws(() => decodeSqliteJsonb(Buffer.from([0x01, 0xff])), /trailing byte/);
 });
+
+test("decodeSqliteJsonb: an object payload that ends after a key throws, instead of silently consuming the next sibling element", () => {
+  // REGRESSION (2026-08-12, external audit): the object branch of `decodeContainerPayload` decoded a
+  // value at `key.nextOffset` without first checking that offset was still inside the object's own
+  // `payloadEnd`. A blob whose object payload ends right after a key therefore read PAST the object
+  // and consumed the next element of the ENCLOSING array — corrupting the decoded structure silently
+  // rather than reporting the truncation.
+  //
+  // Hand-built bytes (header byte = (sizeNibble << 4) | elementType, per readHeader):
+  //   0x5b  ARRAY(0xb), payload 5 bytes
+  //   0x2c    OBJECT(0xc), payload 2 bytes  <- only large enough for the KEY, no value
+  //   0x17      TEXT(0x7), payload 1 byte
+  //   0x61        "a"                        <- object's key, and the payload ends HERE
+  //   0x17    TEXT(0x7), payload 1 byte      <- second ARRAY element, NOT the object's value
+  //   0x62      "b"
+  const truncatedObject = Buffer.from([0x5b, 0x2c, 0x17, 0x61, 0x17, 0x62]);
+
+  assert.throws(
+    () => decodeSqliteJsonb(truncatedObject),
+    /truncat|payload/i,
+    'a truncated object must be reported, not silently decoded as {"a":"b"} by stealing the array\'s next element'
+  );
+});
diff --git a/src/db/sqlite/jsonb-column.ts b/src/db/sqlite/jsonb-column.ts
index 1311099..1ea343a 100644
--- a/src/db/sqlite/jsonb-column.ts
+++ b/src/db/sqlite/jsonb-column.ts
@@ -60,9 +60,24 @@ import { customType } from "drizzle-orm/sqlite-core";
  * affinity. `pragma_table_info` happily reports the column type as "JSONB", masking the
  * problem — but NUMERIC affinity means SQLite will opportunistically cast an inserted value
  * that looks numeric. Probed directly: `CREATE TABLE t(x JSONB); INSERT INTO t VALUES ('123')`
- * stores `123` as an `INTEGER`, not the 3-byte text `'123'`, silently corrupting any document
- * that happens to be a bare JSON number. `dataType()` below MUST keep returning `"blob"` —
- * BLOB affinity performs no such coercion — never `"jsonb"`.
+ * stores `123` as an `INTEGER`, not the 3-byte text `'123'`.
+ *
+ * NARROWED 2026-08-12 (external audit finding, re-probed live against better-sqlite3 / SQLite
+ * 3.49.2 rather than reasoned about): that coercion does **not** reach anything THIS helper
+ * writes. `toDriver()` emits a `jsonb(...)` SQL fragment, and `jsonb(...)` returns a BLOB, which
+ * NUMERIC affinity does not cast. Measured, all three declared types:
+ *
+ *     jsonb('123')     -> JSONB-declared col -> typeof = blob      (not coerced)
+ *     jsonb('123')     -> BLOB-declared  col -> typeof = blob
+ *     '123' (raw text) -> JSONB-declared col -> typeof = integer   (COERCED — the real trap)
+ *     '123' (raw text) -> BLOB-declared  col -> typeof = text
+ *
+ * So the accurate claim is narrower than the one this comment used to make: the trap fires on
+ * RAW numeric-looking TEXT written into a JSONB-declared column, not on a JSONB document written
+ * through `sqliteJsonb`. `dataType()` below should still keep returning `"blob"` and never
+ * `"jsonb"` — it costs nothing and it is what protects an accidental raw-text write to the same
+ * column — but do not repeat the stronger "it would corrupt this helper's own documents" claim,
+ * because the measurement above says otherwise.
  *
  * Why `toDriver` returns a `sql` fragment instead of a plain value:
  * `customType`'s `toDriver` may return `T['driverData'] | SQL` (see
@@ -230,6 +245,15 @@ function decodeContainerPayload(elementType: number, buf: Buffer, payloadStart:
     if (typeof key.value !== "string") {
       throw new Error(`decodeSqliteJsonb: object key at offset ${cursor} decoded to a non-string (${typeof key.value})`);
     }
+    // The key must be followed by its value INSIDE this object's own payload. Without this check a
+    // payload ending right after a key reads on into the enclosing container and consumes the next
+    // sibling element as if it were this key's value — silent structural corruption rather than a
+    // reported truncation (2026-08-12 external audit; regression test in this file's __tests__).
+    if (key.nextOffset >= payloadEnd) {
+      throw new Error(
+        `decodeSqliteJsonb: object payload ends after key "${key.value}" at offset ${cursor} with no value element (truncated object)`
+      );
+    }
     const val = decodeElement(buf, key.nextOffset);
     obj[key.value] = val.value;
     cursor = val.nextOffset;

commit 697d97e8daf8be3dec7e51a9ad3dc9437f6c84bd
Author: Leona Burime <leonaburime@gmail.com>
Date:   Wed Aug 12 17:40:50 2026 -0700

    fix(db): replace the regex column scanner with an AST scan -- closes all 3 audit blind spots
    
    Three auditors independently found three DIFFERENT columns the line-oriented regex scanner
    was blind to. Each was confirmed by planting the column into schema.ts and watching the
    suite stay green at 53/53:
    
      - text('single_quoted')  -- the pattern hard-coded a double quote, AND the sanity count
                                  grepped `text("`, so the scan and its own guard went blind
                                  together
      - a reused bare column name on another table -- identity was the bare name, so a new
                                  plain-text `args` inherited `events.args`'s review exemption
      - lowercase "json" in a doc comment -- the mention regex was case-sensitive
    
    The three share one cause: a regex over source TEXT has no completeness property. Every fix
    closes one shape and the next shape is always inventable -- which is exactly why this file
    had already been patched once for wrapped builder chains. textColumnDeclarations() now walks
    the TypeScript AST (ts 5.9.3) and asks the compiler what a declaration IS, so quoting,
    whitespace, line breaks and chain layout stop being separate cases. Column identity is now
    the fully-qualified `table.column`, matching REVIEWED_JSON_COLUMNS's own key shape.
    
    The case-insensitive mention regex is the one the earlier round REJECTED as unsafe, now made
    safe rather than skipped: bare /i false-positives on template_choice, whose comment mentions
    the FILENAME theme.json ("." is a word boundary, so \bjson\b matches). Added a (?<!\.)
    lookbehind for that, keeping the existing JSON.stringify/parse exclusion. snake_case names
    like seo_ext_json need no exclusion -- "_" is a word char, so \bjson\b never matches inside
    one.
    
    The sanity test that compared the scan to a `text("` grep is replaced. It was doubly wrong:
    it hard-coded the quote (a single-quoted column moved BOTH sides of the equality and stayed
    invisible) and its stated purpose was already disproved. It now asserts the real risk
    directly and quote-agnostically -- no textually-visible column may be missing from the scan.
    
    Mutation-verified, all six shapes:
      CAUGHT  single-quoted + both signals
      CAUGHT  reused bare name on another table
      CAUGHT  lowercase json
      CAUGHT  wrapped builder chain
      CAUGHT  plain double-quoted same-line
      NOT caught (correct)  comment mentioning only the filename theme.json
    
    63/63 across both suites, typecheck exit 0.
    
    Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>

diff --git a/src/db/__tests__/migration-manifest.test.ts b/src/db/__tests__/migration-manifest.test.ts
index 9cd63cf..3418c47 100644
--- a/src/db/__tests__/migration-manifest.test.ts
+++ b/src/db/__tests__/migration-manifest.test.ts
@@ -12,6 +12,8 @@ import fs from "node:fs";
 import path from "node:path";
 import test from "node:test";
 
+import ts from "typescript";
+
 import { getTableConfig } from "drizzle-orm/sqlite-core";
 import { getTableConfig as getPgTableConfig } from "drizzle-orm/pg-core";
 
@@ -320,50 +322,96 @@ test("REVIEWED_JSON_COLUMNS matches exactly the five columns the 2026-08-12 roun
 // convention before it — this narrows the miss window, it does not close it.
 
 /**
- * Every `text(...)` core-schema column DECLARATION in schema.ts, paired with the doc comment (JSDoc
- * block or `//` line comment(s)) immediately preceding it and its full builder chain — the declaration
- * line plus any `.`-prefixed continuation lines folded in, so `declLine` carries a `.default(...)`
- * whether it sits on the declaration line or wraps below it.
+ * Every `text(...)` core-schema column DECLARATION in schema.ts, paired with its own leading doc
+ * comment, its FULL builder chain, and the SQL name of the table it belongs to.
+ *
+ * REWRITTEN 2026-08-12 as a TypeScript AST scan (external audit, Terra F1 / Gemini-Pro F1). The
+ * previous version was a line-oriented regex, and three auditors independently found three DIFFERENT
+ * columns it was blind to — each confirmed by planting the column into schema.ts and watching the
+ * suite stay green:
+ *
+ *   - `text('single_quoted')` — the pattern hard-coded a double quote, and the sanity count grepped
+ *     `text("`, so BOTH the scan and its own guard missed it simultaneously.
+ *   - a column reusing a reviewed BARE name on a different table — identity was the bare column name,
+ *     so `otherTable.args` inherited `events.args`'s review.
+ *   - a wrapped builder chain — fixed earlier by folding `.`-prefixed continuation lines, which is
+ *     exactly the kind of patch this rewrite makes unnecessary.
+ *
+ * The lesson those three share is that a regex over source TEXT has no completeness property: every
+ * fix closes one shape and the next shape is always inventable. An AST walk asks the compiler what a
+ * declaration IS, so quoting, whitespace, line breaks, and chain layout stop being separate cases.
  *
- * Line-based, not one sprawling regex trying to pair a comment block with "its" column in a single
- * pass — a block regex that drifts by one declaration would produce confident nonsense, which is
- * exactly the risk this function is built to avoid. schema.ts declares every real text() column as
- * `fieldName: text("sql_name")...,` entirely on one line (verified by the sanity test below), so
- * walking backward from a declaration's own line through CONTIGUOUS comment-shaped lines (`/**`, `*`,
- * `*\/`, `//`) cannot cross into a sibling column's code: a real declaration line never matches the
- * comment-line pattern, so the backward walk stops there deterministically — and a blank line (also
- * not comment-shaped) stops it too, so a multi-table section-header comment separated from the next
- * field by a blank line is never misattributed to that field either.
+ * Column identity is now `sqlTableName.sqlColumnName`, matching `REVIEWED_JSON_COLUMNS`'s own key
+ * shape exactly, so a reviewed name no longer leaks its exemption to a same-named column elsewhere.
  */
 function textColumnDeclarations(
   source: string = SCHEMA_SOURCE
-): Array<{ sqlColumnName: string; docComment: string; declLine: string }> {
-  const lines = source.split("\n");
-  const isCommentLine = (line: string) => /^\s*(\/\*\*|\*\/|\*|\/\/)/.test(line);
-  const declPattern = /^\s*\w+:\s*text\("([a-z0-9_]+)"\)(.*)$/;
-
-  const out: Array<{ sqlColumnName: string; docComment: string; declLine: string }> = [];
-  for (let i = 0; i < lines.length; i++) {
-    const m = declPattern.exec(lines[i]);
-    if (!m) continue;
-    const commentLines: string[] = [];
-    let j = i - 1;
-    while (j >= 0 && isCommentLine(lines[j])) {
-      commentLines.unshift(lines[j]);
-      j--;
+): Array<{ sqlTableName: string; sqlColumnName: string; qualifiedName: string; docComment: string; declLine: string }> {
+  const sf = ts.createSourceFile("schema.ts", source, ts.ScriptTarget.Latest, /* setParentNodes */ true);
+  const out: Array<{
+    sqlTableName: string;
+    sqlColumnName: string;
+    qualifiedName: string;
+    docComment: string;
+    declLine: string;
+  }> = [];
+
+  /** Unwrap a builder chain (`text("x").notNull().default("{}")`) down to its root `text(...)` call. */
+  const rootTextCall = (node: ts.Expression): ts.CallExpression | undefined => {
+    let cur: ts.Node = node;
+    for (;;) {
+      if (ts.isCallExpression(cur)) {
+        if (ts.isIdentifier(cur.expression) && cur.expression.text === "text") return cur;
+        cur = cur.expression;
+        continue;
+      }
+      if (ts.isPropertyAccessExpression(cur)) {
+        cur = cur.expression;
+        continue;
+      }
+      return undefined;
     }
-    // Walk FORWARD through chained continuation lines (`.notNull()`, `.default("{}")`, …) and fold them
-    // into declLine, so the tripwire's default-literal signal sees a wrapped chain exactly as it sees a
-    // single-line one. A continuation line starts with `.` after leading whitespace; a real declaration
-    // line never does (it starts `fieldName:`), so this cannot run on into the next column.
-    const chainLines: string[] = [lines[i]];
-    let k = i + 1;
-    while (k < lines.length && /^\s*\./.test(lines[k])) {
-      chainLines.push(lines[k].trim());
-      k++;
+  };
+
+  const literalText = (node: ts.Node | undefined): string | undefined =>
+    node && ts.isStringLiteralLike(node) ? node.text : undefined;
+
+  const visit = (node: ts.Node): void => {
+    // A table: `sqliteTable("sql_table_name", { columns… })`
+    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "sqliteTable") {
+      const sqlTableName = literalText(node.arguments[0]);
+      const columns = node.arguments[1];
+      if (sqlTableName !== undefined && columns !== undefined && ts.isObjectLiteralExpression(columns)) {
+        for (const prop of columns.properties) {
+          if (!ts.isPropertyAssignment(prop)) continue;
+          const call = rootTextCall(prop.initializer);
+          if (!call) continue;
+          const sqlColumnName = literalText(call.arguments[0]);
+          if (sqlColumnName === undefined) continue;
+
+          // The compiler's own notion of "the comment attached to this property" — no backward line
+          // walk, so a blank line, a section header, or a sibling's trailing comment cannot be
+          // misattributed here.
+          const docComment = (ts.getLeadingCommentRanges(source, prop.getFullStart()) ?? [])
+            .map((r) => source.slice(r.pos, r.end))
+            .join("\n");
+
+          out.push({
+            sqlTableName,
+            sqlColumnName,
+            qualifiedName: `${sqlTableName}.${sqlColumnName}`,
+            docComment,
+            // The whole initializer, however it is laid out — this is what replaces "fold the
+            // continuation lines back together and hope the shape was one we anticipated".
+            declLine: prop.initializer.getText(sf),
+          });
+        }
+      }
     }
-    out.push({ sqlColumnName: m[1], docComment: commentLines.join("\n"), declLine: chainLines.join("") });
-  }
+    ts.forEachChild(node, visit);
+  };
+
+  visit(sf);
   return out;
 }
 
@@ -375,41 +423,57 @@ test("textColumnDeclarations(): declLine carries a `.default(...)` wrapped onto
   // so a wrapped declaration still counts as one declaration and `declaredCount === rawTextCallSites - 1`
   // still holds. Both signals fire correctly on the two single-line shapes (also mutation-proven); this
   // is the third shape, and it was the one silent hole.
-  const wrapped = ['  someTable: {', '  /** JSON object of settings. */', '  probeConfig: text("probe_config")', '    .notNull()', '    .default("{}"),', "  }"].join("\n");
-  const [decl] = textColumnDeclarations(wrapped);
-  assert.equal(decl?.sqlColumnName, "probe_config");
-  assert.match(
-    decl.declLine,
-    /\.default\("\{\}"\)/,
-    "declLine must absorb chained continuation lines, otherwise the tripwire's JSON-literal-default signal " +
-      "silently goes blind on any column whose chain wraps"
-  );
-});
-
-test('sanity: exactly one text(" call site in schema.ts is not a scanner-recognized declaration head — this does NOT prove declarations are single-line', () => {
-  // schema.ts has 612 total `text("...")` call sites: 611 real single-line column declarations plus
-  // exactly one non-declaration mention (schema.ts's own `// SQLite JSON storage stays text("*_json")`
-  // convention comment at line ~1703).
+  const fixture = [
+    'export const probes = sqliteTable("probes", {',
+    "  /** JSON object of settings. */",
+    '  wrappedChain: text("wrapped_chain")',
+    "    .notNull()",
+    '    .default("{}"),',
+    "  /** JSON object of settings. */",
+    "  singleQuoted: text('single_quoted').notNull().default('{}'),",
+    "  /** json object, lowercase mention. */",
+    '  lowerCase: text("lower_case"),',
+    "  /** Reads from `theme.json`, a filename — NOT a JSON column. */",
+    '  filenameOnly: text("filename_only"),',
+    "});",
+  ].join("\n");
+  const decls = textColumnDeclarations(fixture);
+  const by = (n: string) => decls.find((d) => d.sqlColumnName === n);
+
+  assert.equal(decls.length, 4, "the AST scan must see all four columns regardless of quoting or layout");
+  assert.equal(by("wrapped_chain")?.qualifiedName, "probes.wrapped_chain", "identity must be table-qualified");
+  assert.match(by("wrapped_chain")?.declLine ?? "", /\.default\("\{\}"\)/, "a wrapped chain must carry its default");
+  assert.ok(by("single_quoted"), "a single-quoted SQL name must be found — the regex scanner was blind to this");
+  assert.match(by("single_quoted")?.declLine ?? "", /\.default\('\{\}'\)/, "single-quoted default must be carried too");
+  assert.match(by("lower_case")?.docComment ?? "", /json/, "the lowercase doc comment must be attached to its own column");
+  assert.match(by("filename_only")?.docComment ?? "", /theme\.json/, "the filename comment must attach to its own column");
+});
+
+test("sanity: the AST scan silently drops no text() column that is textually visible in schema.ts", () => {
+  // REPLACES a count-equality assertion that compared the scan against a `text("` grep. That check was
+  // doubly wrong: it hard-coded the double quote (so a single-quoted column moved BOTH sides of the
+  // equality and stayed invisible), and its stated purpose — proving declarations are single-line — was
+  // false anyway. The real risk with any scanner is SILENT UNDER-COUNTING, so assert that directly and
+  // quote-agnostically: every textually-visible `text("x")`/`text('x')` name must appear in the scan.
   //
-  // CORRECTED 2026-08-12: this comment used to claim that a column wrapping `.default(...)` onto its own
-  // continuation line would drop declaredCount below rawTextCallSites - 1 and fail HERE, before the
-  // tripwire could go blind on that default. That was false, and mutation-testing proved it: declPattern's
-  // trailing `(.*)` matches the empty string, so a wrapped declaration still counts as exactly one
-  // declaration and both sides of the equality move together. What this assertion actually catches is a
-  // `text("col", { … })` config-object form (raw goes up, declaredCount does not) and any new
-  // non-declaration `text("` mention. The wrapped-chain case is now handled for real by
-  // textColumnDeclarations() folding continuation lines into declLine — see its own regression test above.
-  const declaredCount = textColumnDeclarations().length;
-  const rawTextCallSites = (SCHEMA_SOURCE.match(/text\("/g) ?? []).length;
-  assert.ok(declaredCount > 500, `sanity: expected 500+ text() column declarations, got ${declaredCount}`);
-  assert.equal(
-    declaredCount,
-    rawTextCallSites - 1,
-    'expected exactly one text("...") call site that is not a scanner-recognized declaration head ' +
-      "(schema.ts's own convention comment). This catches a `text(\"col\", { … })` config-object form and " +
-      "any NEW non-declaration `text(\"` mention. It does NOT catch a wrapped builder chain — that still " +
-      "counts as one declaration head, and is handled by textColumnDeclarations() folding continuation " +
-      "lines instead"
+  // This cannot catch a column the grep ALSO cannot see, which is why it is a floor, not a proof. It is
+  // the AST walk itself — asking the compiler what a declaration is — that removes the shape-by-shape
+  // blind spots; this assertion only guards against the scan regressing behind plain text search.
+  const scanned = textColumnDeclarations();
+  const scannedNames = new Set(scanned.map((d) => d.sqlColumnName));
+  const textuallyVisible = [...SCHEMA_SOURCE.matchAll(/text\(\s*(["'])([a-z0-9_]+)\1\s*\)/g)].map((m) => m[2]);
+
+  assert.ok(scanned.length > 500, `sanity: expected 500+ text() column declarations, got ${scanned.length}`);
+  assert.deepEqual(
+    textuallyVisible.filter((name) => !scannedNames.has(name)),
+    [],
+    "every text() column name visible to a plain text search must also be seen by the AST scan — a name " +
+      "here means the scan is silently skipping a column (a table helper it does not recognize, a new " +
+      "declaration shape), which is the failure mode that makes the tripwire below quietly under-report"
+  );
+  assert.ok(
+    scanned.every((d) => d.sqlTableName.length > 0 && d.qualifiedName === `${d.sqlTableName}.${d.sqlColumnName}`),
+    "every scanned column must carry the table name its qualified identity depends on"
   );
 });
 
@@ -431,26 +495,34 @@ test("JSON-completeness tripwire (R4-F1/C-1): no text() column outside isJsonCol
   // plaintext JSON, and verifyJsonText would fail on every real row if this heuristic treated that
   // mention as a JSON signal. Flagging that column would be the heuristic being wrong, not the schema.
   //
-  // Column identity here is by bare SQL column name, not "table.column" — the same simplification
-  // REVIEWED_JSON_COLUMNS's own non-redundancy test above uses. Safe today because no bare column name
-  // in REVIEWED_JSON_COLUMNS ("ext", "auth_config_ids", "args", "allowed_tool_names", "env_names")
-  // repeats on any other table in schema.ts; a future column reusing one of those exact names on a
-  // different, actually-plain-text table would be silently exempted by this check, same as the
-  // existing non-redundancy test would silently misjudge it.
-  const reviewedByBareName = new Set(Object.keys(REVIEWED_JSON_COLUMNS).map((key) => key.split(".")[1]));
-  const jsonMentionInOwnComment = /\bJSON\b(?!\.(?:stringify|parse)\b)/;
-  const jsonLiteralDefault = /\.default\((["'])(\{\}|\[\])\1\)/;
+  // Column identity is the FULLY QUALIFIED "table.column", matching REVIEWED_JSON_COLUMNS's own key
+  // shape (external audit, Gemini-Pro F1). It used to be the bare column name, which meant a reviewed
+  // name leaked its exemption to every same-named column on every other table — proven by planting
+  // `text("args")` with both JSON signals onto an unrelated table and watching the suite stay green.
+  const reviewedQualified = new Set(Object.keys(REVIEWED_JSON_COLUMNS));
+
+  // Case-INSENSITIVE (external audit, Flash), but with the two exclusions that make that safe. Applying
+  // the bare `/i` alone was tested and REJECTED: it immediately false-positives on `template_choice`,
+  // whose comment mentions the FILENAME `theme.json` — "." is a word boundary, so `\bjson\b` matches
+  // there. A column storing "blog-post.html" would have failed the suite.
+  //   (?<!\.)  — not a filename extension (`theme.json`, `package.json`, `tokens.json`)
+  //   (?!\.(?:stringify|parse)\b) — not the JS API; several sealed-ciphertext columns document
+  //                                 encrypting the OUTPUT of JSON.stringify and store base64, not JSON.
+  // `seo_ext_json` and friends need no exclusion: `_` is a word character, so `\bjson\b` never matches
+  // inside a snake_case identifier in the first place.
+  const jsonMentionInOwnComment = /(?<!\.)\bjson\b(?!\.(?:stringify|parse)\b)/i;
+  const jsonLiteralDefault = /\.default\(\s*(["'])(\{\}|\[\])\1\s*\)/;
 
   const offenders: string[] = [];
-  for (const { sqlColumnName, docComment, declLine } of textColumnDeclarations()) {
-    if (isJsonColumnName(sqlColumnName) || reviewedByBareName.has(sqlColumnName)) continue;
+  for (const { sqlColumnName, qualifiedName, docComment, declLine } of textColumnDeclarations()) {
+    if (isJsonColumnName(sqlColumnName) || reviewedQualified.has(qualifiedName)) continue;
     const commentSignal = jsonMentionInOwnComment.test(docComment);
     const defaultSignal = jsonLiteralDefault.test(declLine);
     if (!commentSignal && !defaultSignal) continue;
     const reason = [commentSignal ? "doc comment mentions JSON" : null, defaultSignal ? 'defaults to a JSON literal ("{}" or "[]")' : null]
       .filter(Boolean)
       .join(" and ");
-    offenders.push(`${sqlColumnName} (${reason})`);
+    offenders.push(`${qualifiedName} (${reason})`);
   }
 
   assert.deepEqual(
```
