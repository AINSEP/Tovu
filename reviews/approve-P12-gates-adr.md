GATES: NEEDS ; ADRS: NEEDS

Reviewed: Tovu `origin/plan/whats-left-1122` @ 1a342fe717 (`plans/P12-gates-B-C-sheets.md`, `plans/P12-adr-drafts.md`) against Jini `origin/integ/merge-14-2026-11-22` (= 4902a6a1a, the sheet's pin) + `origin/codex/ex2-holds-jini` (11d47b476), and Tovu `origin/integ/merge-13-2026-11-22` (= f7185f153, the sheet's pin).

What checks out: nearly all cited files and line ranges are real and point at the right code. Jini: `check-no-cross-package.ts:36–83` (local parser) and `:163–262`; `import-sites.ts:13–55`; `spec-aliases.ts:14,42–92` (`createSpecResolver` at :53); `injection-edges.ts:31–106` (`manifestEdges` at :73 covers only deps and peers today, so adding optional deps is a real gap); `injection-gate.ts`; `injection-debt.ts` (key = rule/file/spec/kind, lane kept out of the key, `debt-base.mjs` exists); `check-guard-drift.ts:143–184` (`checkPackageLayers()` runs with injection on, so injection rows can sit in `guard-baseline.json`, and the `{injection:false}` split fixes that); `package.json:15,39`; `ci.yml:73,81–88,145–151` (job `quality-gates`; triggers are main and general-work); test anchors. Tovu: `.dependency-cruiser.mjs:878–885`; `check-feature-ranks.mjs:17–35`; `dependency-cruiser.test.ts:10–44`; `check-size-drift.ts:98–119`; `ci.yml:112–118` and `:309`; `apps/admin/tsconfig.json:14–21`; root `package.json:17–18,59`; and Tovu already imports `@jini-ai/devops/packaging/electron/typescript` (`apps/desktop/scripts/verify-staged-closure.ts:9`). The sheets reuse existing tools and don't duplicate them. The ratchet design is right: new findings or higher counts fail, stale allowances fail, compared against the trusted base. Each gate has a named mutation that is meaningful. Both gates plug into the existing guard / gate-boundaries steps. ADR-071 is the next free Tovu number, and its header format matches ADR-070. DR-006 is the next Jini number. `defineJsonRoute` (`packages/core/src/contracts/server/json-route.ts:132`, re-exported at `server.ts:130`), `mountJsonRoute` (`packages/http-kit/src/adapter.ts:37`), `AdminKitProvider({kit,children})` (`packages/admin/src/react/kit.tsx:249`) and the `Notice` slot (`kit.tsx:280`) all exist. The ADR examples should compile.

## Gate C (Jini): corrections

