I’ll audit the listed Jini and Tovu commits against the frozen threat model, focusing on the generator/parity guards, migration journaling, and instance authorization.

I’ve confirmed the column reconciliation’s file-backed DDL path takes its snapshot before journal/transaction work. I’m now checking generated-schema parity beyond the supplied count tests and the package’s published consumer surface.

{
  "threat_model_accepted": true,
  "rejection_reason": null,
  "auditor_scope_check": "Auditor Scope Check — Audited the work-log surfaces in Tovu and Jini: the PostgreSQL generator/artifact/parity tests, plugin data-module migration and recovery flow, gated-mutation composition, Tovu’s infra adapter, and Jini infra exports/driver-isolation tests. I read the relevant source and test files, plus the installed Drizzle table/SQL implementation to verify extra-config and CHECK chunk behavior. Scope mismatch: sandbox restrictions prevented rerunning tsx tests or provisioning PostgreSQL, so this audit makes no claim of live PostgreSQL execution.",
  "findings": [
    {
      "id": "F1",
      "title": "Existing-column NOT NULL and PRIMARY KEY drift is silently accepted",
      "domain": "D2",
      "severity": "high",
      "blocking": true,
      "checked": "A v2 declaration changing constraints of an already-existing, same-typed column.",
      "expected": "Constraint changes SQLite cannot safely ALTER must fail closed with distinct error codes before the no-op result, per mandatory invariant 1.",
      "observed": "The live `notNull` and `primaryKey` values are read at /Users/la/Programming/Tovu/src/features/plugins/data-module.ts:323-330, but reconciliation checks only `type` at :367-375. It then returns no alterations at :383-394, allowing the successful no-op path at :523-525.",
      "why_it_matters": "A plugin can declare a stricter column constraint, receive `{ ok: true }`, and run against a database that still permits the prohibited state.",
      "recommended_fix": "Compare live NOT NULL and PK flags with the declaration during planning; reject mismatches with separate `COLUMN_NOT_NULL_MISMATCH` and `COLUMN_PRIMARY_KEY_MISMATCH` codes, and add v1→v2 regression tests for both.",
      "confidence": "high",
      "file": "/Users/la/Programming/Tovu/src/features/plugins/data-module.ts:367",
      "patch": "diff --git a/src/features/plugins/data-module.ts b/src/features/plugins/data-module.ts\n@@\n function assertColumnTypeMatches(tableName: string, col: ColumnDecl, existingCol: ExistingColumnInfo): void {\n   if (existingCol.type === col.type) return;\n   throw new DeclError(\n@@\n   );\n }\n+\n+function assertColumnConstraintsMatch(tableName: string, col: ColumnDecl, existingCol: ExistingColumnInfo): void {\n+  if (existingCol.notNull !== Boolean(col.notNull)) {\n+    throw new DeclError(\n+      \"COLUMN_NOT_NULL_MISMATCH\",\n+      `table ${tableName} column \"${col.name}\" has incompatible NOT NULL state; changing it requires a table rebuild.`\n+    );\n+  }\n+  if (existingCol.primaryKey !== Boolean(col.primaryKey)) {\n+    throw new DeclError(\n+      \"COLUMN_PRIMARY_KEY_MISMATCH\",\n+      `table ${tableName} column \"${col.name}\" has incompatible PRIMARY KEY state; changing it requires a table rebuild.`\n+    );\n+  }\n+}\n@@\n     }\n     assertColumnTypeMatches(table.name, col, existingCol);\n+    assertColumnConstraintsMatch(table.name, col, existingCol);\n   }\n"
    },
    {
      "id": "F2",
      "title": "Post-transaction migration failures are marked rolled back without being rolled back",
      "domain": "D2",
      "severity": "high",
      "blocking": true,
      "checked": "Errors after the DDL transaction commits, including verification and journal-phase failures.",
      "expected": "Once DDL has committed, a subsequent failure must leave the journal non-terminal so boot recovery restores the snapshot.",
      "observed": "The transaction commits at /Users/la/Programming/Tovu/src/features/plugins/data-module.ts:553-578; later verification and COMMITTED-phase work remain inside the same `try` at :579-591. Any error reaches the catch and marks the journal `ROLLED_BACK` at :592-610. Recovery only restores non-terminal entries at /Users/la/Programming/Tovu/src/features/plugins/migration-recovery.ts:8-10 and :45-49.",
      "why_it_matters": "The caller can receive `DDL_FAILED` while committed DDL remains live; a retry can subsequently report a no-op success, leaving the failure result and database state divergent.",
      "recommended_fix": "Track whether the transaction committed. Only mark `ROLLED_BACK` for pre-commit failures; for post-commit failures retain the snapshot and non-terminal journal entry for next-boot recovery. Add fault-injection tests for VERIFYING and COMMITTED phase failures.",
      "confidence": "high",
      "file": "/Users/la/Programming/Tovu/src/features/plugins/data-module.ts:578",
      "patch": "diff --git a/src/features/plugins/data-module.ts b/src/features/plugins/data-module.ts\n@@\n   const journalId = openJournalIfFileBacked(db, decl.pluginId, snapshotPath);\n \n   const created: string[] = [];\n   const altered: string[] = [];\n+  let ddlCommitted = false;\n   try {\n@@\n     db.transaction(() => {\n@@\n     })();\n+    ddlCommitted = true;\n     advancePhaseIfJournaled(db, journalId, \"VERIFYING\");\n@@\n   } catch (err) {\n-    advancePhaseIfJournaled(db, journalId, \"ROLLED_BACK\");\n+    // A post-commit failure must remain recoverable at next boot. Marking it terminal\n+    // would leave committed DDL live while returning DDL_FAILED to the caller.\n+    if (!ddlCommitted) {\n+      advancePhaseIfJournaled(db, journalId, \"ROLLED_BACK\");\n+    }\n     const e = err as Error;\n"
    },
    {
      "id": "F3",
      "title": "Non-no-op in-memory declarations bypass the mandatory snapshot gate",
      "domain": "D6",
      "severity": "high",
      "blocking": true,
      "checked": "Whether every declaration entering DDL receives a snapshot before DDL.",
      "expected": "Only a fully reconciled no-op may skip the snapshot-before-DDL gate.",
      "observed": "`snapshotDb()` returns `null` for in-memory paths at /Users/la/Programming/Tovu/src/features/plugins/snapshot.ts:56-67. `declareDataModule()` then skips the journal when the path is null at /Users/la/Programming/Tovu/src/features/plugins/data-module.ts:535-545 and executes DDL at :553-578; the regression test explicitly accepts this at :271-287.",
      "why_it_matters": "This is an explicit non-no-op migration path around the frozen snapshot gate, so the gate can report a successful migration without the required pre-DDL protection.",
      "recommended_fix": "Reject non-file-backed database paths when the reconciliation plan contains DDL, using a distinct fail-closed error such as `NON_FILE_BACKED_MIGRATION_UNSUPPORTED`; retain the no-op path.",
      "confidence": "high",
      "file": "/Users/la/Programming/Tovu/src/features/plugins/data-module.ts:535",
      "patch": "diff --git a/src/features/plugins/data-module.ts b/src/features/plugins/data-module.ts\n@@\n-import { discardCommittedSnapshot, snapshotDb } from \"./snapshot\";\n+import { discardCommittedSnapshot, isInMemoryDbPath, snapshotDb } from \"./snapshot\";\n@@\n   if (plan.toCreate.length + plan.toAlter.length === 0) {\n     return { ok: true, created: [], altered: [], snapshotPath: null }; // idempotent no-op — nothing to snapshot\n   }\n+\n+  if (isInMemoryDbPath(dbPath)) {\n+    return {\n+      ok: false,\n+      created: [],\n+      altered: [],\n+      snapshotPath: null,\n+      error: {\n+        code: \"NON_FILE_BACKED_MIGRATION_UNSUPPORTED\",\n+        message: \"dataModule migrations require a file-backed database so snapshot-before-DDL recovery is available\",\n+      },\n+    };\n+  }\n \n   const preflight = runPreflightChecks(db, dbPath, decl);\n"
    },
    {
      "id": "F4",
      "title": "Published infra README documents a removed export",
      "domain": "D4",
      "severity": "medium",
      "blocking": true,
      "checked": "The documented `@jini-ai/infra/db/sqlite` consumer import against the exported surface.",
      "expected": "A README example for the published package resolves and typechecks.",
      "observed": "The README imports `openSqliteDb` at /Users/la/Programming/Jini/packages/infra/README.md:9, while the actual sqlite entry exports `openSqliteConnection` at /Users/la/Programming/Jini/packages/infra/src/db/sqlite/index.ts:17. The README also still describes Drizzle as a peer at README.md:17 although the manifest lists only `better-sqlite3` at package.json:71-82.",
      "why_it_matters": "A legitimate consumer following the package documentation gets a missing named export at runtime and a typecheck error.",
      "recommended_fix": "Update the README examples and dependency description to the ORM-free public surface; add a documentation snippet typecheck or execution test.",
      "confidence": "high",
      "file": "/Users/la/Programming/Jini/packages/infra/README.md:9",
      "patch": "diff --git a/packages/infra/README.md b/packages/infra/README.md\n@@\n-import { openSqliteDb, SqliteDbOpsAdapter } from '@jini-ai/infra/db/sqlite';\n+import { openSqliteConnection, SqliteDbOpsAdapter } from '@jini-ai/infra/db/sqlite';\n@@\n-- **Drivers are optional peer dependencies.** `better-sqlite3` and `drizzle-orm` are declared in\n--  `peerDependenciesMeta` as optional, so `npm install @jini-ai/infra` on its own pulls no native\n+- **Drivers are optional peer dependencies.** `better-sqlite3` is declared in\n+-  `peerDependenciesMeta` as optional, so `npm install @jini-ai/infra` on its own pulls no native\n@@\n-`openSqliteDb` applies `journal_mode = WAL`, `foreign_keys = ON`, and `busy_timeout = 5000` unless\n+`openSqliteConnection` applies `journal_mode = WAL`, `foreign_keys = ON`, and `busy_timeout = 5000` unless\n"
    }
  ],
  "out_of_scope_fatal_warnings": [],
  "score": 5.5,
  "score_rationale": "Four validated blockers include two silent migration-state divergences, a mandatory gate bypass, and a documented package import that cannot resolve.",
  "top_issues_reducing_score": [
    "F1: existing-column constraint drift silently reports success.",
    "F2: post-commit errors can return failure while retaining DDL.",
    "F3: in-memory DDL bypasses snapshot-before-DDL.",
    "F4: documented infra import is invalid."
  ],
  "path_to_10": [
    "Run an import-and-DDL integration test for `src/db/schema.postgres.ts` against disposable PostgreSQL; typechecking does not prove emitted PostgreSQL is executable.",
    "Upgrade PostgreSQL parity from token counts (`schema-postgres-parity.test.ts:49-88`) to generated-schema introspection comparing FK columns/actions and CHECK names/SQL semantics.",
    "Add a CJS no-driver fixture alongside the existing ESM driver-isolation fixture at `packages/infra/src/db/core/__tests__/loads-without-driver.test.ts:56-104`."
  ],
  "blocking_gate": "FAIL"
}