# ADR-058 — A dedicated, encrypted-at-rest credential store for the public visitor assistant's key

- **Status:** PROPOSED — architecture checkpoint, owner sign-off required before Phase 2 (server) begins
- **Date:** 2026-08-04
- **Deciders:** owner (product decision on mechanism pre-accepted: dedicated encrypted-at-rest store,
  master key from one env var — see Context); this ADR designs the concrete scheme
- **Supersedes / amends:** nothing. Fulfills the seam ADR-036 §8 named and deferred (`SecretSealerPort`,
  "the recoverable secret-store ADR") and the gate ADR-028 §6 left open ("until the secret-store ADR
  lands"). Complements ADR-054 (public visitor assistant) and ADR-049/execution-mode-settings.ts (admin
  BYOK, unchanged by this decision).

## Context

The product ask: an admin screen where an operator pastes a provider API key, and from then on every
anonymous visitor to the deployed site can talk to an AI assistant using that key.

Today `src/server/modules/site-assistant.ts:213` reads exactly one source:
`env.GEMINI_API_KEY?.trim()`. No ledger read, no fallback, no UI path. An operator without shell
access to the deploy target cannot turn this on.

Two existing things look like homes for this and are not:

1. **The settings ledger (SPEC-007 / ADR-028).** `src/assistant/execution-mode-settings.ts:42-57`
   documents the gate this ADR resolves: ADR-028 §6 is normative — `registerDefinitions` REJECTS any
   `secret:true` definition "until the secret-store ADR lands" — and registering the raw key as a
   plain (non-secret) definition is worse, not neutral: every ledger write flows through the
   append-only `setting_revisions` table (ADR-028 §4), which has no redaction path for a non-secret
   value. A site's live provider key would sit in plaintext in that revision history, and in any future
   settings export, forever. This is exactly the situation ADR-028 §6 was written to block.
2. **The admin's own BYOK key (`apps/admin/src/lib/execution-settings.ts`).** That key is deliberately
   browser-local (`localStorage`, key `tovu:execution-credentials:v1`) and never reaches Tovu's
   settings routes — see that file's header, item 2. It powers the **admin's own** assistant dock
   (ADR-049). It is a different key, a different assistant, a different trust boundary, and this ADR
   does not touch it. §"Distinction from the admin's BYOK key" below exists because this already
   confused the owner once and must not again.

**A real seam for this already exists and is unbuilt.** `src/integrations/ports.ts` declares
`SecretSealerPort` (`seal`/`open`) and `src/integrations/types.ts` declares `SealedSecret`
(`{keyId, ciphertext, nonce, alg}`) and `IntegrationSecretRecord` — named and typed by ADR-036 §8 as
"the seam" for exactly this class of problem ("outbound integration connectors... Sealed credentials
require the *recoverable* secret-store ADR-024 defers — hence deferred here too: v1 ships the
sealed-table shape, not a connector runtime"). **No adapter implements it. No table exists** (`grep` for
`integration_secrets` across schema and every migration returns nothing). Two other subsystems have
already hit this exact gap and explicitly declined to fill it:

- `src/features/plugins/lipay/credentials.ts:18-22` — "`KeyringPort` is deliberately NOT reused: it
  derives secrets via HKDF from a root key, which is right for outbound signing secrets Tovu itself
  mints and wrong for externally-issued provider credentials that must round-trip verbatim
  (`SecretSealerPort` framing)" — then sidesteps the whole problem by reading credentials from
  **install-wide env vars only**, never persisted.
- `src/features/plugins/deploy/deploy-plugin.ts:1-19` — same framing, same sidestep, for a Vercel
  deploy token.

Both were right to sidestep it: neither needed a *rotatable-from-a-UI* credential, only an
*install-wide* one. This feature is the first real consumer that cannot take that shortcut — the
owner's explicit rationale (see dispatch) is that the provider key must be rotatable from the admin UI
with no shell access, while the master secret is set once at deploy and never rotates. That forces
**recoverable, DB-persisted, UI-writable storage** — precisely what `SecretSealerPort` was named for
and precisely what neither lipay nor deploy-plugin needed.

There is also a directly relevant, already-shipped precedent for the key-derivation half:
`src/integrations/keyring.env.ts`'s `EnvOrFileKeyring` — implements `KeyringPort`, resolves a root key
from `TOVU_INTEGRATIONS_ROOT_KEY` (hex env var), derives purpose-namespaced secrets via
`hkdfSync`, and is already wired at `server/deps.ts:498` for webhook signing and newsletter
unsubscribe tokens, sharing **one root key, purpose-namespaced** (`deps.ts:495-496`'s own comment:
"not two independent keyrings"). `KeyringPort.derive()`'s doc (`ports.ts:70-86`) explicitly frames
itself as the crosscutting seam other consumers use, and was widened by ADR-036's Round-4 fold for
exactly this kind of proliferation.

