import { executeCommand, InMemoryChangeSetRepo } from "@jini-ai/cms/core/commands";
import { createRandomUuidGenerator, createSystemClock } from "@jini-ai/platform/system";

/**
 * The change-set collaborators `PagesToolDeps` requires for recording assistant HTML writes
 * (P1-T2.T), for narrow handler tests that exercise other behavior. The real gateway and an
 * in-memory change-set repo, never a stub that skips recording; spread it BEFORE a test's own
 * fields so a test's clock or repo still wins.
 */
export function pageHtmlChangeTestDeps(_optional = {}) {
  return { executeCommand, clock: createSystemClock(), idGen: createRandomUuidGenerator(), changeSets: new InMemoryChangeSetRepo() };
}
