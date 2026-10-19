import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { CURRENT_SRC, PARITY_DIALECTS, assertPostgresVaultPlanIndexed, countingKernel, explainPlan, loadParityModules, migratedParityFixture, parityDeps,
  type ParityModules, type RecordedStatement } from "./parity-harness.js";

/** Query parity, hot paths (DBMERGE-PLAN §2d `vault-hot-path`): statement counts and plans for the
 * vault reads that run per request or per turn. Pre-vault each of these was one indexed read of its
 * own table; the vault must not turn them into group scans or N+1 loops (queryimpact "hurt" #3/#4).
 * Counts come from a recording kernel; plans from `EXPLAIN` of the exact compiled statements.
 */
type Fixture = Awaited<ReturnType<typeof migratedParityFixture>>;
let mods: ParityModules;
before(async () => { mods = await loadParityModules(CURRENT_SRC); });

/** Every recorded read of `secrets_vault` must be an index search, never a table scan. */
async function assertIndexed(kernel: Fixture["kernel"], statements: RecordedStatement[], index?: string): Promise<void> {
  const reads = statements.filter(statement => statement.kind === "SelectQueryNode" && statement.sql.includes("secrets_vault"));
  assert.ok(reads.length > 0, "the path reads the vault");
  for (const statement of reads) {
    const plan = await explainPlan(kernel, statement);
    if (kernel.dialect === "sqlite") {
      assert.doesNotMatch(plan, /SCAN secrets_vault(?! USING)/, `${statement.sql}\n${plan}`);
      assert.match(plan, /secrets_vault USING (COVERING )?INDEX|USING INTEGER PRIMARY KEY|USING PRIMARY KEY/, `${statement.sql}\n${plan}`);
    } else {
      assertPostgresVaultPlanIndexed(plan, `${statement.sql}\n${plan}`);
    }
    if (index) assert.match(plan, new RegExp(index), `${statement.sql} uses ${index}\n${plan}`);
  }
}

