# EXTRACT-S6 L1a — declarative content-type seam: inventory (written before implementation)

Pins: Tovu `c3801c833a191be51753dcdecd133b0cad6f8945`, Jini `4044fe3c0fa34b1f903c5d20a6b4de7714cde573`.
T = Tovu `apps/website/src/`; J = Jini `packages/`. Line numbers are at the Tovu pin (the file is
unchanged between the pin and the G-plug tip `eb72874c`).

## Origin of the transported text

| File | Git blob SHA (pin) | SHA-256 (pin bytes) | Lines |
|---|---|---|---|
| `T features/plugin-runtime/declarative-content-types.ts` | `faf0406991b847b4925b85cb703e0fc77bdec186` | `c814a4725936439f015b41d1734f9c8b80180291e4d0c29a6b95c85c525d3d01` | 355 |

Transport method: the plugin-owned blocks are carried as their original text into the new J file
`J plugins/src/host/declarative-content-types.ts` (cross-repo, so no Git rename edge). The functions
that read a CMS-owned value or the reserved-key set move inside one factory closure whose local
bindings keep the original identifiers (`CONTENT_TYPE_FIELD_KINDS`, `isContentTypeFieldKind`,
`isIndexableFieldKind`, `validateIdentifierGrammar`, `IDENTIFIER_GRAMMAR_TEXT`, `RESERVED_KEYS`),
so their bodies are byte-identical apart from indentation; the one changed expression is the
already-exists test (`instanceof ContentTypeAlreadyExistsError` → the injected classifier). The
parser is not rewritten. The T file is rewritten in place as a thin binder (≤80 code lines) that
keeps every old export name and signature.

## Destination legend

`same package` = J `@jini-ai/plugins` (`plugins/host`, universal entry); `core contract` = existing
type-only `@jini-ai/core/contracts/content-types`; `named local port` = new local contract in the
J file (`DeclaredContentTypeCms`); `host input` = value the host supplies through the factory's
required args (Tovu binds it in the T binder).

## Rows

