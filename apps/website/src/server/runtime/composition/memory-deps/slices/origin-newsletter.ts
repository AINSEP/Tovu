import { InMemoryNewsletterListRepo } from "#src/features/newsletter/repo.memory";
import { OriginRegistry, InMemoryOriginSettingRepo, createVerifiedOrigin } from "@jini-ai/core/contracts/server/verified-origin";
import { seededWorkspace } from "../../../configuration/seed.js";
import type { MemoryClock } from "../ports.js";

export function composeOriginNewsletter(required: { clock: MemoryClock }, _optional = {}) {
  const { clock } = required;
  // SPEC-011 (Newsletter) — declared here (not inline in the return object) so `newsletterReady`
  // below can seed the default list against the SAME repo instance the returned deps expose.
  const newsletterListRepoInMemory = new InMemoryNewsletterListRepo();

  // SPEC-009 (Redirects, ADR-PIPE-009) — FIRST-TIME composition-root wiring of `origin`'s
  // OriginRegistry and `routing`'s registration functions (Context item 4: neither library had a
  // real consumer before this feature). Seeds a `dev-capability` verified origin for the single
  // seeded workspace, mirroring every other dev-mode fixture in this file (e.g. `seededWorkspace`).
  const originRegistry = new OriginRegistry({
    repo: new InMemoryOriginSettingRepo({ seeds: [
      {
        workspaceId: seededWorkspace.id,
        origin: createVerifiedOrigin({
          scheme: "http",
          host: "localhost",
          port: 3000,
          verifiedAt: clock.nowIso(),
          source: "dev-capability",
        }),
        // ADR-PIPE-015 T016: a dev-capability egress allowlist entry so the real
        // isAllowedEgressTarget oracle doesn't fail-closed on every fresh dev server — matches the
        // `example.com` target every integrations fixture/test in this repo already uses.
        egressAllowlist: ["example.com"],
      },
    ] }),
  });
  return { originRegistry, newsletterListRepoInMemory };
}
