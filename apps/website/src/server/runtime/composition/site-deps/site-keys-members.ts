import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { EnvOrFileKeyring } from "#src/features/webhooks/keyring.env";
import { MembersSubscriberDirectory } from "#src/features/members/subscriber-directory";
import { SqliteMemberRepo } from "#src/features/members/repo.sqlite";
import { createHookRegistry } from "@jini-ai/user-management/newsletter/hooks";
import { resolveRuntimeMode } from "#src/contracts/core/runtime-mode";
import { siteKeyEnvOnlySources } from "#src/features/webhooks/site-key-sources";
import type { SiteStore } from "../open-site-store.js";
import type { CreateSiteRouteDepsOverrides } from "./overrides.js";
import { resolveSiteDirForDatabase } from "#src/platform/site-dir/site-databases";
import { resolveSiteKeyId, siteKeySources } from "#src/features/webhooks/site-key-sources";
import { homedir } from "node:os";

interface ComposeSiteKeysMembersRequired {
  dbPath: string;
  overrides: Partial<CreateSiteRouteDepsOverrides>;
  kernel: SiteStore["content"];
}

/** Resolve the served site's key candidates and retain its root for vault contribution discovery.
 * @complexity O(1), one site-metadata read; never reads or creates key material. */
function compositionSiteKeySources({ dbPath, runtimeMode, siteBinding }: {
  dbPath: string; runtimeMode: ReturnType<typeof resolveRuntimeMode>; siteBinding: CreateSiteRouteDepsOverrides["siteBinding"] | undefined;
}, _options = {}) {
  // site-key plan §A3a: both site-key-backed keyrings below need this site's own ordered source
  // list (per-site file first in local mode, mirroring `ensureSiteKey`'s own writer-side ordering —
  // `site-key-sources.ts`). Computed once, here, rather than per-keyring: `dbPath !== ":memory:" ?
  // resolveSiteDirForDatabase(...) : undefined` shares the site-root resolution used by
  // `createSiteDisplayNameSource` above, so a `:memory:` boot (no site directory at all) correctly
  // resolves no `siteKeyId` and therefore no per-site candidate. The database may now be outside
  // that root; its parent must never establish the key's identity.
  // Site keys/config/themes remain at the site root when SQLite is stored elsewhere.
  const siteDirForKeyring = dbPath !== ":memory:" ? resolveSiteDirForDatabase({ dbPath, siteDir: siteBinding?.dir }) : undefined;
  const siteKeyIdForKeyring = siteDirForKeyring ? resolveSiteKeyId({ siteDir: siteDirForKeyring }) : undefined;
  const sources = siteKeySources({
    mode: runtimeMode,
    env: process.env,
    home: homedir(),
    cwd: process.cwd(),
    siteKeyId: siteKeyIdForKeyring,
  });
  return { siteDirForKeyring, sources };
}

