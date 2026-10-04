import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { DeployError } from "@jini-ai/devops/deploy";
import type { LoadedDeployTarget } from "../../deploy-targets/types.js";
import { publishStaticSite } from "../adapter.js";

for (const errorKind of ["Error", "DeployError"] as const) {
  test(`provider ${errorKind} messages redact the resolved token before crossing the publish boundary`, async (t) => {
    const root = mkdtempSync(path.join(tmpdir(), "tovu-provider-error-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const token = "private-provider-token-73";
    let publishCalls = 0;
    const target: LoadedDeployTarget = {
      pluginId: "deploy", descriptor: { id: "acme", label: "Acme", module: "targets/acme.mjs", configFields: [] },
      module: {
        create({ credential }) {
          assert.equal(credential.token, token);
          return {
            id: "acme",
            async publish() {
              publishCalls += 1;
              const message = `provider refused Bearer ${credential.token}; retry ${credential.token}`;
              if (errorKind === "DeployError") throw new DeployError({ message }, { status: 401, details: { raw: credential.token } });
              throw new Error(message);
            },
            async checkReachability() { assert.fail("a rejected publish must not check reachability"); },
          };
        },
      },
    };
    const outcome = await publishStaticSite({
      credentialSource: {
        async resolve() { return { ok: true, token }; },
        async isConfigured() { assert.fail("publish must resolve the credential directly"); },
      },
      loadDeployTargets: async () => ({ get: (id) => id === "acme" ? target : undefined, list: () => [target], refusals: [] }),
    }, {
      workspaceId: "ws-provider", publishOutputRootDir: root, idGen: { newId: () => "run-1" },
      config: { target: "acme" }, projectName: "Provider error regression",
      exportSiteBound: async () => ({
        outputDir: root, basePath: "/", startedAt: "2026-10-03T00:00:00.000Z", finishedAt: "2026-10-03T00:00:00.000Z",
        routes: { succeeded: [{ path: "/", kind: "page", outputFile: "index.html", data: "<p>Site</p>", contentType: "text/html" }], failed: [] },
        assets: { succeeded: [], failed: [] }, skippedManifestEntries: [], unreferencedThemeFiles: [],
      }),
    });
    // F6.3: exact public response, including all occurrences and no raw provider details.
    assert.equal(publishCalls, 1);
    assert.deepEqual(outcome, { ok: false, code: "PROVIDER_ERROR", message: "provider refused Bearer [REDACTED]; retry [REDACTED]" });
    assert.equal(JSON.stringify(outcome).includes(token), false);
  });
}
