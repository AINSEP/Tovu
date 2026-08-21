# REFACTOR: widget-type registry — total vs. partial lookup split

- Date: 2026-08-20
- Branch: `general-work`
- Commits: `df815685` (accessor split), `76b70fc6` (satisfies + generic accessor)
- Dispatcher: team-lead (owner directive: a lookup that returns `| undefined` when it cannot
  actually return `undefined` forces permanently-uncoverable defensive code at every caller)

## Summary

`src/widgets/registry.ts`'s `getWidgetTypeRegistration(typeKey: WidgetTypeKey)` returned
`WidgetTypeRegistration | undefined` even though `WidgetTypeKey` is a closed 5-value union and the
backing table had exactly 5 entries — a lookup that was total in reality but partial in its type.
Verifying the 4 real (non-test) callers before touching anything found the fix was **not** "make the
lookup total everywhere": 3 of the 4 callers hold a `WidgetTypeKey`-typed value that is only
*asserted*, not proven, via an unchecked cast at an HTTP-body or storage boundary — `undefined` is
genuinely reachable there, and existing tests already prove it by firing an out-of-union `'carousel'`
value. Only one caller (`recent-entries.ts`'s literal `"recent-entries"`) was genuinely total.

## Design landed

- `WIDGET_TYPE_REGISTRATIONS`: array → object literal keyed by `WidgetTypeKey`, declared with
  `satisfies Readonly<Record<WidgetTypeKey, WidgetTypeRegistration>>` (not a `:` annotation, so each
  entry keeps its own literal shape rather than widening to the shared interface).
- `getWidgetTypeRegistration<K extends WidgetTypeKey>(typeKey: K): (typeof WIDGET_TYPE_REGISTRATIONS)[K]`
  — total, generic over the key. Only caller: `resolvers/recent-entries.ts:39` (a literal).
- New `findWidgetTypeRegistration(raw: string): WidgetTypeRegistration | undefined` — partial, for a
  value that's merely *asserted* to be a `WidgetTypeKey`. Callers: `write-service.ts:148` (create,
  off `input.widgetType` — cast from HTTP body in `server/routes/admin/widgets/create.ts:21`),
  `write-service.ts:216` (update, off `currentPayload.widgetType` — cast from `JSON.parse(...)` in
  `entry-payload.ts:97`), `resolvers/index.ts:188` (dispatch, off the same JSON-decoded storage path
  via `resolver-service.ts:143`).
- `agent-tools.ts:80` and `registry.unit.test.ts`'s array-iterating assertions moved to
  `Object.values(WIDGET_TYPE_REGISTRATIONS)`.
- `registry.unit.test.ts`'s `@ts-expect-error`-guarded `getWidgetTypeRegistration("carousel")`
  assertion retargeted to `findWidgetTypeRegistration("carousel")` — same assertion, same reason,
  `@ts-expect-error` removed because it's genuinely no longer needed (the function takes `string`).

### The second-order finding

Fixing the lookup alone left `recent-entries.ts` with `registration?.clamps.maxItems ?? 20`'s `?.`
gone but `?? 20` still uncoverable: `WidgetTypeRegistration.clamps.maxItems` is `number | undefined`
on the *shared* interface — real for 4 of 5 registered types — even though
`RECENT_ENTRIES_REGISTRATION`'s own literal data always sets it. Same species of bug, one field
deeper. Closed by declaring each registration constant with `satisfies WidgetTypeRegistration`
(preserving its own literal shape) and making `getWidgetTypeRegistration` generic over the key, so a
literal call site's return type carries that registration's own exact shape instead of the shared
interface's. `recent-entries.ts` now reads `.clamps.maxItems` with no fallback at all.

## Verification

- `npx tsc --noEmit -p tsconfig.json`: clean after both commits. No cast, `!`, or
  `@ts-expect-error` introduced anywhere in the change.
- `TEST_CONCURRENCY=2 node --import tsx --test --test-concurrency=2 "src/widgets/**/*.test.ts"`:
  168/168 pass, unchanged, before and after both commits.
