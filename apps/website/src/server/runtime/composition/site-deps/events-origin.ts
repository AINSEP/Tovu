import { InMemoryEventBus } from "#src/contracts/core/events/index";
import { OriginRegistry } from "@jini-ai/core/contracts/server/verified-origin";
import { RedirectHitSinkImpl } from "@jini-ai/cms/redirects";
import { SqliteAssetRenditionRepo } from "#src/platform/db/sqlite/media-repo.sqlite";
import { SqliteOriginSettingRepo } from "#src/platform/db/sqlite/origin-repo.sqlite";
import { SqliteOutboxAdapter } from "#src/platform/db/sqlite/outbox-repo.sqlite";
import { SqliteRedirectRepo } from "#src/features/redirects/repo.sqlite";
import { createVerifiedOrigin } from "@jini-ai/core/contracts/server/verified-origin";
import { deriveDevScheme } from "../../../../platform/dev-host/dev-tls.js";
import { planOriginBoot } from "#src/features/origin/index";
import { readSiteListenerOrigin } from "../../boot/site-listener-origin.js";
import { registerConfiguredOrigin } from "#src/platform/db/sqlite/origin-repo.sqlite";
import { resolveCheckoutRoot } from "#src/platform/site-dir/index";
import { resolveDevTls } from "../../../../platform/dev-host/dev-tls.js";
import { resolveDevTlsCertPaths } from "../../../../platform/dev-host/dev-tls.js";
import { seedDevCapabilityOrigin } from "#src/platform/db/sqlite/origin-repo.sqlite";
import type { SiteStore } from "../open-site-store.js";

interface ComposeEventsOriginRequired {
  kernel: SiteStore["content"];
  clock: { nowMs: () => number; nowIso: () => string };
  workspaceId: string;
}

