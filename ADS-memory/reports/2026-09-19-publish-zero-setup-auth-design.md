# Zero-setup publishing auth — design

2026-09-19. Implements Codex 5.6's §4 recommendation
(`ADS-memory/.local-artifacts/codex-publish-audit/codex-report.md`) with this repo's
vendor-neutrality and no-vendor-CLI constraints applied.

## What the user does today, and what they will do instead

Today: open the live site's admin, mint an API key, copy it, come back, paste it into a peer row.
Four artefacts to understand (peer, API key, workspace id, base URL).

After: pick the destination once — "publish to **tovu.com**?" — and publish. No key exists for the
user to see, copy, store or rotate. No concept named "peer", "API key", "workspace id", "principal"
or "bundle" appears on that path.

## Why this is not another key you have to manage

**You already have exactly one key, and this uses it. Nothing new appears anywhere you can see.**

The "Site Token" in Secrets **is** the root key — same thing, two names
(`features/identity/site-token-permission.ts:8-9`, `routes/system/site-token.ts:16-23`: that tab
views and generates `TOVU_INTEGRATIONS_ROOT_KEY`). So the credential you manage today is the
credential publishing runs on. Rotate the Site Token and publishing rotates with it, automatically.
There is no second thing in the UI, no second rotation ritual, and nothing new to explain.

The three candidates, and why only one works:

