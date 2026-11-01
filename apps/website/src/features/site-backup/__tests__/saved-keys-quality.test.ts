/** The dispatch caps new transport functions at complexity 10; use the installed parser/rule. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Linter } from "eslint";
import tseslint from "typescript-eslint";

test("saved-key transport functions stay within the approved complexity budget", { timeout: 10000 }, () => {
  const root = fileURLToPath(new URL("../../../../../..", import.meta.url));
  const sources = [
    "apps/website/src/features/site-backup/saved-keys.ts",
    "apps/admin/src/features/sites/hooks/use-site-transfer.hooks.ts",
    "apps/admin/src/features/sites/hooks/site-transfer-dependencies.hooks.ts",
    "apps/website/src/features/site-backup/import-restore.ts",
    "apps/website/src/server/inbound/admin-http/routes/system/site-shares.ts",
    "apps/website/src/features/api-connections/vault-stores.ts",
    "apps/website/src/server/runtime/composition/site-portability.ts",
    "apps/website/src/server/inbound/admin-http/routes/system/site-share-password.ts",
  ];
  const linter = new Linter();
  for (const source of sources) {
    const file = path.resolve(root, source);
    const messages = linter.verify(fs.readFileSync(file, "utf8"), [{ files: ["**/*.ts"], languageOptions: { parser: tseslint.parser }, rules: { complexity: ["error", 10] } }], { filename: path.basename(file) });
    assert.deepEqual(messages, [], source);
  }
});