export function composeEventsOrigin(required: ComposeEventsOriginRequired, _optional = {}) {
  const { kernel, clock, workspaceId } = required;

  // SPEC-009 (Redirects, ADR-PIPE-009) — FIRST-TIME composition-root wiring of `origin`'s
  // OriginRegistry and `routing`'s registration functions, mirroring `apps/website/src/server/runtime/composition/app.ts`'s identical
  // wiring. `redirects` DOES get its real `SqliteRedirectRepo` here (unlike the in-memory-only
  // libraries above), since T014 built a full rule-of-two adapter for it.
  // ADR-046 Phase 1 (BR-04 resolution, 2026-07-16 swarm debate): durable SQLite outbox. Events
  // survive a restart; `SqliteChangeSetRepo.insert()`'s co-persisted event and this adapter's
  // `claimPending()`/`markDelivered()`/`markFailed()` share the same `outbox_events` table.
  const outbox = new SqliteOutboxAdapter({ store: kernel });
  const bus = new InMemoryEventBus();
  // ADR-046 Phase 1 (2026-07-16): durable SQLite origin-settings adapter.
  //
  // 2026-09-18 — `planOriginBoot` (`features/origin/configured-origin.ts`) now decides what this
  // boot writes, instead of an unconditional dev seed. Design note:
  // `ADS-memory/reports/2026-09-18-public-origin-registration-design.md`.
  //   - `TOVU_PUBLIC_URL` names a real public https origin -> register it, correcting an existing
  //     dev-capability row in place. This is what finally lets production's sitemap.xml emit
  //     absolute URLs, and what heals the `http://localhost:3000` row the first production boot persisted.
  //   - nothing configured, local mode -> the dev seed below, byte-for-byte unchanged.
  //   - nothing configured, production mode -> write NOTHING. ADR-040 §2 fails closed on an absent
  //     origin; the unconditional seed is what poisoned prod in the first place, and its
  //     find-or-create contract made that row immortal.
  //
  // `devCapabilityScheme` is DERIVED, not the `"https"` literal this used to hardcode (2026-09-05
  // audit finding, Chunk D finding 3): the dev API server only terminates TLS when `resolveDevTls`
  // (`platform/dev-host/dev-tls.ts`) says so, same as `index.ts`'s own real boot path computes —
  // this composition root calls it independently rather than threading `index.ts`'s result through,
  // mirroring how `isAdminAssistantEnabled()` above is also called directly here rather than passed
  // in. Two real, disclosed cases fall to plain HTTP: a fresh clone with no `.certs/`, and
  // `TOVU_DISABLE_DEV_TLS`, which every hermetic Playwright `webServer` under
  // `development/*.config.ts` sets. A hardcoded `https` in either case silently shipped broken
  // `https://` links (redirects' canonicalOrigin, newsletter confirmation/unsubscribe, site
  // evidence) for a server that only ever answers on `http://`. `REPO_ROOT` is a walk-up
  // (`resolveCheckoutRoot`), not a fixed `../` count: the compiled tree is two levels shallower than
  // the tsx source tree, so a count only ever matched one of them.
  // NOTE: `devCapabilityScheme` stays at this scope, NOT inside the dev-seed branch below — the
  // `derivedPublicOrigin` field near the end of this function is a second consumer (see its own
  // comment). Narrowing it to the branch compiles nowhere and was caught by `tsc`.
  const REPO_ROOT = resolveCheckoutRoot({});
  const devCapabilityScheme = deriveDevScheme({ tlsActive: resolveDevTls(resolveDevTlsCertPaths({ repoRoot: REPO_ROOT })).active });
  const originBoot = planOriginBoot({ now: clock.nowIso() });
  const originReady = registerBootOrigin({ originBoot, kernel, workspaceId, devCapabilityScheme, clock }, {});

  const originRegistry = new OriginRegistry({ repo: new SqliteOriginSettingRepo({ store: kernel }, { after: originReady }) });
  const redirectRepo = SqliteRedirectRepo({ store: kernel }, {});
  const redirectHitSink = new RedirectHitSinkImpl();
  // ---------------------------------------------------------------------------
  // Local admin Trash (design: ADS-memory/reports/2026-09-20-trash-delete-architecture.md)
  // ---------------------------------------------------------------------------
  // A plain Map, built here and resolved on every call. NOT a module-level registry: this
  // codebase's registries (`ToolRegistry`, routing's `phaseRegistry`) are append-only with no
  // unregister, so anything that filters at registration time runs exactly once — two real bugs
  // already came from that. Adding a phase-2 domain means one more `set()` here and no migration.
  const assetRenditionRepo = new SqliteAssetRenditionRepo({ store: kernel });
  return { outbox, bus, devCapabilityScheme, originReady, originRegistry, redirectRepo, redirectHitSink, assetRenditionRepo };
}

function registerBootOrigin({ originBoot, kernel, workspaceId, devCapabilityScheme, clock }: { originBoot: ReturnType<typeof planOriginBoot>; kernel: SiteStore["content"]; workspaceId: string; devCapabilityScheme: ReturnType<typeof deriveDevScheme>; clock: { nowMs: () => number; nowIso: () => string } }, _options = {}): Promise<unknown> {
  // The boot write is async (storage kernel); the origin repo's reads wait for it (`after`).
  if (originBoot.kind === "configured") {
    return registerConfiguredOrigin({ db: kernel, workspaceId: workspaceId, origin: originBoot.origin });
  }
  if (originBoot.kind === "dev-seed") {
    const listenerOrigin = readSiteListenerOrigin({ fallbackScheme: devCapabilityScheme });
    return seedDevCapabilityOrigin({
      db: kernel,
      seed: {
        workspaceId: workspaceId,
        origin: createVerifiedOrigin({
          scheme: listenerOrigin.protocol === "https:" ? "https" : "http",
          host: "localhost",
          port: Number(listenerOrigin.port || (listenerOrigin.protocol === "https:" ? 443 : 80)),
          verifiedAt: clock.nowIso(),
          source: "dev-capability",
        }),
        // ADR-PIPE-015 T016: a dev-capability egress allowlist entry so the real
        // isAllowedEgressTarget oracle doesn't fail-closed on every fresh dev server — matches the
        // `example.com` target every integrations fixture/test in this repo already uses.
        egressAllowlist: ["example.com"],
      },
    });
  }
  return Promise.resolve();
}