| Candidate | Verdict | Why |
| --- | --- | --- |
| **Site Token / root key** | **Used** — as a derivation root | Already the one visible credential. Already the derivation root for webhook signing secrets, analytics salts and newsletter tokens — none of which surface in the UI either. Publishing joins an established list rather than starting a new one. |
| Site Token / root key used *directly* as the wire credential | Rejected | It would have to travel to the destination. That key decrypts **every sealed credential this install holds**; handing it to a site so that site can check a signature would trade a publishing problem for total compromise. It also can't work mechanically: the two installs have different root keys by design. |
| `api_keys` | Rejected | It *is* the thing you rejected — minted on the destination, shown once, copied back by hand. It is also symmetric (the value must travel), it surfaces in the UI as a second managed credential with its own lifecycle, and it rides the general auth path on ordinary `content.write` (Codex's finding), so reusing it would let a stolen publish credential create posts. Narrowing is required, and narrowing this one is not possible without breaking every other use. |

So the publishing key is **derived from the Site Token, not minted beside it**. It has no UI, no
lifecycle of its own, and no name the user ever has to learn. Concretely it is not a key that
*exists*: it is recomputed from the Site Token at the moment of each publish and discarded. There is
nothing to store, back up, rotate, revoke by hand, or lose.

What this deliberately does **not** do is reuse the Site Token's *authority*. Deriving from the one
credential gives the owner one thing to manage; it must not give publishing everything that
credential can reach. The derived key's capability set is publishing-only and enumerated in the
grant — see **Publishing-only authority** below.

## Mechanism

**No credential is ever stored, transferred, or displayed.** The signing key is *derived*, not
issued — from the Site Token you already have:

```
ed25519Seed = KeyringPort.derive({
  workspaceId,
  purpose: "publish-trust-signing-key",
  info:    `${sourceInstallationId}:${targetOrigin}:v${generation}`,
})               // 32 bytes of HKDF-SHA256 over the install's root key
```

- `KeyringPort.derive` already exists (`features/webhooks/ports.ts:86`, adapter
  `keyring.env.ts:143`, 32-byte output). Nothing new is persisted; the private key exists only in
  memory for the microseconds it takes to sign.
- `sourceInstallationId` is likewise derived (`purpose: "installation-id"`), so it is stable across
  credential rotation and needs no table. Rotation is `generation + 1`; the old public key stays in
  the grant for an overlap window.
- Only the **public** key leaves the machine. A public key is safe in git, in CI logs, in provider
  metadata and in deployment output — which is exactly why this design has no secret to transfer.

**Provisioning (the trust bridge).** The destination learns the public key through the channel the
user already operates: the deployment. The grant is a signed-free, secret-free document
(`publicKeys[]`, `sourceInstallationId`, allowed workspace, allowed entity types, capabilities,
`notAfter`, `generation`) serialised into `TOVU_PUBLISH_TRUST` and read at boot. Behind
`PublishTrustProvisioningPort`; the default adapter writes it into the committed deploy config, so
it works identically on Fly, Railway, Render, AWS and a bare VPS. There is no `if (provider ===
"fly")` and no vendor CLI on the dev machine. Codex's bearer-minting variant is explicitly *not*
implemented: CI never sees, mints or returns a secret.

**Proof of possession.** `GET /api/publish-trust/v1/identity` → the destination states its own
stable installation id, workspace id and origin. `POST .../challenge` → a single-use nonce with a
TTL. The source signs a canonical string binding **nonce + audience (target installation id) +
source installation id + generation + capability set**, and `POST .../session` returns a short-lived
session token, HMAC'd under the destination's own root key, carrying the granted capabilities, the
allowed method+path set, the audience and an expiry. Nothing about it is guessable from a captured
request, and it cannot be replayed onto a second destination because the audience is inside both the
signed challenge and the token.

**Publishing-only authority.** The token is not an admin credential. `requirePublishTrust` accepts it
only for method+path pairs enumerated in the token; a request outside that set resolves to *no*
credential and 401s. The set is fail-closed by construction: a route added tomorrow is absent from
it, so a stolen publish token cannot reach `POST /posts` or anything else on `content.write`.
Authorisation for a publish-token request is answered from the grant's capability set alone and
never from RBAC, so the token cannot inherit a human's permissions.

**Provenance.** The resolved principal is `kind: "publish_key"` with a stable id derived from the
source installation, and `routes/publish-content/import.ts` now reports the credential kind it
actually saw instead of the hardcoded `"user"`. Automation is recorded as automation.

**Stable identity vs rotating credentials.** `publish_content_baselines.peerPrincipalId` holds the
authenticated principal id. Because that id is `pub:<sourceInstallationId>` — derived, not issued —
it is unchanged by key rotation, so a rotation does not make every row look like a first publish.
The key generation travels as audit metadata, not as identity. No migration.

## Rotation, revocation, recovery

- **Rotate:** bump `generation`; provisioning publishes the new public key alongside the old for an
  overlap window; the old entry drops out on the following deploy. Regenerating the **Site Token**
  rotates the publishing key too, for free — the derivation changes, so the old public key stops
  verifying. That is one ritual the owner already knows, not a second one.
- **Revoke (target-side, independent of the provider token):** remove the grant from the
  destination's config, or set `notAfter` in the past. A revoked provider token does not revoke
  publishing, and revoking publishing does not need provider access. Sessions are minutes-long, so
  revocation takes effect within one session lifetime.
- **Lost machine:** the private key was never at rest — losing the machine loses nothing an attacker
  can use without the root key. Re-pairing from a new machine with the same root key derives the
  same key; from a different root key it derives a different one, which the destination rejects
  until a deploy provisions it.
- **Destination restored from backup:** the destination's installation id is derived from its root
  key and reported at handshake; the source records it and refuses (loudly, not silently) if it
  changes.

## Honest floor: what the user still does

**One choice, once: which site is theirs.** The candidate is pre-filled from the deploy config the
install already has, so in the common case it is a confirmation, not a decision. Codex's floor
("zero key copying is achievable, zero trust decision is not") is met exactly, not exceeded.

Everything else — key material, installation ids, workspace ids, sessions, nonces, rotation — is
derived or exchanged by machines and never surfaced.

## Kept, not replaced

The explicit peer path (`publish_content_peers` + a pasted API key) stays for publishing to a
genuinely different Tovu that this install does not deploy. The default destination sits in front of
it.
