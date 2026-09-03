import assert from "node:assert/strict";
import test from "node:test";

import {
  ensureExecutionSettingDefinitions,
  type EnsureExecutionSettingDefinitionsDeps,
} from "../execution-mode-settings.js";

/**
 * @file The `core.execution` definition list, exercised through its real registrar.
 *
 * `ensureSettingDefinitions` is already an injected dependency (see the module's own doc for why it
 * is injected rather than imported), so the list this registrar submits can be captured directly —
 * no database, no boot.
 *
 * What these pin is the pairing: every field the admin's ledger writer sends
 * (`apps/admin/src/lib/execution-settings.ts`'s `KEYS`) must have a registered definition here, or
 * `api.setSetting` rejects the write against a namespace that has no such key. `localCli.reasoning`
 * is the one that was missing — the effort control could render and accept a click with nowhere for
 * the value to land.
 */

function captureDefinitions(): {
  deps: EnsureExecutionSettingDefinitionsDeps;
  submitted: () => ReadonlyArray<{ key: string; defaultValue?: unknown; schema?: unknown }>;
} {
  let captured: ReadonlyArray<{ key: string; defaultValue?: unknown; schema?: unknown }> = [];
  const deps = {
    ensureSettingDefinitions: async (
      _deps: unknown,
      input: { definitions: ReadonlyArray<{ key: string; defaultValue?: unknown; schema?: unknown }> },
    ) => {
      captured = input.definitions;
    },
  } as unknown as EnsureExecutionSettingDefinitionsDeps;
  return { deps, submitted: () => captured };
}

test("ensureExecutionSettingDefinitions registers localCli.reasoning, so the effort pick has somewhere to land", async () => {
  const { deps, submitted } = captureDefinitions();
  await ensureExecutionSettingDefinitions(deps, { systemPrincipalId: "system-principal" as never });

  const reasoning = submitted().find((definition) => definition.key === "localCli.reasoning");
  assert.ok(reasoning, "localCli.reasoning must be a registered definition");
  // Mirrors `localCli.model` exactly: a plain string whose registered default is "" (ADR-028
  // totality forbids a null default), which is also the "no explicit effort" value.
  assert.deepEqual(reasoning.schema, { type: "string" });
  assert.equal(reasoning.defaultValue, "");
});

test("ensureExecutionSettingDefinitions registers localCli.reasoning with the same shape as localCli.model", async () => {
  const { deps, submitted } = captureDefinitions();
  await ensureExecutionSettingDefinitions(deps, { systemPrincipalId: "system-principal" as never });

  const model = submitted().find((definition) => definition.key === "localCli.model");
  const reasoning = submitted().find((definition) => definition.key === "localCli.reasoning");
  assert.ok(model);
  assert.ok(reasoning);
  assert.deepEqual(reasoning.schema, model.schema);
  assert.equal(reasoning.defaultValue, model.defaultValue);
});

test("ensureExecutionSettingDefinitions registers every localCli key the admin ledger writer sends", async () => {
  const { deps, submitted } = captureDefinitions();
  await ensureExecutionSettingDefinitions(deps, { systemPrincipalId: "system-principal" as never });

  const keys = new Set(submitted().map((definition) => definition.key));
  for (const key of ["localCli.agentId", "localCli.model", "localCli.reasoning"]) {
    assert.ok(keys.has(key), `missing registered definition for ${key}`);
  }
});