- Coverage (`--experimental-test-coverage`, lcov, scoped to `src/widgets/**/*.test.ts`) for
  `src/widgets/resolvers/recent-entries.ts`:
  | | BRF (total branches) | BRH (hit) | zero-hit |
  |---|---|---|---|
  | before | 11* | 9 | 2 |
  | after commit 1 (`df815685`) | 10 | 9 | 1 |
  | after commit 2 (`76b70fc6`) | 9 | 9 | **0** |

  \* Reconstructed: the original `registration?.clamps.maxItems ?? 20` compiles to two separate
  short-circuit branch groups (`?.`'s null-check, `??`'s null-check); both had a permanently-zero-hit
  outcome, since every test path had `registration` defined and `maxItems` set. Not independently
  re-measured against the pre-change file to avoid touching the working tree mid-task; the
  post-commit-1 and post-commit-2 numbers above are both directly measured.

## Sweep: every other `): T | undefined {` in `src/`

Scope: every top-level/exported function in `src/**/*.ts` (excluding `*.test.ts`) whose return type
is `T | undefined`. Grep found ~70; the ones with an `unknown`/`string`/`Request`/JSON-shaped
parameter were set aside first (parsers and coercions over untrusted input — genuinely partial by
construction, e.g. `parseOptionalStringField`, `extractGitHubLogin`, `optionalString`/`optionalBoolean`
helpers across the credential stores). The remainder — candidates whose parameter is a *typed*
value, closer in shape to the registry bug — were checked individually:

| Function | File | Verdict | Reason |
|---|---|---|---|
| `findCapabilityEntry` | `server/capability-inventory.ts` | partial, correct | `CapabilityInventoryEntry.name` is declared plain `string`, not a union — genuinely open-ended key |
| `resolveVerifySuccess` / `resolveNextStatus` | `features/database/migrate-forward/state-machine.ts` | partial, correct | keyed by the closed `TransitionEvent["type"]` union (total on that axis), but each handler's `undefined` depends on `state.status` — a much wider runtime value the key doesn't determine. Exhaustively property-tested |
| `resolveDocNodeHandler` | `server/http/site/render.ts:1024` | partial, correct | `DOC_NODE_HANDLERS: Record<string, DocNodeHandler>` is an **open** table by design — comment explicitly documents an unrecognized `type` falling through to a default render path, not a closed union. Closest look-alike to the registry bug; most likely false positive for a future sweep |
| `mergeExt` | `features/post/post.ts:392` | partial, correct | merges two optional `JsonObject`s; `undefined` is a real result when both inputs are absent |
| `resolveExistingCharge` | `features/plugins/lipay/lipay-plugin.ts:373` | partial, correct | first param is already `PaymentRow \| undefined` — not a union-key lookup |
| `drainChildren` | `features/theme/liquid-allowlist.ts:231` | partial, correct | returns `undefined` when a DOM-like node has no children array — structural/runtime check, not a table lookup |
| `getSlugChangeCapture` | `routing/routing.ts:411` | partial, correct | test-instrumentation singleton getter, genuinely unset until a capture is installed |
| `buildCapabilityGuidance` | `features/source-control/tool-registrations.ts:351` / `deployments/publish-agent-tools.ts:197` | partial, correct | branches on a `{configured} \| {status}` runtime value, not a union-key lookup |
| `renderStaticTierHomePage` | `server/http/site/render.ts:2278` | partial, correct | `undefined` is the real "fall through to the ordinary render path" signal per its own doc comment |
| `mergeGoogleOneOf` | `assistant/byok-provider-turn.ts:476` | partial, correct | `undefined` distinguishes "nothing to merge" from "merged to empty array" — a real three-way result, not a lookup |
| `firstExportFailure` / `firstExportFailureLazily` | `export/site-exporter.ts:222`, `deployments/static-publish/{commit-site,adapter}.ts` | partial, correct | finds the first failure in a report that may have none — genuinely optional (owner pre-confirmed) |
| `DiscoveredTheme` parsers | `features/theme/theme.ts:1275`, `server/routes/admin/themes/explore.ts:95` | partial, correct | discovering a theme from the filesystem; a theme directory may not exist or may not parse |
| credential/history lookups | `deployments/static-publish/verify.ts:364,574`, `publish-run.ts:120` | partial, correct | keyed by dynamic runtime values (workspace id, external API response shape, history entry id) — not closed unions |

**Conclusion: `widgets/registry.ts` was the only dishonest instance of this pattern in `src/`.**
Every other `T | undefined` return checked is genuinely partial — either parsing/coercing untrusted
input, keyed by a real open-ended value, or conditioned on runtime state wider than its parameter
type. No further action recommended from this sweep.