export function composeSiteKeysMembers(required: ComposeSiteKeysMembersRequired, _optional = {}) {
  const { dbPath, overrides, kernel } = required;


  // Hoisted above `newsletterKeyring` (moved up from its original position further below, where a
  // second `resolveRuntimeMode()` call used to sit) so `newsletterKeyring`'s own construction below
  // can read it — `resolveRuntimeMode()` is a pure, side-effect-free read of `process.env.
  // TOVU_RUNTIME_MODE` (see its own header), so hoisting the call changes nothing about what it
  // returns, only when it is first read.
  const runtimeMode = resolveRuntimeMode();

  const { siteDirForKeyring, sources: siteKeySourcesList } = compositionSiteKeySources({ dbPath, runtimeMode, siteBinding: overrides.siteBinding });

  // SPEC-011 (Newsletter) Stage 5 wiring — hoisted for the same reason `apps/website/src/server/runtime/composition/app.ts`'s identical
  // hoisting comment explains: `newsletterSubscriberDirectory` must read the SAME member rows the
  // returned `memberRepo` field exposes, and `newsletterKeyring` is the ONE process-lifetime
  // `KeyringPort` instance also used to build `webhookSigner` below (one site key,
  // purpose-namespaced — `webhooks/ports.ts`'s `KeyringPort.derive()` contract — not two).
  //
  // `allowFileFallback: runtimeMode !== "production"` (2026-09-09 site-key fix): in
  // local/dev mode this still defaults to `true` (unchanged from before this fix) — a developer
  // with no `TOVU_SITE_KEY` set must keep booting via the generated-file fallback. In
  // production, the file fallback resolves against the container's own ephemeral rootfs (`Dockerfile`'s
  // `USER node` -> `homedir()` is `/home/node`, not the mounted data volume) — a missing var there
  // used to boot fine and silently mint a fresh, throwaway site key on every redeploy. The boot-time
  // gate (`server/runtime/boot/production-readiness-gate.ts`'s `hasMissingIntegrationsSiteKey`) is
  // the primary fix — it refuses to boot before this line is ever reached — this is defense in
  // depth: if that gate is ever bypassed or this composition root is ever reached from a path that
  // does not call it, `newsletterKeyring` still fails loudly on first use in production (missing
  // env var AND no key file at the durable path — `keyring.env.ts`'s `defaultSiteKeyFilePath`)
  // rather than silently re-keying.
  //
  // NOT extended to `allowFileFallback: true` unconditionally (undoing the `runtimeMode` gate)
  // even though `defaultSiteKeyFilePath`'s 2026-09-09 durability fix removed the ORIGINAL reason
  // for this gate (the ephemeral-rootfs problem) — a committed regression test
  // (`production-readiness-boot.integration.test.ts`) pins this exact mode-gated construction, and
  // this pass's own dispatch scoped the production fix to `siteAssistantSecretKeyring` below, not
  // this instance. Left as a disclosed, intentional asymmetry rather than silently "fixed": in
  // production, webhook signing / newsletter tokens still require the env var; only the
  // credential-sealing keyring below can now also use a generated file.
  //
  // `allowFileAutoGenerate: false` (2026-09-16) — closes an OVERSIGHT, not the disclosed asymmetry
  // above. The local-mode "must keep booting via the generated-file fallback" rationale was written
  // (`ddfa5e07`) while reading and minting were still one unit; the `allowFileAutoGenerate` split
  // arrived two hours later (`bb84fc1b`) and was applied to `siteAssistantSecretKeyring` only. Left
  // on the default, this instance minted `~/.tovu/site-key.hex` unattended in local
  // mode — and its only live consumer is the PUBLIC `/newsletter/unsubscribe` route, whose
  // `processUnsubscribe` derives before it can reject a token, so ANY anonymous request with a
  // base64url-JSON token minted it. `siteAssistantSecretKeyring` reads that same path, so the key
  // sealing every stored credential could be one no operator created, saw or backed up. Nothing
  // derives at boot (resolution is lazy) and no legitimate unsubscribe token can exist before a key
  // does, so no startup or first-run path depended on the mint. This instance still READS an
  // existing file; with no env var and no file, a local unsubscribe request now fails closed.
  const memberRepo = new SqliteMemberRepo({ store: kernel });
  // Production signing must remain env-only: a source list must not accidentally add a volume
  // fallback for newsletter/webhook signing. Locally it uses the site's usual ordered sources.
  // Every keyring is read-only, so an anonymous unsubscribe request can never mint a site key.
  // Keep the source policy as a flat local next to this reader; the integration tests exercise it.
  const newsletterKeyringSources = runtimeMode !== "production" ? siteKeySourcesList : siteKeyEnvOnlySources({});
  const newsletterKeyring = new EnvOrFileKeyring({
    sources: newsletterKeyringSources,
  });
  const newsletterSubscriberDirectory = new MembersSubscriberDirectory({ members: memberRepo });
  const newsletterHooks = createHookRegistry();

  // ADR-058: the SITE assistant credential store's OWN `KeyringPort` instance — deliberately NOT
  // `newsletterKeyring` above, even though both read the same `TOVU_SITE_KEY` env var
  // and (when it is set) derive from byte-identical site-key material.
  //
  // 2026-09-09 — CHANGED from `{ allowFileFallback: false }` to `{ allowFileFallback: true,
  // allowFileAutoGenerate: false }` (owner-approved, after this exact asymmetry was flagged rather
  // than silently reconciled — the historical Security durability report dated 2026-09-09). This
  // instance may now READ an already-generated key file — the durable, production-safe path
  // `defaultSiteKeyFilePath()` now resolves to — but will NEVER mint one itself
  // (`allowFileAutoGenerate: false`): the only way a file comes into existence for this store is
  // the admin Secrets page's site key tab's explicit, attended Generate action
  // (`keyring.env.ts`'s `generateFileSiteKey`, a plain function independent of this flag).
  //
  // This UPDATES rather than reverses ADR-058 §2's stated reasoning: that section's actual
  // objection was an UNATTENDED first-use mint under a feature encrypting a real, paid credential
  // ("a missing site key throws immediately rather than silently minting..."), which
  // `allowFileAutoGenerate: false` still fully honors. It DOES contradict ADR-058 §9's "leaked
  // backup alone is not enough" framing: that defense assumed the site key lives only in the live
  // process's environment, never on disk beside `content.db`. Once a generated key file exists on
  // the same data volume as the database it protects, someone who obtains a volume snapshot/backup
  // gets both — the ciphertext AND the key that opens it. This is an ACCEPTED, DOCUMENTED cost of
  // this change, not an oversight: it trades some of ADR-058's original defense-in-depth for the
  // ability to run without a host `secrets set` at all. See the historical Security durability report
  // dated 2026-09-09 for the full tradeoff writeup.
  // site-key plan §A3a: `sources` is threaded in UNCONDITIONALLY (both modes) — safe and
  // behavior-preserving in production, since `siteKeySourcesList`'s production branch is exactly
  // `[env, legacy-volume-file]`, the same env-then-`defaultSiteKeyFilePath()` precedence this
  // instance's own default (non-`sources`) resolution already used (`site-key-sources.ts`'s
  // `legacyVolumeFilePath` doc: "the production durable-volume path ... reused here unchanged").
  const siteAssistantSecretKeyring = new EnvOrFileKeyring({
    sources: siteKeySourcesList,
  });
  const siteAssistantSecretSealer = new AesGcmSecretSealer(siteAssistantSecretKeyring);
  return { runtimeMode, siteDirForKeyring, memberRepo, newsletterKeyring, newsletterSubscriberDirectory, newsletterHooks, siteAssistantSecretKeyring, siteAssistantSecretSealer };
}
