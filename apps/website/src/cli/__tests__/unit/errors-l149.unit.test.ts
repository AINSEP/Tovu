import assert from "node:assert/strict";
import test from "node:test";
import { CommanderError } from "commander";
import { PluginInstallError } from "@jini-ai/plugins/host/node";
import { mapErrorToCliOutcome, PortInUseError, ExportIncompleteError, ExportBlockedPendingRecoveryError } from "../../errors.js";
import { ValidationError, InitDirNotEmptyError, SiteDirInvalidError, SiteNewerThanRuntimeError, SiteCorruptError, SiteRepairRefusedError, InternalError } from "../../../platform/site-dir/index.js";
import { ExportOutputNotEmptyError } from "../../../features/site-export/index.js";

for (const code of ["commander.helpDisplayed", "commander.help", "commander.version"]) {
  test(`commander success ${code} omits diagnostics`, () => {
    assert.deepEqual(mapErrorToCliOutcome(new CommanderError(9, code, "error: ignored")), { exitCode: 0 });
  });
}
for (const code of ["commander.missingArgument", "commander.invalidArgument", "commander.excessArguments", "commander.unknownOption", "commander.unknownCommand", "commander.missingMandatoryOptionValue", "commander.optionMissingArgument", "commander.futureCode"]) {
  test(`commander ${code} preserves usage property presence`, () => {
    const expected = { exitCode: 2, stderrLine: "tovu: VALIDATION: bad input" };
    assert.deepEqual(mapErrorToCliOutcome(new CommanderError(9, code, "error:  bad input")),
      code === "commander.futureCode" ? expected : { ...expected, printUsage: code === "commander.unknownCommand" });
  });
}
for (const [error, code, exitCode] of [
  [new PluginInstallError("PLUGIN_REFUSED", "detail"), "PLUGIN_REFUSED", 2],
  [new ValidationError("detail"), "VALIDATION", 2], [new InitDirNotEmptyError("detail"), "INIT_DIR_NOT_EMPTY", 3],
  [new SiteDirInvalidError("detail"), "SITE_DIR_INVALID", 3], [new SiteNewerThanRuntimeError("detail"), "SITE_NEWER_THAN_RUNTIME", 4],
  [new SiteCorruptError("detail"), "SITE_CORRUPT", 5], [new PortInUseError("detail", 3000), "PORT_IN_USE", 1],
  [new ExportOutputNotEmptyError("detail"), "EXPORT_OUTPUT_NOT_EMPTY", 3],
  [new ExportIncompleteError("detail"), "EXPORT_INCOMPLETE", 6], [new ExportBlockedPendingRecoveryError("detail"), "EXPORT_BLOCKED_PENDING_RECOVERY", 7],
  [new InternalError("detail"), "INTERNAL", 1], [new Error("detail"), "INTERNAL", 1], ["detail", "INTERNAL", 1],
] as const) {
  test(`maps ${code}/${String(error)} by class`, () => {
    assert.deepEqual(mapErrorToCliOutcome(error), { exitCode, stderrLine: `tovu: ${code}: detail` });
  });
}
for (const reason of ["NOT_A_DIRECTORY", "MARKER_ALREADY_EXISTS", "CONTENT_DB_MISSING", "CONTENT_DB_UNMIGRATED", "CONTENT_DB_DIVERGED"] as const) {
  test(`repair refusal ${reason} uses its typed reason`, () => {
    const diverged = reason === "CONTENT_DB_DIVERGED";
    assert.deepEqual(mapErrorToCliOutcome(new SiteRepairRefusedError("detail", reason)), {
      exitCode: diverged ? 4 : 3, stderrLine: `tovu: ${diverged ? "SITE_NEWER_THAN_RUNTIME" : "SITE_DIR_INVALID"}: detail`,
    });
  });
}
test("an error name cannot impersonate a domain class", () => {
  const error = new Error("foreign");
  error.name = "ValidationError";
  assert.deepEqual(mapErrorToCliOutcome(error), { exitCode: 1, stderrLine: "tovu: INTERNAL: foreign" });
});