## Decision

Build the first real `SecretSealerPort` implementation — an AES-256-GCM adapter keyed via the existing
`KeyringPort` — and a dedicated, single-purpose table for the site's assistant credential. Do **not**
route this through the settings ledger, and do not invent a second root-secret env var.

### 1. Why not the settings ledger (restated as a decision, not just cited)

ADR-028 §6 blocks `secret:true` registration outright, and a non-secret registration would put a live
paid-API key in an append-only, exportable revision log with no redaction path. Both branches of that
gate are wrong for this data. This is not a workaround of ADR-028 §6 — it is the thing §6 said would
need its own ADR before the secret path could ever open. The settings ledger remains correct for what
it already holds (`core.execution.*` non-secret fields, `site.assistant.public_enabled`); this store
holds exactly one thing the ledger structurally cannot: recoverable secret material.

### 2. The encryption scheme, concretely

- **Algorithm:** AES-256-GCM (`node:crypto`, no new dependency — matches the brief and matches every
  other crypto use in this codebase, all of which is already bare `node:crypto`:
  `pending-confirmations.ts`, `daemon-auth.ts`, `lipay-gateway.ts`, `keyring.env.ts` itself).
- **Key derivation:** reuse `KeyringPort.derive()`, not a bespoke KDF. A new adapter,
  `AesGcmSecretSealer` (implements `SecretSealerPort`), holds a `KeyringPort` and internally calls
  `derive({ workspaceId: SEALER_KEY_SCOPE, purpose: "secret-sealer.v1", info: activeKey.keyId })` to
  obtain its 32-byte AES key — HKDF-SHA256 under the hood, domain-separated from webhook signing and
  newsletter derivation by the bound `purpose` string (ADR-036 Round-3 fold's requirement that
  `purpose` be a real separation boundary, not decorative). No raw key material is ever read by this
  feature's own code; it only calls the existing port.
- **Root key source: reuse `TOVU_INTEGRATIONS_ROOT_KEY`, not a new env var.** `SealedSecret.keyId`
  already exists specifically to name "the root-key generation the value was wrapped under" so a
  future rewrap/rotation has something to key off — that only makes sense if there is meant to be
  **one** root-key identity for all of ADR-036's sealed-secret needs, not one per consumer. Introducing
  a second long-lived install secret here would fork that identity for no benefit: it does not change
  what an attacker who has both the DB and *a* root-key env var can do, and it doubles the operator's
  backup/rotation story. One deploy-time secret, reused, purpose-namespaced per consumer.
- **Fail-closed is a construction choice, not a runtime check.** The *shared* `EnvOrFileKeyring`
  instance at `deps.ts:498` intentionally allows a generated-file fallback (`allowFileFallback: true`
  default) — correct for webhook signing, where a regenerated-but-persisted file is low-blast-radius
  (receivers re-copy). This feature constructs its **own** `EnvOrFileKeyring` instance with
  `{ allowFileFallback: false }` — same class, same env var, independent instance — so a missing root
  key throws immediately rather than silently minting `~/.tovu/integrations-root-key.hex` under a
  feature encrypting a real, paid, third-party credential. This is a deliberate asymmetry between the
  two call sites, not an inconsistency: named explicitly here so a future reader doesn't "fix" it into
  matching. When the env var *is* set, both instances derive byte-identical root key material (pure
  function of the same input) — there is no drift risk, only a difference in what happens when it's
  absent.
- **Per-record framing:** one row per workspace (see §7 DDD below). At write time: generate a random
  12-byte IV via `randomBytes(12)`, `createCipheriv("aes-256-gcm", key, iv)`, encrypt the plaintext
  key, take `cipher.getAuthTag()` (16 bytes) and append it to the ciphertext before base64-encoding —
  this fills `SealedSecret.ciphertext` with `ciphertext || tag`, matching the existing 4-field shape
  (`keyId`, `ciphertext`, `nonce`, `alg`) exactly rather than inventing a fifth `tag` field. `alg` is
  the literal string `"aes-256-gcm"`. At read time (server-side only, see §3): split the trailing 16
  bytes back off before `createDecipheriv(...).setAuthTag(tag)`.

### 3. The write-only API contract