1. **The rule for Core runtime values is still open (it needs a judgment call).** The sheet counts "916 Core value sites before symbol approval" and approves only `defineJsonRoute`. The approved set is NOT-CHECKED. As written, every new `ok()`, `err()`, `ClientFacingError` or `jsonResponse` import fails, and the executor would have to decide which symbols to approve. Fix: seed `approvedRuntime` in `scripts/injection-debt.json` metadata as the sorted list of every value export from Core's public `exports` entries at the seed SHA (`<entry>#<symbol>`). `classifyCrossPackageSite` allows a named value import only when it matches that list. The list may grow only in the same change that adds the export to a Core public entry (check against the trusted base). Any other growth counts as policy widening and fails. This matches the owner's rule that Core types and contracts are fine, and it means the 916 sites are not seeded as debt. Keep the namespace-load and alias-to-implementation failures.
2. **The status of `@jini-ai/protocol` is unstated.** Today `injection-edges.ts:12` (`BASE_PACKAGES = core, protocol`) allows protocol imports. The new classifier ("all other sibling values and non-Core sibling types produce findings") would quietly turn protocol imports into findings. Fix: say explicitly that protocol keeps base-package status, with the same public-entry rules as Core. This gate does not change that policy.
3. **Seed bootstrap would fail on its own PR.** The sheet adds new keys under existing rule ids (L5) to a debt file that may only shrink against the trusted base, so the seed PR is itself "growth". Fix: give newly covered findings new rule ids (`L5-resolved` for alias, relative, optional-dependency and payload sites the old resolver missed; `XP4-runtime` for contract runtime syntax). Allow additions only for a rule id that has zero entries at the trusted base (the first snapshot, as Tovu's `check-size-drift.ts:115–120` does). Every later change may only shrink.
4. **`--print-baseline` is not a flag of `scripts/injection-baseline.ts`.** `main()` prints the baseline with no flag. Either use `pnpm exec tsx scripts/injection-baseline.ts`, or add the flag in the implementation list.
5. **Split the XP3 CI step into its own sheet (C2).** The artifact and its digest are "pending", so `gate-xp-declarations` can't be blocking yet. C1 = everything else (import reader, resolver, XP4, manifests, the guard:drift change, both debt files, the tests, the CI vitest step). C2 = build the original-pin snapshot, upload the release asset `jini-xp3-35c4961af.tar.gz` on tag `xp3-35c4961af` (does not match `release-*`, so `publish.yml` is not triggered), record the digest, and add the step to the blocking expression. C2 needs a capped cloud or combine run with a cost estimate (iron rule). Until C2 lands, do not reference `steps.gate-xp-declarations` in `ci.yml:146`.
6. **`packages/devops/src/packaging/electron/typescript.ts` ships, and Tovu uses it** (`createTypeScriptImportReader`). New `RuntimeImportRef` fields must be optional and additive. Add a `@jini-ai/devops` changeset, and `pnpm api:check` must pass.
7. Function limit: write "warn at 50 lines, error above 80, complexity 10" in place of "at most 80 lines".
8. After ex2-holds is applied, `check-package-layers.injection.test.ts` and `injection-exceptions.q2.test.ts` lines move. Find the anchors by test name, not line number.

## Gate B (Tovu): corrections

1. **Themes stay in Tovu (owner, 11-22).** `k-work.json` still has 85 `area:"theme"` rows (all of `apps/website/src/features/theme/`) and 25 `area:"adm-themes"` rows. Seeding from it would mark theme code as Jini-bound. Fix: drop the `theme` and `adm-themes` areas, plus any other theme rows, from bound scope. Record them as host-owned with the disposition "stays: owner 2026-11-22".
2. **Some bound rows sit inside forbidden target roots** (needs a judgment call as written). `k-work.json` binds 14 files under `apps/website/src/platform/**` and all 3 of `apps/admin/src/lib/admin-http/**`, but `classifyTarget` forbids both roots. Fix: a target rule applies to any importer outside that root. Edges inside the same forbidden root are exempt. Those 17 rows keep their destinations.
3. **`admin lib/api*` matches no file.** The only hit is the stale comment at `apps/admin/src/lib/admin-http/request.ts:463`. Replace it with `apps/admin/src/lib/admin-http/**` plus the real host-owned transport files under `apps/admin/src/lib/` (for example `owner-{mfa,passkey,recovery}-api.ts`, if they are not bound rows). Rename fixture `lib/api.ts` to match a real file name.
4. **`@tovu/contracts` is allowed only in host-owned code.** Jini can never depend on Tovu (owner 11-21: Tovu out of Jini entirely; 11-22: Tovu types live in `@tovu/contracts`). Fix: an import of `@tovu/contracts` (type or value) from a bound root is a ratcheted finding, `bound-tovu-contracts`. Test row 3 becomes: "an `@tovu/contracts` type passes in a host-owned file and fails from a bound entry".
5. **Inventory source.** `k-work.json` rows use the keys `f/step/area/dest/k`, not `source/destination`. `plans/` is absent from the merge-13 tree, so the generator reads `plans/P9-data/*` from `origin/plan/whats-left-1122` at the recorded plan SHA.
6. **Mover churn.** Each extraction move deletes bound files, which leaves stale allowances that fail CI. With about 6 parallel builders, `extraction-debt.json` will conflict. Fix: add `--write-shrink`, which only lowers or removes entries and never adds. Write one entry per line, sorted. Every mover brief runs it in the same commit.
7. The comment at `ci.yml:113–115` ("always exits 0") becomes false. Update it.

## ADRs: corrections (small; corrected text below)

1. **The Jini DR-006 must not name Tovu.** Jini's `docs/decisions/` has zero Tovu mentions. Its README says records serve "any consumer", and external extraction paths and identifiers stay out of the repo (owner 11-21: Tovu out of Jini entirely). Remove from the draft: "Tovu" (5 times), `@tovu/contracts`, the Tovu census numbers (690/334/137), the "A and B — Host-side checks. Tovu…" bullet, and the "Tovu host" heading.
2. **The DR-006 host example must be server-neutral** (owner 11-07: `{app: Server}`). In Jini, `mountJsonRoute` is the Express adapter in `@jini-ai/http-kit`. Show `app.route(jsonRoute({ spec, deps, reportInternalError }, { host }))`, with `app: Server` from `@jini-ai/core/contracts/server`, and name `mountJsonRoute` as the Express compatibility adapter.
3. **ADR-071 Decision 3 must name the imports.** `defineJsonRoute` comes from `@jini-ai/core/contracts/server`; `@jini-ai/http-kit` exports an Express-bound function with the same name, and Tovu uses that one today (`server/inbound/admin-http/routes/settings/shared.ts:3`). `mountJsonRoute` comes from `@jini-ai/http-kit`. Feature specs leave `ports` unset: http-kit's ports take Express `res`, Core's take `request`/`locals`, so a spec carrying Core ports won't type-check into `mountJsonRoute`.
4. Plain words: in both ADRs, replace "with new `src/contracts` modules types-only under XP4" with "New files under Core's `src/contracts` hold types only." In ADR-071, add "Code bound for Jini never imports `@tovu/contracts`."
5. **Wiring section rule (owner 11-22 22:10).** Add to both: "CI also checks that the ports it names exist. The agent that untangles or moves the feature writes the section in the same change." ADR-071: "each Jini-bound feature folder".
6. **Gate C wording (if Gate C fix 1 is adopted).** In ADR-071 Gate C, write "Allow Core types and the approved Core runtime exports listed with the debt file" in place of "Allow only approved Core runtime symbols".
7. **Indexes.** Add an ADR-071 row to `ADS-memory/reports/architecture/ADR-INDEX.md`; note that ADR-070 is also missing from it. Add DR-006 under "Shared decisions" in Jini `docs/decisions/README.md`.

Bug or risk found (for open-bugs.md): `@jini-ai/http-kit` `mountJsonRoute` ignores a Core spec's `maxBodyBytes`. The http-kit spec type has no such field, and http-kit/src has zero references to it. So a K1 route that sets a body cap in Jini silently loses it when Tovu mounts it, and Express's json limit applies instead. Add a K1 test or a mount-time assertion.

### Corrected ADR-071, replacement passages (rest unchanged)

Decision 2, last two sentences:
> Shared generic types and ports live in `@jini-ai/core`. New files under Core's `src/contracts` hold types only; runtime code goes in its owning implementation module. Tovu-specific types live in `@tovu/contracts`, and code bound for Jini never imports them.

Decision 3:
> 3. **Mount routes in the host.** Define each JSON route with `defineJsonRoute` from `@jini-ai/core/contracts/server` (not the Express-bound function of the same name in `@jini-ai/http-kit`). The spec declares its own small deps type and leaves `ports` unset. Tovu mounts it with `mountJsonRoute` from `@jini-ai/http-kit`, passing explicit route-local deps and its own ports. Keep `RouteDeps`, including `Pick<RouteDeps, …>`, out of feature specs. Bind server adaptation, workspace admission, authentication, authorization, and error mapping at the host boundary. Preserve middleware order, body limits, and response behavior during the cutover.

Gate C bullet:
> - **C — Jini cross-package boundary.** Block new sibling implementation references and shared types outside Core. Allow Core types and the approved Core runtime exports listed with the debt file. Check declarations and manifests as well as source.

Wiring paragraph:
> A documentation check requires a **Wiring** section in each Jini-bound feature folder's `INFO.md` or `README.md`. It lists what the feature needs, what it provides, a short host wiring example, and what it must not import, and it links to this ADR. CI also checks that the ports it names exist. The agent that untangles or moves the feature writes the section in the same change.

### Corrected DR-006 (full text, `docs/decisions/DR-006-host-injected-package-dependencies.md`)

# DR-006: Packages receive implementations from the host

Status: Accepted owner direction, 2026-11-22. This record defines the target for CI enforcement.

## Context

A feature can have its own folder and still depend on a host's route types, transport, or live hooks. A package graph can be acyclic and still lock every consumer into another package's implementation, because a value import fixes the choice the host should make. This decision extends the composition rule in [DR-005](DR-005-portable-package-boundaries.md).

## Decision

1. **Jini owns reusable behavior.** Packages stay product-, vendor-, and server-framework-neutral. A host product owns its policy, themes, copy, and concrete wiring. Split mixed code at the seam and move the reusable behavior with its why-comments. Consumers use the owning public export. Forwarding-only compatibility files are not allowed.
2. **The consuming feature owns its port.** Each feature declares only the operations and data it uses. It receives implementations as arguments or props and keeps host infrastructure and sibling implementation imports out of its source. Shared generic types and ports live in `@jini-ai/core`. New files under Core's `src/contracts` hold types only; new runtime code goes at its owning implementation path. Host-specific types stay in the host.
3. **Routes publish specs.** Define server-neutral JSON specs with `defineJsonRoute` from `@jini-ai/core/contracts/server`. Each spec uses a small route-local deps type and leaves `ports` unset. The host builds the route with `jsonRoute` and registers it on its `Server`, adding its request policy and failure mapping. `mountJsonRoute` in `@jini-ai/http-kit` is the Express compatibility adapter. A central deps type, or a `Pick` from one, ties the spec to one host.
4. **Screens receive UI and behavior through declared inputs.** Use the host-injected `@jini-ai/admin` kit for shared admin UI. Custom React hooks arrive as required props typed to the fields and calls the component uses. Use neutral prop names and keep live defaults in host composition. Take product copy through existing args or props fields.
5. **Keep effects and call shapes explicit.** Inject logging and provider operations. Keep console calls, Express types and code, vendor implementations, and host identity out of Jini feature code. Existing Express compatibility subpaths are tracked debt. Public functions and factories take `(requiredArgs, optionalArgs)` objects, keeping `_optional = {}` when the second object has no fields. Function length warns at 50 lines and errors above 80. Complexity is capped at 10.

## Consequences and current limits

Hosts can choose different providers and server adapters while keeping the same feature. Tests can supply small fakes. The host has more wiring to write, and package authors must keep contracts narrow. Existing compatibility entries and import debt are removed as their consumers migrate.

## Defect prevented

A reusable package silently selects another package's implementation, or a screen's default hook reaches into a host transport even when the screen has an injection prop.

## Source and enforcement

CI tracks exact resolved occurrences against the trusted base. New violations, expanded allowances, and stale debt entries fail the check.

- **C — Cross-package boundary.** Reject new sibling executable imports and shared type imports outside Core. Allow Core types and the approved Core runtime exports listed with the debt file. Check resolved source, declarations, and manifests.
- **D1–D4.** Reject forwarding shells, concrete or defaulted custom hooks, console/Express/vendor dependencies and host identity, and growth in size exceptions. Canonical same-package public entry points remain valid.
- Host repositories can add matching checks for their own side of the boundary.

A documentation check requires a **Wiring** section in every feature folder's `INFO.md` or `README.md`. It lists what the feature needs, what it provides, a short host wiring example, and what it must not import, and it links to this record. CI also checks that the ports it names exist.

Local evidence: [Core route spec](../../packages/core/src/contracts/server/json-route.ts), [Admin kit](../../packages/admin/src/react/kit.tsx), [Cross-package check](../../scripts/check-no-cross-package.ts), [Hardwiring check](../../scripts/check-hardwiring.ts).

## How to wire a feature

**Jini package.** A local route port and a screen that consumes a narrow hook result. `Notice` comes from the admin kit.

```tsx
type MenuRouteDeps = {
  readMenu: (required: { id: string }) => Promise<Result<{ title: string }>>;
};

export const menuRoute = defineJsonRoute<
  { id: string }, { title: string }, MenuRouteDeps
>({
  method: 'get',
  path: '/menus/:id',
  parse: parseMenuId,
  handle: ({ input, deps }, _optional = {}) => deps.readMenu({ id: input.id }),
});

type MenuScreenProps = {
  id: string;
  heading: string;
  useMenu: (required: { id: string }) => { title: string };
};

export function MenuScreen({ id, heading, useMenu }: MenuScreenProps) {
  const { title } = useMenu({ id });
  return <Notice>{heading} {title}</Notice>;
}
```

**Host.** The host adds its policy, registers the route on its `Server`, and mounts the screen with its kit, hook, and copy.

```tsx
app.route(jsonRoute(
  { spec: defineJsonRoute(menuRoute, { ports: hostRoutePorts }), deps: { readMenu: readAllowedMenu }, reportInternalError },
  { host: routeHost },
));

<AdminKitProvider kit={adminKit}>
  <MenuScreen id={menuId} heading={menuHeading} useMenu={useWiredMenu} />
</AdminKitProvider>
```

## Alternatives rejected

- **A central dependency module for everything.** A shared implementation hub couples every consumer to the same graph. Core supplies shared vocabulary and approved neutral primitives.
- **Import implementations and expose overrides with defaults.** The import still fixes a production dependency and hides a choice the host should make.