| Symbol | Value/type | Pinned source file:line | Destination | Host vocabulary: permission names, ids, paths — injected OR justified | @agent-note obligations | Caller/proof |
|---|---|---|---|---|---|---|
| `@file` header: Tier-1 grammar purpose, ADR-024 §1/§5, AW-7 | comment | `T declarative-content-types.ts:1-11` | same package (J file `@file`), short pointer kept in T binder header | `tovu.plugin.json` file name → stays in T binder header only (host manifest alias); J says "the plugin manifest" | none (prose) | comment map below |
| Rules header: create-if-missing/never overwrite, tombstone terminal, retain on disable | comment | `T :12-20` | same package (J `@file` and beside `plan`/`apply`) | none, inspected (INV-06 / ADR-023/024 are domain rule names) | `apply` note: never removes, never overwrites | G-plug 3 `keep`/`conflict`/`tombstone`; T unit tests |
| Rules header: **Owner `site`** storage envelope | comment (host storage obligation) | `T :21-24` | **T binder rule** (header + `@agent-note`); J `DeclaredContentTypeWritePorts.register` note states the host chooses the envelope | `ext.site` envelope, "AW-7 report": host storage envelope, stays Tovu; J never names an envelope | J `register`: the provisioner passes no owner/envelope; the host's `register` decides where types are stored and must store them where the host's readers look | `T server/runtime/composition/declared-content-types.ts` (unchanged) registers with no owner; G-plug 3 `create` |
| "Pure parsing; plan/apply I/O only through ports" | comment | `T :26` | same package (`@file`) | none, inspected | factory note: no I/O except through supplied ports | — |
| `CONTENT_TYPE_FIELD_KINDS` | value (cms) | `T :29` | host input `cms.fieldKinds` (named local port) | CMS field-kind vocabulary → injected | `fieldKinds`: the host's closed kind list, printed in the diagnostic in this order | NEW J test second host (different kinds); T binder passes cms value |
| `ContentTypeAlreadyExistsError` | value (cms class) | `T :30,353` | host input `cms.isAlreadyExists({ error })` classifier | CMS error identity → injected classifier; no `instanceof` in J | `isAlreadyExists`: only the host's own lost-create-race error returns true; anything else is rethrown unchanged | NEW J test unrelated error rethrown; G-plug 3 `concurrentCreate.unrelated-error` |
| `isContentTypeFieldKind` | value (cms fn) | `T :31,102` | host input `cms.isFieldKind` | injected | called detached, pure, synchronous | NEW J test; T unit tests |
| `isIndexableFieldKind` | value (cms fn) | `T :32,117` | host input `cms.isIndexable` | injected | pure; decides queryable admissibility | NEW J test (storage-only kind refused) |
| `validateIdentifierGrammar` | value (cms fn) | `T :33,97,153` | host input `cms.validateIdentifier` | injected | pure; same grammar the host's write path enforces | NEW J test |
| `ContentTypeFieldDef`, `ContentTypeFieldKind`, `ContentTypeRecord` | types | `T :34-36` | core contract `@jini-ai/core/contracts/content-types` (cms already re-exports these same types from core) | none, inspected | — | J tsc; T tsc (identical types) |
| `SYSTEM_CONTENT_TYPES` | value (T contract) | `T :38,56` | stays T; host input via `reservedKeys` | `widget`, `widget_area`, nav menu type: host system types → injected | `reservedKeys`: the host's own system/reserved keys | T binder; T unit test reserved-key cases |
| `PluginInvalidError` | value (class) | `T :40,320` | same package `./activation.js` (canonical, no replacement) | none, inspected | `apply` throws the canonical class | NEW J test `instanceof`; NEW J test through package entry; G-plug 3 `canonicalPluginInvalidError` |
| `PluginManifest` (type import) | type | `T :41` | not transported: unused import (only mentioned in a comment at `:200`) | none, inspected | — | J/T tsc |
| `PluginValidationError` | type | `T :41` | same package `./manifest-types.js` | none, inspected | — | J tsc |
| `MAX_DECLARED_CONTENT_TYPES` = 20 | value | `T :43-44` | same package (exported), T re-exports | plugin-domain bound (ADR-024 §5), justified, not an option | — | T unit test imports it; NEW J test |
| `MAX_DECLARED_FIELDS` = 50 | value | `T :45-46` | same package (exported), T re-exports | plugin-domain bound, justified | — | T unit test |
| `MAX_DECLARED_QUERYABLE_FIELDS` = 20 | value | `T :47-50` | same package (exported), T re-exports | mirrors the CMS write path's queryable cap; kept as the declaration bound (brief: keep 20/50/20), justified | note: a host whose write path allows fewer queryable fields refuses at register | T unit test |
| `MAX_LABEL_LENGTH` = 100 | value (internal) | `T :51` | same package (internal) | plugin-domain bound, justified | — | T unit tests (label cases) |
| `IDENTIFIER_GRAMMAR_TEXT` = `"^[a-z][a-z0-9_]{0,63}$"` | value (internal) | `T :52` | host input `cms.identifierGrammar` (text printed in diagnostics) | describes the CMS identifier grammar → injected; T binds these exact bytes | `identifierGrammar`: human-readable form of `validateIdentifier`, printed verbatim | T unit tests (exact diagnostic text); G-plug goldens |
| `RESERVED_KEYS` | value (Set) | `T :54-56` | **factory closure** `new Set(requiredArgs.reservedKeys)` (copied once per factory call) | `post`, `page` + system types → required host input; T binds `["post","page",...SYSTEM_CONTENT_TYPES]` | `reservedKeys`: required, copied at creation; separate factory calls have separate sets; later mutation of the caller's array has no effect | NEW J test: two instances, different sets, mutation isolation |
| `DECL_KEYS`, `FIELD_KEYS` | values (Set) | `T :57-58` | same package (internal) | manifest declaration grammar (plugin domain), justified | — | T unit tests (unknown-key cases) |
| `DeclaredContentType` | interface | `T :60-65` | same package `DeclaredContentTypeDefinition extends DeclaredContentType` (ports.ts opaque shape reused, fields narrowed to core `ContentTypeFieldDef`); T keeps `DeclaredContentType` as a type alias | none, inspected | — | J tsc assignability to `DeclarativeContentTypesPort` (NEW J test); T tsc (host-binding.ts unchanged) |
| `ParseDeclaredContentTypesResult` | interface | `T :67-70` | same package, same name (no barrel collision, inspected); T re-exports type | none, inspected | — | T tsc |
| `declError` / code `CONTENT_TYPE_DECL_INVALID` | fn (internal) | `T :72-74` | same package (internal) | plugin-domain error code, justified | — | T unit tests; G-plug goldens |
| `isRecord` | fn (internal) | `T :76-78` | same package (internal) | none, inspected | — | — |
| `unknownKeyErrors` | fn (internal) | `T :80-84` | same package (internal) | none, inspected | — | T unit tests |
| `optionalFlag` | fn (internal) | `T :86-92` | same package (internal) | `required`/`queryable` field flags: declaration grammar, justified | — | T unit tests |
| `fieldIdentity` | fn (internal) | `T :94-107` | factory closure (reads cms) | none beyond injected cms values | — | T unit tests; NEW J test |
| `parseField` | fn (internal) | `T :109-122` | factory closure (reads `isIndexableFieldKind`) | none, inspected | — | T unit tests |
| `duplicateNames` | fn (internal) | `T :124-132` | same package (internal) | none, inspected | — | T unit tests |
| `parseFields` | fn (internal) | `T :134-149` | factory closure (calls `parseField`) | none, inspected | — | T unit tests |
| `keyErrors` incl. text "is reserved by core" | fn (internal) + literal | `T :151-156` | factory closure (reads `RESERVED_KEYS`, cms) | "core" is neutral wording (no product name), kept byte-identical, justified | — | T unit tests (exact text); NEW J test with other reserved key |
| `labelValid` | fn (internal) | `T :158-160` | same package (internal) | none, inspected | — | T unit tests |
| `parseDecl` | fn (internal) | `T :162-172` | factory closure | `contentTypes[...]` manifest key in text: plugin manifest grammar, justified | — | T unit tests |
| `parseDeclaredContentTypes` | exported fn | `T :174-194` | factory member `parse` (closure fn of the same name); T keeps `export function parseDeclaredContentTypes(required, _optional = {})` delegating | `'contentTypes'` key: plugin manifest grammar, justified | `parse`: collect-all, never throws, `undefined`/`null` declare nothing | T unit; G-plug 3; NEW J test |
| `CODE_SURFACES` | value (internal) | `T :196-197` | same package (internal) | manifest keys `capabilities`/`hooks`/`fields`: plugin manifest grammar, justified | — | T unit tests |
| `DeclarativeManifestView` | interface | `T :199-207` | same package, same name (no collision, inspected); T re-exports type | none, inspected | — | T tsc |
| `validateDeclarativeManifest` / code `TIER1_DECLARES_CODE_SURFACE`, literal `"tier-1"` | exported fn | `T :209-231` | factory member `validateManifest`; T keeps old export delegating | tier names and error code are plugin-domain, justified | `validateManifest`: surface errors first, then declaration errors | T unit; host-binding.unit |
| `DeclaredContentTypePorts` | interface | `T :233-247` | same package `DeclaredContentTypeWritePorts` (concrete; ports.ts keeps opaque `DeclaredContentTypePorts`, no rename); T keeps `DeclaredContentTypePorts` as type alias | `registerContentType` is the host write path (named only in prose as "the host's write path") | `findByKey`: host read in the enabling workspace, `null` when absent; `register`: one host write per call, returns `{ ok:false, error }` for an expected rejection rather than throwing; actor id is `plugin:<id>`; the host owns authorization, envelope and revision attribution | `T server/runtime/composition/declared-content-types.ts` imports the T alias (unchanged) |
| `DeclaredContentTypeOutcome` | type | `T :249` | same package, same name (no collision, inspected); T re-exports type | none, inspected | — | T tsc |
| `DeclaredContentTypePlan` | interface | `T :251-255` | same package `DeclaredContentTypeDefinitionPlan extends DeclaredContentTypePlan` (ports.ts opaque); T keeps old name as alias | none, inspected | plan: conflicts non-empty ⇒ items empty | T unit; G-plug 3 `conflict` |
| `incompatibilities` | fn (internal) | `T :257-269` | same package (internal) | none, inspected | — | T unit; G-plug 3 |
| `planDeclaredContentTypes` | exported fn | `T :271-295` | same package (module-level, not exported; factory member `plan`); T keeps old export delegating | none, inspected | `plan`: read-only, one `findByKey` per declaration in declaration order; writes nothing | G-plug 3 `conflict` writes nothing; T unit |
| `ApplyDeclaredContentTypesResult` | interface | `T :297-301` | same package, same name (no collision, inspected); T re-exports type | none, inspected | — | T unit |
| `judgeLostRace` | fn (internal) | `T :303-322` | same package (module-level, internal) | none, inspected | — | G-plug 3 `concurrentCreate.*`; NEW J test |
| `applyDeclaredContentTypes` | exported fn | `T :324-344` | factory member `apply` (closure fn of the same name); T keeps old export delegating | actor grammar `plugin:<id>` is the plugin-domain actor format (brief), justified | `apply`: sequential in plan order; lost race judged only via `cms.isAlreadyExists`; other errors rethrown as-is; never removes or overwrites a type | G-plug 3; NEW J tests |
| `createDeclared` | fn (internal) | `T :346-355` | factory closure (reads `cms.isAlreadyExists`) | `plugin:${pluginId}` actor, justified (domain) | — | G-plug 3 |
| NEW `DeclaredContentTypeCms` | interface (named local port) | — | same package | fields `fieldKinds`, `isFieldKind`, `isIndexable`, `validateIdentifier`, `identifierGrammar`, `isAlreadyExists({ error })`; no CMS import | every member: what fulfills it, purity, detached call, error identity | NEW J second-host test |
| NEW `DeclarativeContentTypes` | interface (factory result) | — | same package | none | members `validateManifest`/`parse`/`plan`/`apply`; assignable to `DeclarativeContentTypesPort` | NEW J test passes it to `enableDeclaredPlugin` |
| NEW `createDeclarativeContentTypes(requiredArgs: { cms, reservedKeys }, optionalArgs = {})` | exported fn | — | same package, exported from `plugins/host` barrel | none | per-instance reserved set; no I/O at creation | NEW J test; plain Node smoke; T binder |
| Emitted declarations | `.d.ts` | — | `J plugins/dist/host/declarative-content-types.d.ts` + `dist/host/index.d.ts` `export *` | none | @agent-notes must appear in emitted `.d.ts` | grep of built `.d.ts` in the gate |

