import assert from "node:assert/strict";
import type { SourceControlWritePort } from "@jini-ai/core/contracts/credentials";

/**
 * A fake of {@link SourceControlWritePort} for fixtures whose subject never writes through a git host: every
 * method fails the test if it is called, so a stray write cannot pass silently.
 */
export function unusedSourceControlWrite(_required: Record<string, never> = {}, _optional: Record<string, never> = {}): SourceControlWritePort {
  const refused = (method: string): never => assert.fail(`this fixture must not call SourceControlWritePort.${method}`);
  return {
    build: () => refused("build"),
    validateTarget: () => refused("validateTarget"),
    planFileWrite: () => refused("planFileWrite"),
    commitFiles: () => refused("commitFiles"),
  };
}