for (const dialect of PARITY_DIALECTS) {
  describe(`vault hot paths [${dialect}]`, () => {
    let fixture: Fixture;
    let counting: ReturnType<typeof countingKernel<unknown>>;
    let d: ReturnType<typeof parityDeps>;
    before(async () => {
      fixture = await migratedParityFixture(dialect);
      counting = countingKernel(fixture.kernel);
      d = parityDeps(mods, { ...fixture, kernel: counting.kernel });
    });
    after(async () => { await fixture?.kernel.close(); });
    const measure = async (call: () => Promise<unknown>) => { counting.statements.length = 0; await call(); return [...counting.statements]; };

    test("site-assistant key on the public render path: one indexed read", async () => {
      const statements = await measure(() => mods.site.resolveSiteAssistantApiKey(d.site, { workspaceId: "ws" }));
      assert.equal(statements.length, 1, statements.map(s => s.sql).join("\n"));
      await assertIndexed(fixture.kernel, statements);
      assert.ok((await measure(() => mods.site.getSiteAssistantCredential(d.site, { workspaceId: "ws" }))).length <= 1);
    });

    test("personal execution key on every assistant turn: one indexed read", async () => {
      const statements = await measure(() => mods.exec.resolveExecutionCredential(d.exec, { workspaceId: "ws", principalId: "p" }));
      assert.equal(statements.length, 1, statements.map(s => s.sql).join("\n"));
      await assertIndexed(fixture.kernel, statements);
    });

    // The secrets_vault_default partial index is keyed on (principal_id IS NULL, coalesce(...)),
    // so the lookup restates the group in those expressions with a literal is_default (Jini
    // repo.sql.ts findDefault, 2026-10-12). Before, SQLite searched secrets_vault_scope and Postgres
    // secrets_vault_group_label without the provider, filtering every vendor row in the workspace.
    test("vendor group default repository lookup: one LIMIT 1 index read keyed on the exact group, no group scan", async () => {
      const statements = await measure(() => d.vendor.repo.findDefaultByVendor({ workspaceId: "ws", vendorId: "vendor-tie" }));
      assert.equal(statements.length, 1, statements.map(s => s.sql).join("\n"));
      assert.match(statements[0].sql, /limit/i);
      assert.equal(statements[0].parameters.at(-1), 1, "the lookup limits the result to one row");
      // Postgres/PGlite can cost secrets_vault_default and secrets_vault_group_label as a tie,
      // even after ANALYZE on a tiny fixture. Either is valid only when the index condition
      // includes the whole group, especially provider; a workspace-wide vendor scan is not.
      if (fixture.kernel.dialect === "sqlite") {
        await assertIndexed(fixture.kernel, statements, "secrets_vault_default");
      } else {
        const plan = await explainPlan(fixture.kernel, statements[0]);
        const queryPlan = JSON.parse(plan)[0]["QUERY PLAN"];
        const root = (typeof queryPlan === "string" ? JSON.parse(queryPlan) : queryPlan)[0].Plan;
        assert.equal(root["Node Type"], "Limit", plan);
        assert.equal(root.Plans.length, 1, plan);
        const read = root.Plans[0];
        assert.match(read["Node Type"], /^Index (Only )?Scan$/, plan);
        assert.match(read["Index Name"], /^secrets_vault_(default|group_label)$/, plan);
        const condition = read["Index Cond"];
        assert.match(condition, /workspace_id = 'ws'::text/, plan);
        assert.match(condition, /kind = 'vendor'::text/, plan);
        assert.match(condition, /owner_key = 'tovu'::text/, plan);
        assert.match(condition, /\(principal_id IS NULL\) = true/, plan);
        assert.match(condition, /COALESCE\(principal_id, ''::text\) = ''::text/, plan);
        assert.match(condition, /(?:COALESCE\(provider, ''::text\)|\bprovider) = 'vendor-tie'::text/, plan);
      }
    });

    // 1d96267e3 selects across compatibility lists, including old custom-kind rows. Keep the
    // repository's one-read guarantee above, and pin the runtime's bounded cross-kind inventory.
    test("publish compatibility selection: one inventory per kind and one selected row read", async () => {
      const statements = await measure(() => mods.publish.resolveDefaultForPublish(d.vendor, { workspaceId: "ws", providerId: "tie-host" }));
      assert.equal(statements.length, 3, statements.map(s => s.sql).join("\n"));
      assert.deepEqual(statements.map(s => s.parameters), [["ws", "vendor", "tovu"], ["ws", "custom", "tovu"], ["ws", "tie-b"]]);
      assert.ok(statements.every(s => s.kind === "SelectQueryNode"));
      await assertIndexed(fixture.kernel, statements);
    });

    test("MCP server list: statement count does not grow with the number of servers", async () => {
      const before = await measure(() => mods.mcp.listExternalMcpServerViews(d.mcp, "ws"));
      for (const serverId of ["extra-one", "extra-two"]) {
        await mods.mcp.saveExternalMcpServer(d.mcp, { workspaceId: "ws", serverId, label: serverId, transport: "stdio", authMode: "static_env",
          enabled: true, command: "mcp-extra", args: "", allowedToolNames: "", writeAllowedToolNames: "", env: "KEY=value" });
      }
      const grown = await measure(() => mods.mcp.listExternalMcpServerViews(d.mcp, "ws"));
      assert.equal(grown.length, before.length, `4 servers: ${before.length} statements, 6 servers: ${grown.length}`);
      // One raw LEFT JOIN onto secrets_vault by primary key (external-mcp-repo.ts `read`): no N+1.
      // Raw statements carry no SQL in the counting kernel, so there is no plan to check here.
      assert.deepEqual(grown.map(statement => statement.kind), ["Raw"]);
    });

    test("custom-credential list: one indexed read per stored kind", async () => {
      const statements = await measure(() => mods.custom.listCustomCredentials(d.custom, { workspaceId: "ws" }));
      assert.equal(statements.length, 2, statements.map(s => s.sql).join("\n"));
      assert.deepEqual(statements.map(s => s.parameters), [["ws", "vendor", "tovu"], ["ws", "custom", "tovu"]]);
      // 1d96267e3 adds the vendor inventory; 0012 (9b20083b6) gives group_label the same
      // workspace/kind/owner prefix as scope, with a partial predicate that includes vendor.
      await assertIndexed(fixture.kernel, statements, "secrets_vault_scope|secrets_vault_group_label|secrets_vault_label");
    });
  });
}