## Comment map (origin → destination)

| Origin (T pin) | Destination |
|---|---|
| `:1-11` `@file` purpose (ADR-024 §1/§5, AW-7, bounded grammar, idempotent provisioner) | J file `@file` (transported; the manifest file name and the `Jini/packages/plugins/src/host/manifest.ts` self-path are written as "the plugin manifest" / "`manifest.ts`"); T binder header keeps one-line pointer incl. `tovu.plugin.json` |
| `:12-20` rules: create-if-missing, tombstone, retain | J `@file` (transported verbatim) |
| `:21-24` Owner `site` envelope | T binder header (transported verbatim) as host rule + `@agent-note`; J `register` note |
| `:26` pure parsing note | J `@file` |
| `:43`, `:45`, `:47-49` bound docs | J beside each constant (verbatim) |
| `:54-55` reserved keys doc | T binder beside `reservedKeys` input (verbatim); J `reservedKeys` note |
| `:60`, `:94`, `:109`, `:162`, `:174-179`, `:196`, `:199-200`, `:209-217`, `:233-237`, `:253`, `:257`, `:271-276`, `:303-311`, `:324-329`, `:346` | J beside the same code (verbatim) |

## Caller search (Jini pin, packages + examples)

Run at Jini `4044fe3c` over `packages/` and `examples/` (excluding `node_modules`/`dist`) for
`MAX_DECLARED`, `ParseDeclaredContentTypesResult`, `DeclarativeManifestView`,
`createDeclarativeContentTypes`, `ApplyDeclaredContentTypesResult`, `DeclaredContentTypeOutcome`,
`DeclaredContentTypeCms`, `parseDeclaredContentTypes`, `planDeclaredContentTypes`,
`applyDeclaredContentTypes`, `validateDeclarativeManifest`: **no match** — no executable Jini caller of
the moved code and no barrel-name collision. Existing users of the opaque `ports.ts` names
(`DeclarativeContentTypesPort`, `DeclaredContentType`, `DeclaredContentTypePlan`,
`DeclaredContentTypePorts`): `plugins/src/host/{declarative-enable,manifest,plugin-claims,node/install}.ts`
and existing tests — all unchanged; the new concrete types extend/are assignable to them.
`@jini-ai/plugins` has no `@jini-ai/cms` import or dependency (inspected) and none is added;
`@jini-ai/core/contracts/content-types` exists at the pin (`core/package.json` export, universal,
type-only) and `@jini-ai/plugins` already depends on `@jini-ai/core`.
Tovu callers of the T module: `features/plugin-runtime/host-binding.ts:13`,
`server/runtime/composition/declared-content-types.ts:11`, and the existing
`declarative-content-types.unit.test.ts` — all keep their imports unchanged.
No prerequisite and no owner-import-rule conflict found.

## Resolution (after implementation)

Every row above is resolved as listed; no row needed a design stop.

- Jini: `d775c681` (new `plugins/src/host/declarative-content-types.ts`, `export *` added to
  `plugins/src/host/index.ts`), `01b36f27` (NEW test
  `plugins/src/host/__tests__/unit/declarative-content-types.extract-s6.unit.test.ts`, changeset
  `.changeset/extract-s6-l1a-plugins-host.md`), `1f7bcbe1` (@agent-notes on every exported item).
- Tovu: `f700769d` — `features/plugin-runtime/declarative-content-types.ts` is a binder (54 code
  lines) keeping every old export/signature; `host-binding.ts` and
  `server/runtime/composition/declared-content-types.ts` unchanged.
- Emitted declarations: `@jini-ai/plugins/dist/host/declarative-content-types.d.ts` carries all 28
  `@agent-note` blocks; `dist/host/index.d.ts` re-exports the module.
- Transport check: the closure bodies differ from the pin only by indentation, the
  `DeclaredContentType`/`DeclaredContentTypePlan`/`DeclaredContentTypePorts` → concrete J names,
  and `!(result.error instanceof ContentTypeAlreadyExistsError)` →
  `!isAlreadyExists({ error: result.error })`.