- `GET .../assistant/site-credential` → `{ data: { isSet, masked, provider, baseUrl, model, updatedAt } }`.
  **Never decrypts.** `masked` is computed **once, at write time**, from the plaintext before it is
  discarded, and stored as its own plain (non-secret) column. This is a deliberate simplification over
  "decrypt-then-mask on every read": it means GET is a pure DB read with zero crypto involvement, and
  it means a GET still returns a correct `masked` value even if the master secret has since been
  rotated away or gone missing (a real operational case — see §4) — it would otherwise be unable to
  even show what's on file.
- Masking format matches the existing convention already shipped in `@jini-ai/ui`
  (`features/media-providers/rules.js`'s `maskedKeyLabel`: `` `••••${tail.slice(-4)}` ``) — reusing the
  same visual language admins already see on the Execution-mode screen, not inventing a second one.
- `PUT` never echoes the key back, per the brief. Omitted `apiKey` in the PATCH body leaves the stored
  key untouched (re-seals only if a non-empty string is present), so an admin can change `model` alone
  without retyping the key — mirrors the admin BYOK screen's own "change one field" ergonomics.
- `DELETE` clears all four sealed-blob columns and `masked` back to `NULL`; provider/baseUrl/model are
  left as-is (deleting the key is not the same operation as resetting the whole row).

### 4. Master secret absent — fail closed, distinct code, no silent anything

- **On PUT with a new key**, before any DB write: attempt to construct the sealer's key. A missing
  `TOVU_INTEGRATIONS_ROOT_KEY` throws (per §2's `allowFileFallback: false`); the route catches that
  specific failure and returns `503 { error: "...", code: "SECRET_STORE_UNCONFIGURED" }` naming the
  env var, before touching the database. Never falls back to plaintext, never no-ops the write as if it
  succeeded.
- **On GET**, no master secret is needed at all (§3 — `masked` is a stored column). A misconfigured
  deploy can still see "yes, a key is on file, ending in ••••1234" even if the root key is currently
  missing; it just cannot accept a **new** key until the root key is restored.
- **On the runtime read path** (visitor chat, §6), a missing/wrong root key at decrypt time is caught,
  logged once as an operator-visible warning, and treated as "no stored credential" — falling through
  to the existing `env.GEMINI_API_KEY` path. It must never surface as a 500 to a visitor: a
  misconfigured secret store degrades to the pre-existing behavior, it does not break the assistant.

### 5. Distinction from the admin's BYOK key — made structural, not just documented

This confused the owner once; the fix is to make the two impossible to conflate in the UI and the code,
not just to comment well:

- **Different table, different route namespace, different tab.** This ADR's store is
  `site_assistant_credentials`, one row per **workspace**, read by the **public, anonymous** chat route.
  The admin BYOK key lives in the admin's own browser `localStorage`, one per **admin operator's
  browser**, read only by the admin's own assistant dock.
  `src/server/modules/site-assistant.ts`'s `resolveModel` doc already states this split for the
  **model** field ("this is the ONLY thing that decides the visitor assistant's model... a different
  setting for a different assistant"); Phase 2 extends that same doc comment to cover the **key** now
  that it, too, has two independent sources.
  - Phase 3's tab copy must say, in plain language, that this key is used by every visitor to the
    public site, is not personal to the admin viewing the screen, and is unrelated to the Execution-mode
    BYOK card elsewhere in Settings.

### 6. Runtime consumer wiring (`site-assistant.ts`)

Resolution order becomes: stored credential (decrypt; on any failure — absent row, missing root key,
auth-tag mismatch — fall through) → `env.GEMINI_API_KEY` (existing behavior, **unchanged**). This is
additive, not a replacement: every existing deployment and the E2E suite that sets `GEMINI_API_KEY`
keeps working with zero stored row. Only `site-assistant.ts`'s key-resolution branch (currently
`site-assistant.ts:213-222`) and its file-header comment change; `SYSTEM_PREAMBLE`, the tool-execution
path, and everything else in that file are untouched (per the dispatch's file-ownership note — other
sessions are editing `SYSTEM_PREAMBLE` concurrently).

### 7. Data model

One row per workspace (same shape as the existing single-row-per-workspace tables `origin_settings` /
`presentation_settings` in `src/db/schema.ts` — `workspace_id` as the primary key, no surrogate id,
upsert semantics), core migration (not a plugin data module — `features/plugins/data-module.ts`'s
column grammar has no room for this and ADR-036's own `integration_secrets` precedent is core-owned
for the identical reason):

```sql
CREATE TABLE site_assistant_credentials (
  workspace_id       TEXT PRIMARY KEY,
  provider           TEXT NOT NULL DEFAULT 'google',
  base_url           TEXT,
  model              TEXT,
  sealed_key_id      TEXT,   -- SealedSecret.keyId; NULL iff no key stored
  sealed_ciphertext  TEXT,   -- base64(ciphertext || authTag); NULL iff no key stored
  sealed_nonce       TEXT,   -- base64 IV; NULL iff no key stored
  sealed_alg         TEXT,   -- 'aes-256-gcm'; NULL iff no key stored
  masked             TEXT,   -- '••••xxxx'; NULL iff no key stored
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  CHECK (
    (sealed_key_id IS NULL AND sealed_ciphertext IS NULL AND sealed_nonce IS NULL
       AND sealed_alg IS NULL AND masked IS NULL)
    OR
    (sealed_key_id IS NOT NULL AND sealed_ciphertext IS NOT NULL AND sealed_nonce IS NOT NULL
       AND sealed_alg IS NOT NULL AND masked IS NOT NULL)
  )
);
```

The CHECK makes "half a sealed secret" (e.g. ciphertext with no nonce) unrepresentable — the same
totality discipline ADR-028 uses for its own value shapes, applied here to the sealed-blob shape.
Migration number: **0025** (next free after `0024_lethal_weapon_omega.sql`; another session's
uncommitted `_journal.json`/`schema.ts`/`0024_*` work was checked at research time and is not touched
or renumbered by this ADR).

### 8. Rotation and deletion

- **Rotation** = PUT with a new `apiKey`: single `UPDATE` overwrites all five sealed-blob columns
  atomically. The **old ciphertext is discarded, not retained.** This deliberately does not follow
  ADR-028's append-only revision-history pattern — that discipline is right for settings values and
  wrong for secret material: keeping a superseded provider key recoverable forever is a liability with
  no offsetting benefit here, unlike a settings value where "what did this used to be" has audit value.
- **Deletion** = DELETE clears the five sealed-blob columns to `NULL` (the CHECK enforces this is
  all-or-nothing). The visitor assistant falls back to `env.GEMINI_API_KEY` on the very next request,
  no restart needed, no dangling state to reason about.
- **Root-key rotation** (rotating `TOVU_INTEGRATIONS_ROOT_KEY` itself) is **out of scope for v1**,
  matching the owner's own stated rationale that the master key is set once at deploy and does not
  rotate. `sealed_key_id` is stored per-row specifically so this is a named, addressable seam for a
  later rewrap pass (`tovu build --secrets=rewrap`-shaped, mirroring `SealedSecret`'s doc intent) —
  not exercised or built here.

### 9. Honest limitations (stated plainly, per the brief)

This defends against a **leaked backup**: someone who obtains `content.db` alone (a copied file, a
snapshot, a misconfigured public bucket) gets ciphertext they cannot open. It does **not** defend
against **host compromise**: an attacker who can read the live process's environment can read
`TOVU_INTEGRATIONS_ROOT_KEY` directly and decrypt every sealed row in the database that same attacker
now also has read access to — at that point this scheme has done its job (raised the bar from "the DB
alone is enough" to "the DB and the live host are both required") and no further. It is not, and is not
being sold as, protection against a fully compromised server.

## Distinction from BYOK — one paragraph, for the UI copy and the reader

**Two different keys, on purpose.** The Execution-mode BYOK key (Settings → Execution mode) is the
admin's own credential for the admin's own assistant dock, stored only in that admin's browser. The
key on the new "Visitor's AI Assistant" tab is the site's key — one per workspace, stored encrypted on
the server, and used by the public chat every anonymous visitor to the deployed site talks to. Saving
one has no effect on the other.

## Consequences

- First real implementation of the `SecretSealerPort` seam ADR-036 §8 named and deferred. Future
  consumers with the same "must round-trip, must be UI-rotatable" shape (a per-workspace lipay merchant
  credential, a per-workspace deploy token) can reuse `AesGcmSecretSealer` directly rather than
  re-deriving crypto — this was designed as a reusable adapter, not a bespoke one-off, even though only
  the site-assistant credential consumes it today.
- Resolves the gate ADR-028 §6 left open for the settings ledger's own `secret:true` path — but does
  **not** open that path. This ADR's store is deliberately outside the ledger; a future decision to let
  `secret:true` ledger definitions exist (per-key PATCH, redaction-safe revisions, `secretRef` write
  shape — ADR-028 §6's own frozen contract) is separate work this ADR does not do.
- `TOVU_INTEGRATIONS_ROOT_KEY` becomes load-bearing for a real, financially-relevant secret (a paid
  provider API key) for the first time — previously it only gated derived-not-stored, cheaply-rotatable
  signing secrets. Operationally this raises the bar on backing up/protecting that one env var, which is
  the intended tradeoff (one secret to protect well, not several to protect adequately).

## Mitigations required (carried into Phase 2/3, not resolved here)

- Route-level: mirror `put-settings.ts`'s 400-validation/500-other split exactly, plus the new
  `503 SECRET_STORE_UNCONFIGURED` branch (§4).
- Runtime-consumer: a decrypt failure must be caught **per-request**, not crash the process, and must
  degrade to the env fallback (§4, §6) — this is a correctness-critical unit, flagged for
  `critical-internal-constraints` treatment in Phase 2 if the implementation-outline trigger check calls
  for it (security-critical sequencing: wrong-order here is "visitor request 500s" or worse "plaintext
  half-decrypted bytes get sent to the model").
- UI: the "unmissable distinction" requirement (§ Distinction from BYOK) is a design constraint on
  Phase 3, not satisfied by this document alone.

## Open item carried to Phase 3, flagged now rather than discovered mid-build

**`ByokProviderForm` (`@jini-ai/ui`, re-exported from its root index) cannot express this contract as
typed.** Checked its actual props (`node_modules/@jini-ai/ui/dist/features/execution/react/components/ByokProviderForm.d.ts`):
`config: ByokConfig` where `ByokConfig.apiKey: string` is a plain, required, always-present string, and
`onConfigChange: (config: ByokConfig) => void` expects the full plaintext value back on every edit.
There is no `isSet`/`masked`/write-only mode anywhere in `ByokConfig` or the form's props — it was built
for the browser-local BYOK case, where holding the plaintext key in React state is the whole model.
Passing this component a fabricated non-empty `apiKey` string would misrepresent what's actually
stored; passing it an always-empty string gives the operator no visual confirmation a key is on file at
all, which directly fails this feature's "unmissable" requirement (§3, §"Distinction from BYOK"). Per
the dispatch's own instruction, this is not a green light to fork the component into Tovu. Phase 3 should
build a **thin Tovu wrapper** — a small key-entry field showing `masked` as a placeholder/label plus an
explicit "isSet" affordance, calling this ADR's write-only PUT directly — reusing `SettingsDialogShell`
tab chrome and visual language from `@jini-ai/ui` (per the dispatch's reuse instruction) without reusing
`ByokProviderForm` itself for the key field specifically. `ExecutionTab`'s surrounding layout (tab
structure, section headers, save-state indicator) remains a legitimate reuse target and should still be
followed for everything **other than** the key field. Worth raising upstream to Jini separately (not
blocking this feature): `ByokConfig` gaining an optional `isSet`/masked-mode would let a future host
reuse `ByokProviderForm` wholesale for a server-stored-key case like this one.

## Re-evaluation triggers

- A second `SecretSealerPort` consumer lands (lipay per-workspace credentials, deploy-plugin per-
  workspace tokens) — re-evaluate whether `AesGcmSecretSealer` needs to move out of a site-assistant-
  specific location into a shared `src/integrations/` adapter file (it is designed to be shared; if a
  second real consumer arrives, promote its current location accordingly rather than duplicating it).
- Root-key rotation becomes a real requirement (owner's "set once, never rotates" assumption changes) —
  the `sealed_key_id`-per-row seam exists for this; building the rewrap pass is new work, not a redesign.
- The settings ledger's own `secret:true` path is ever unblocked — confirm this store's existence
  doesn't get read as "ADR-028 §6 is now moot"; it isn't, they solve different problems (this is one
  workspace-scoped write-only credential; the ledger's secret path, if ever built, would need per-key
  layering/scoping the way every other ledger value has).

## Handoff to Phase 2

API contract, migration shape, sealer design, and consumer-wiring points are locked above. Phase 2
should NOT relitigate: ledger-vs-dedicated-store (§1), AES-256-GCM + `SecretSealerPort` reuse (§2),
root-key reuse via a dedicated fail-closed `EnvOrFileKeyring` instance (§2), write-only contract shape
(§3), migration number 0025 (§7). Phase 2 owns: exact route file layout under
`src/server/routes/admin/assistant/`, the `AesGcmSecretSealer` implementation file location, the
`SiteAssistantCredentialRepoPort` + SQLite adapter, and the `site-assistant.ts` header/resolution-order
edit (§6). Phase 3 owns the wrapper design flagged in "Open item" above.
